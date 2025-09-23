import { test, expect } from '@playwright/test'

declare global {
  interface Window {
    __mockSockets?: Array<{
      emit: (type: 'message', event: MessageEvent) => void
    }>
  }
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

test.describe('Suggestion panel live websocket indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const sockets: any[] = []

      class MockSocket {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        url: string
        readyState = MockSocket.CONNECTING
        listeners: Record<string, Array<(event: Event) => void>> = {}
        onopen: ((event: Event) => void) | null = null
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: Event) => void) | null = null
        onclose: ((event: CloseEvent) => void) | null = null

        constructor(url: string) {
          this.url = url
          sockets.push(this)
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

      Object.defineProperty(window, '__mockSockets', {
        configurable: true,
        writable: false,
        value: sockets,
      })

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: MockSocket as unknown as typeof WebSocket,
      })
    })

    await page.route('**/health', route => route.fulfill({ status: 200, body: 'ok' }))
    await page.route('**/auth/policy', route => route.fulfill({ json: { lockoutThreshold: 5, lockoutDurationSeconds: 900 } }))
    await page.route('**/api/user/profile', route =>
      route.fulfill({
        json: {
          currentView: 'app',
          clinic: 'Demo Clinic',
          preferences: { language: 'en', timezone: 'UTC' },
          uiPreferences: { noteEditor: 68, suggestionPanel: 32 },
        },
      }),
    )
    await page.route('**/api/user/current-view', route =>
      route.fulfill({ json: { currentView: 'app' } }),
    )
    await page.route('**/settings', route =>
      route.fulfill({ json: { theme: 'modern', categories: {} } }),
    )
    await page.route('**/beautify', route =>
      route.fulfill({ json: { beautified: 'Beautified content' } }),
    )
    await page.route('**/suggest', route =>
      route.fulfill({
        json: {
          codes: [{ code: '99213', description: 'Office visit' }],
          compliance: [],
          publicHealth: [],
          differentials: [],
          followUp: null,
        },
      }),
    )
    await page.route('**/api/visits/session', route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            sessionId: 11,
            status: 'active',
            startTime: '2024-01-01T00:00:00',
            durationSeconds: 0,
            lastResumedAt: '2024-01-01T00:00:00',
          },
        })
      }
      return route.fulfill({
        json: {
          sessionId: 11,
          status: 'paused',
          startTime: '2024-01-01T00:00:00',
          endTime: null,
          durationSeconds: 120,
        },
      })
    })

    const authResponse = await page.request.post('http://127.0.0.1:4010/api/auth/login', {
      data: {
        username: 'clinician@exampleclinic.com',
        password: 'Clinician123!',
        rememberMe: true,
      },
    })
    const authPayload = await authResponse.json()

    await page.addInitScript(([accessToken, refreshToken]) => {
      window.localStorage.setItem('token', accessToken)
      window.localStorage.setItem('accessToken', accessToken)
      window.localStorage.setItem('refreshToken', refreshToken)
    }, [authPayload.access_token, authPayload.refresh_token])
  })

  test('surfaces live websocket updates in the suggestion panel', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('heading', { name: /Clinical Documentation Assistant/i }).waitFor({ state: 'visible' })

    const patientInput = page.locator('#patient-id')
    const encounterInput = page.locator('#encounter-id')

    await patientInput.waitFor({ state: 'visible' })
    await patientInput.fill('PX1')
    await encounterInput.fill('42')

    await page.getByRole('button', { name: /Start Visit/i }).click()

    await delay(250)

    const showSuggestions = page.getByRole('button', { name: /Show Suggestions/i })
    await showSuggestions.waitFor({ state: 'visible' })
    await showSuggestions.click()

    await page.waitForFunction(() => Array.isArray(window.__mockSockets) && window.__mockSockets.length >= 4)

    await page.evaluate(() => {
      const sockets = window.__mockSockets ?? []
      const findSocket = (segment: string) =>
        sockets.find(socket => typeof (socket as any).url === 'string' && (socket as any).url.includes(segment))

      const compliance = findSocket('/ws/compliance')
      const codes = findSocket('/ws/codes')
      const collaboration = findSocket('/ws/collaboration')
      const transcription = findSocket('/api/transcribe') ?? sockets[0]
      const message = (data: unknown) =>
        new MessageEvent('message', {
          data: JSON.stringify(data),
        })

      transcription?.emit(
        'message',
        message({ event: 'connected', sessionId: 'ws-trans' }),
      )
      transcription?.emit(
        'message',
        message({ eventId: 1, transcript: 'final patient note', isInterim: false, speakerLabel: 'patient' }),
      )
      compliance?.emit(
        'message',
        message({
          eventId: 2,
          issues: [
            {
              title: 'Live compliance alert',
              description: 'Add ROS to complete documentation.',
              severity: 'warning',
            },
          ],
        }),
      )
      codes?.emit(
        'message',
        message({
          eventId: 3,
          code: 'Z1234',
          description: 'Streaming code',
          rationale: 'Suggested from live encounter',
        }),
      )
      collaboration?.emit(
        'message',
        message({ eventId: 4, participants: [{ userId: 'abc', name: 'Dr Demo' }] }),
      )
      collaboration?.emit(
        'message',
        message({ eventId: 5, conflicts: ['Simultaneous edits detected'] }),
      )
    })

    await delay(300)

    await expect(page.getByText('Add ROS to complete documentation.').first()).toBeVisible()
    await expect(page.getByText('Z1234')).toBeVisible()

  })
})
