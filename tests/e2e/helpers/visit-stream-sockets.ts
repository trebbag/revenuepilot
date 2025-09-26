import type { Page } from '@playwright/test'

const rawTranscribeFlag = String(process.env.USE_REAL_TRANSCRIBE_SOCKET ?? '').trim().toLowerCase()
export const USE_REAL_TRANSCRIBE_SOCKET = rawTranscribeFlag === 'true' || rawTranscribeFlag === '1'

type VisitStreamHarness = {
  readonly useRealTranscribe: boolean
  readonly mockSockets: Array<{
    url: string
    emit: (type: 'message', event: MessageEvent) => void
  }>
  transcribeSocket: WebSocket | null
  waitForTranscribeOpen: (timeoutMs?: number) => Promise<void>
  emitMockMessage: (segment: string, payload: unknown) => void
  emitMockTranscription: (events: unknown[]) => void
}

const HARNESS_INIT_TIMEOUT_MS = 10_000

/**
 * Injects a WebSocket shim that keeps the codes/compliance/collaboration channels mocked
 * while optionally letting transcription traffic hit the real /api/transcribe/stream endpoint.
 */
export async function configureVisitStreamSockets(page: Page) {
  await page.addInitScript(
    ({ useRealTranscribe }) => {
      const OriginalWebSocket = window.WebSocket

      type MockListenerMap = Record<string, Array<(event: Event) => void>>

      const harness = {
        useRealTranscribe,
        mockSockets: [] as Array<{
          url: string
          emit: (type: 'message', event: MessageEvent) => void
          listeners: MockListenerMap
        }>,
        transcribeSocket: null as WebSocket | null,
        transcribeWaiters: [] as Array<(socket: WebSocket) => void>,
        transcribeTimeouts: [] as Array<ReturnType<typeof setTimeout>>,
        resolveTranscribeWaiters(socket: WebSocket) {
          const waiters = this.transcribeWaiters.slice()
          this.transcribeWaiters.length = 0
          this.transcribeTimeouts.splice(0).forEach(clearTimeout)
          waiters.forEach(resolve => {
            try {
              resolve(socket)
            } catch {
              /* ignore individual waiter errors */
            }
          })
        },
        waitForTranscribeOpen(timeoutMs = HARNESS_INIT_TIMEOUT_MS) {
          if (!this.useRealTranscribe) {
            return Promise.resolve()
          }
          const active = this.transcribeSocket
          if (active && active.readyState === OriginalWebSocket.OPEN) {
            return Promise.resolve()
          }
          return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              const index = this.transcribeWaiters.indexOf(onReady)
              if (index >= 0) {
                this.transcribeWaiters.splice(index, 1)
              }
              reject(new Error('Timed out waiting for real transcription socket to open'))
            }, Math.max(100, timeoutMs))
            const onReady = () => {
              resolve()
            }
            this.transcribeTimeouts.push(timer)
            this.transcribeWaiters.push(onReady)
          })
        },
        registerMockSocket(socket: any) {
          this.mockSockets.push(socket)
        },
        registerTranscribeSocket(socket: WebSocket) {
          this.transcribeSocket = socket
          if (socket.readyState === OriginalWebSocket.OPEN) {
            this.resolveTranscribeWaiters(socket)
          } else {
            const handleOpen = () => {
              socket.removeEventListener('open', handleOpen)
              if (this.transcribeSocket === socket) {
                this.resolveTranscribeWaiters(socket)
              }
            }
            socket.addEventListener('open', handleOpen)
          }
          socket.addEventListener('close', () => {
            if (this.transcribeSocket === socket) {
              this.transcribeSocket = null
            }
          })
        },
        findMockSocket(segment: string) {
          return this.mockSockets.find(candidate =>
            typeof candidate.url === 'string' && candidate.url.includes(segment),
          )
        },
        emitMockMessage(segment: string, payload: unknown) {
          const socket = this.findMockSocket(segment)
          if (!socket) {
            throw new Error(`No mock socket registered for segment ${segment}`)
          }
          const data = payload instanceof MessageEvent ? payload.data : payload
          const serialised = typeof data === 'string' ? data : JSON.stringify(data)
          const event = new MessageEvent('message', { data: serialised })
          socket.emit('message', event)
        },
        emitMockTranscription(events: unknown[]) {
          const socket = this.findMockSocket('/api/transcribe/stream') ?? this.mockSockets[0]
          if (!socket) {
            throw new Error('No mock transcription socket available')
          }
          for (const payload of events) {
            const serialised =
              typeof payload === 'string' ? payload : JSON.stringify(payload)
            const event = new MessageEvent('message', { data: serialised })
            socket.emit('message', event)
          }
        },
      }

      class MockSocket {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        url: string
        readyState = MockSocket.CONNECTING
        listeners: MockListenerMap = {}
        onopen: ((event: Event) => void) | null = null
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: Event) => void) | null = null
        onclose: ((event: CloseEvent) => void) | null = null

        constructor(url: string) {
          this.url = url
          harness.registerMockSocket(this)
          setTimeout(() => {
            this.readyState = MockSocket.OPEN
            const event = new Event('open')
            this.onopen?.(event)
            this.listeners['open']?.forEach(listener => listener(event))
          }, 0)
        }

        addEventListener(type: string, handler: (event: any) => void) {
          if (!this.listeners[type]) {
            this.listeners[type] = []
          }
          this.listeners[type]?.push(handler as (event: Event) => void)
        }

        removeEventListener(type: string, handler: (event: any) => void) {
          if (!this.listeners[type]) {
            return
          }
          this.listeners[type] = this.listeners[type]!.filter(listener => listener !== handler)
        }

        emit(type: 'message', event: MessageEvent) {
          this.onmessage?.(event)
          this.listeners[type]?.forEach(listener => listener(event))
        }

        send() {}

        close() {
          if (this.readyState === MockSocket.CLOSED) {
            return
          }
          this.readyState = MockSocket.CLOSED
          const event = new CloseEvent('close', { code: 1000 })
          this.onclose?.(event)
          this.listeners['close']?.forEach(listener => listener(event))
        }
      }

      const VisitSocket = function (this: any, url: string, protocols?: string | string[]) {
        const wantsRealSocket =
          !!useRealTranscribe && /\/api\/transcribe\/stream(?:\?|$)/.test(url)
        if (wantsRealSocket) {
          const socket = new OriginalWebSocket(url, protocols as any)
          harness.registerTranscribeSocket(socket)
          return socket
        }
        return new MockSocket(url)
      } as unknown as typeof WebSocket

      VisitSocket.CONNECTING = MockSocket.CONNECTING
      VisitSocket.OPEN = MockSocket.OPEN
      VisitSocket.CLOSING = MockSocket.CLOSING
      VisitSocket.CLOSED = MockSocket.CLOSED
      VisitSocket.prototype = OriginalWebSocket.prototype

      Object.defineProperty(window, '__mockSockets', {
        configurable: true,
        get() {
          return harness.mockSockets
        },
      })

      Object.defineProperty(window, '__visitStreamHarness', {
        configurable: true,
        get() {
          return harness as VisitStreamHarness
        },
      })

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: VisitSocket,
      })
    },
    { useRealTranscribe: USE_REAL_TRANSCRIBE_SOCKET },
  )
}

async function evaluateHarness<T, Arg>(
  page: Page,
  callback: (arg: Arg) => T | Promise<T>,
  arg: Arg,
): Promise<T> {
  return page.evaluate(callback, arg)
}

export async function waitForVisitStreamHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window !== 'undefined' && !!(window as any).__visitStreamHarness)
}

export async function waitForMockSocketCount(page: Page, expected: number): Promise<void> {
  await page.waitForFunction(
    target => {
      const harness = (window as any).__visitStreamHarness as VisitStreamHarness | undefined
      return Boolean(harness && Array.isArray(harness.mockSockets) && harness.mockSockets.length >= target)
    },
    expected,
  )
}

export interface VisitStreamPayloadOptions {
  complianceIssue?: string
  codeSuggestion?: { code: string; description: string }
  collaborationParticipants?: Array<{ userId: string; name: string }>
  collaborationConflicts?: string[]
  transcription?: {
    interimText: string
    finalText: string
    stopDelayMs?: number
  }
}

const DEFAULT_TRANSCRIPTION = {
  interimText: 'interim patient note',
  finalText: 'final patient note',
  stopDelayMs: 200,
}

const DEFAULT_OPTIONS: Required<VisitStreamPayloadOptions> = {
  complianceIssue: 'Add ROS to complete documentation.',
  codeSuggestion: { code: 'Z1234', description: 'Streaming code' },
  collaborationParticipants: [{ userId: 'abc', name: 'Dr Demo' }],
  collaborationConflicts: ['Simultaneous edits detected'],
  transcription: DEFAULT_TRANSCRIPTION,
}

export async function deliverVisitStreamPayloads(
  page: Page,
  overrides: VisitStreamPayloadOptions = {},
): Promise<void> {
  const options = {
    complianceIssue: overrides.complianceIssue ?? DEFAULT_OPTIONS.complianceIssue,
    codeSuggestion: overrides.codeSuggestion ?? DEFAULT_OPTIONS.codeSuggestion,
    collaborationParticipants:
      overrides.collaborationParticipants ?? DEFAULT_OPTIONS.collaborationParticipants,
    collaborationConflicts:
      overrides.collaborationConflicts ?? DEFAULT_OPTIONS.collaborationConflicts,
    transcription: {
      interimText: overrides.transcription?.interimText ?? DEFAULT_OPTIONS.transcription.interimText,
      finalText: overrides.transcription?.finalText ?? DEFAULT_OPTIONS.transcription.finalText,
      stopDelayMs: overrides.transcription?.stopDelayMs ?? DEFAULT_OPTIONS.transcription.stopDelayMs,
    },
  }

  await evaluateHarness(page, async options => {
    const harness = (window as any).__visitStreamHarness as VisitStreamHarness | undefined
    if (!harness) {
      throw new Error('visit stream harness not initialised')
    }

    const emitAncillaryStreams = () => {
      harness.emitMockMessage('/ws/compliance', {
        eventId: 2,
        issues: [
          {
            title: 'Live compliance alert',
            description: options.complianceIssue,
            severity: 'warning',
          },
        ],
      })
      harness.emitMockMessage('/ws/codes', {
        eventId: 3,
        code: options.codeSuggestion.code,
        description: options.codeSuggestion.description,
        rationale: 'Suggested from live encounter',
      })
      harness.emitMockMessage('/ws/collaboration', {
        eventId: 4,
        participants: options.collaborationParticipants,
      })
      harness.emitMockMessage('/ws/collaboration', {
        eventId: 5,
        conflicts: options.collaborationConflicts,
      })
    }

    if (!harness.useRealTranscribe) {
      harness.emitMockTranscription([
        { event: 'connected', sessionId: 'ws-trans' },
        {
          eventId: 0,
          transcript: options.transcription.interimText,
          isInterim: true,
          speakerLabel: 'patient',
        },
        {
          eventId: 1,
          transcript: options.transcription.finalText,
          isInterim: false,
          speakerLabel: 'patient',
        },
      ])
      emitAncillaryStreams()
      return
    }

    await harness.waitForTranscribeOpen()
    const socket = harness.transcribeSocket
    if (!socket) {
      throw new Error('Real transcription socket unavailable after wait')
    }

    const encoder = new TextEncoder()
    const interimBytes = encoder.encode(options.transcription.interimText)
    const finalBytes = encoder.encode(options.transcription.finalText)

    socket.send(interimBytes)
    await new Promise(resolve => setTimeout(resolve, 100))
    socket.send(finalBytes)
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, options.transcription.stopDelayMs ?? 200)),
    )
    socket.send(JSON.stringify({ event: 'stop' }))

    emitAncillaryStreams()
  }, options)
}
