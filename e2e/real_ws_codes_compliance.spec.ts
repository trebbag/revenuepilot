import { expect, test } from '@playwright/test'

import {
  configureVisitStreamSockets,
  getRealSocketMessages,
  waitForRealSocket,
  waitForVisitStreamHarness,
} from '../tests/e2e/helpers/visit-stream-sockets'
import { USE_MOCK_VISIT_STREAMS } from '../tests/e2e/helpers/env'

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
      stop() {}
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

async function waitForStreamMessage(
  page: import('@playwright/test').Page,
  segment: string,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const messages = await getRealSocketMessages(page, segment)
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
  throw new Error(`Timed out waiting for message on ${segment}`)
}

test.describe('Real WebSocket codes and compliance feeds', () => {
  test.skip(USE_MOCK_VISIT_STREAMS, 'Requires real WebSocket backend')

  let authTokens: { accessToken: string; refreshToken: string }

  test.beforeEach(async ({ page }) => {
    await configureVisitStreamSockets(page)
    await prepareMediaMocks(page)
    authTokens = await authenticate(page)
    expect(authTokens.accessToken).not.toHaveLength(0)
  })

  test('establishes live codes and compliance sockets during a visit', async ({ page }) => {
    await startVisit(page)

    await waitForVisitStreamHarness(page)
    await Promise.all([
      waitForRealSocket(page, '/ws/compliance'),
      waitForRealSocket(page, '/ws/codes'),
    ])

    const complianceHandshake = await waitForStreamMessage(
      page,
      '/ws/compliance',
      payload => payload.event === 'connected' || payload.channel === 'compliance',
    )
    expect(complianceHandshake.channel).toBe('compliance')

    const codesHandshake = await waitForStreamMessage(
      page,
      '/ws/codes',
      payload => payload.event === 'connected' || payload.channel === 'codes',
    )
    expect(codesHandshake.channel).toBe('codes')

    const finalizeButton = page.getByRole('button', { name: /Finalize/i })
    await expect(finalizeButton).toBeDisabled()

    await page.getByPlaceholder('Start typing your clinical note here...').fill(
      'Comprehensive SOAP note documenting patient visit with vitals, assessment, and plan. '.repeat(3),
    )

    await page.waitForTimeout(1000)
    await expect(finalizeButton).toBeDisabled()
  })
})
