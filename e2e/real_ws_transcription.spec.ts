import { Buffer } from 'node:buffer'

import { expect, test } from '@playwright/test'

import {
  configureVisitStreamSockets,
  getRealSocketMessages,
  streamAudioFixtureToTranscribe,
  waitForRealSocket,
  waitForVisitStreamHarness,
} from '../tests/e2e/helpers/visit-stream-sockets'
import { USE_MOCK_VISIT_STREAMS } from '../tests/e2e/helpers/env'

function generateSyntheticWav(
  options: { durationMs?: number; sampleRate?: number; frequency?: number; amplitude?: number } = {},
): Buffer {
  const sampleRate = Math.max(8000, options.sampleRate ?? 16_000)
  const durationMs = Math.max(250, options.durationMs ?? 1_500)
  const frequency = Math.max(110, options.frequency ?? 440)
  const amplitude = Math.min(1, Math.max(0.05, options.amplitude ?? 0.2))
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate)
  const bytesPerSample = 2
  const dataSize = sampleCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)
  let offset = 0

  buffer.write('RIFF', offset)
  offset += 4
  buffer.writeUInt32LE(36 + dataSize, offset)
  offset += 4
  buffer.write('WAVE', offset)
  offset += 4
  buffer.write('fmt ', offset)
  offset += 4
  buffer.writeUInt32LE(16, offset)
  offset += 4
  buffer.writeUInt16LE(1, offset)
  offset += 2
  buffer.writeUInt16LE(1, offset)
  offset += 2
  buffer.writeUInt32LE(sampleRate, offset)
  offset += 4
  buffer.writeUInt32LE(sampleRate * bytesPerSample, offset)
  offset += 4
  buffer.writeUInt16LE(bytesPerSample, offset)
  offset += 2
  buffer.writeUInt16LE(8 * bytesPerSample, offset)
  offset += 2
  buffer.write('data', offset)
  offset += 4
  buffer.writeUInt32LE(dataSize, offset)
  offset += 4

  for (let index = 0; index < sampleCount; index += 1) {
    const rawSample = Math.sin((2 * Math.PI * frequency * index) / sampleRate)
    const scaled = Math.max(-1, Math.min(1, rawSample * amplitude))
    buffer.writeInt16LE(Math.round(scaled * 0x7fff), offset)
    offset += 2
  }

  return buffer
}

const SYNTHETIC_AUDIO_BYTES = generateSyntheticWav()

async function authenticate(page: import('@playwright/test').Page) {
  const authResponse = await page.request.post('http://127.0.0.1:4010/api/auth/login', {
    data: {
      username: 'clinician@exampleclinic.com',
      password: 'Clinician123!',
      rememberMe: true,
    },
  })
  if (!authResponse.ok()) {
    throw new Error(`Authentication failed with status ${authResponse.status()}`)
  }
  const authPayload = await authResponse.json()
  await page.addInitScript(([accessToken, refreshToken]) => {
    window.localStorage.setItem('token', accessToken)
    window.localStorage.setItem('accessToken', accessToken)
    window.localStorage.setItem('refreshToken', refreshToken)
  }, [authPayload.access_token, authPayload.refresh_token])
  return {
    accessToken: String(authPayload.access_token),
    refreshToken: String(authPayload.refresh_token),
  }
}

async function prepareMediaMocks(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    class MockMediaStreamTrack {
      stop() {
        // noop
      }
    }

    class MockMediaStream {
      getTracks() {
        return [new MockMediaStreamTrack()]
      }
    }

    class MockMediaRecorder {
      stream: MockMediaStream
      state: 'inactive' | 'recording'
      ondataavailable: ((event: { data: Blob }) => void) | null
      onstop: (() => void) | null
      onstart: (() => void) | null

      constructor(stream: MockMediaStream) {
        this.stream = stream
        this.state = 'inactive'
        this.ondataavailable = null
        this.onstop = null
        this.onstart = null
      }

      start() {
        this.state = 'recording'
        this.onstart?.()
      }

      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }

      requestData() {}

      addEventListener() {}

      removeEventListener() {}
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: {
        async getUserMedia() {
          return new MockMediaStream()
        },
      },
    })
  })
}

async function startVisit(page: import('@playwright/test').Page) {
  await page.goto('/')

  await page
    .getByRole('heading', { name: /Clinical Documentation Assistant/i })
    .waitFor({ state: 'visible' })

  await page.getByLabel('Patient ID').fill('PX1')
  await page.getByLabel('Encounter ID').fill('42')

  await page.getByRole('button', { name: /Start Visit/i }).click()

  await page.waitForTimeout(1000)
}

async function waitForTranscriptMessage(
  page: import('@playwright/test').Page,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const messages = await getRealSocketMessages(page, '/api/transcribe/stream')
    for (const message of messages) {
      if (message.json && typeof message.json === 'object') {
        const payload = message.json as Record<string, unknown>
        if (predicate(payload)) {
          return payload
        }
      }
    }
    await page.waitForTimeout(250)
  }
  throw new Error('Timed out waiting for transcription message')
}

test.describe('Real WebSocket transcription', () => {
  test.skip(USE_MOCK_VISIT_STREAMS, 'Requires real WebSocket backend')

  let authTokens: { accessToken: string; refreshToken: string }

  test.beforeEach(async ({ page }) => {
    await configureVisitStreamSockets(page)
    await prepareMediaMocks(page)
    authTokens = await authenticate(page)
    expect(authTokens.accessToken).not.toHaveLength(0)
  })

  test('streams audio to the transcription service and receives interim + final entries', async ({ page }) => {
    await startVisit(page)

    await waitForVisitStreamHarness(page)
    await waitForRealSocket(page, '/api/transcribe/stream')

    await streamAudioFixtureToTranscribe(page, SYNTHETIC_AUDIO_BYTES, {
      chunkSize: 4096,
      interChunkDelayMs: 40,
    })

    const interimPayload = await waitForTranscriptMessage(
      page,
      payload => payload.isInterim === true,
    )
    expect(typeof interimPayload.transcript).toBe('string')

    const finalPayload = await waitForTranscriptMessage(
      page,
      payload => payload.isInterim === false && typeof payload.transcript === 'string',
    )

    const finalTranscript = String(finalPayload.transcript || '').trim()
    expect(finalTranscript.length).toBeGreaterThan(0)

    await page.getByRole('button', { name: /Open full transcript/i }).click()
    const transcriptDialog = page.getByRole('dialog', { name: /Full Transcript/i })
    await expect(transcriptDialog).toBeVisible()
    await expect(
      transcriptDialog.getByText(new RegExp(finalTranscript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
    ).toBeVisible()
  })
})
