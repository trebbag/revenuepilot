import { test, expect } from '@playwright/test'
import {
  USE_REAL_TRANSCRIBE_SOCKET,
  configureVisitStreamSockets,
  deliverVisitStreamPayloads,
  waitForMockSocketCount,
  waitForVisitStreamHarness,
} from './helpers/visit-stream-sockets'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

test.describe('Suggestion panel live websocket indicators', () => {
  test.beforeEach(async ({ page }) => {
    await configureVisitStreamSockets(page)

    await page.addInitScript(() => {
      class MockMediaStreamTrack {
        stop() {
          // no-op
        }
      }

      class MockMediaStream {
        getTracks() {
          return [new MockMediaStreamTrack()]
        }
      }

      class MockMediaRecorder {
        constructor(stream) {
          this.stream = stream
          this.state = 'inactive'
          this.ondataavailable = null
          this.onstop = null
          this.onstart = null
        }

        start() {
          this.state = 'recording'
          if (typeof this.onstart === 'function') {
            this.onstart()
          }
        }

        stop() {
          this.state = 'inactive'
          if (typeof this.onstop === 'function') {
            this.onstop()
          }
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

    await waitForVisitStreamHarness(page)

    const expectedMockSockets = USE_REAL_TRANSCRIBE_SOCKET ? 3 : 4
    await waitForMockSocketCount(page, expectedMockSockets)

    await deliverVisitStreamPayloads(page)

    await delay(500)

    await page.getByRole('button', { name: /Open full transcript/i }).click()

    const transcriptDialog = page.getByRole('dialog', { name: /Full Transcript/i })
    await expect(transcriptDialog).toBeVisible()
    await expect(transcriptDialog.getByText(/interim patient note/i)).toBeVisible()
    await expect(transcriptDialog.getByText(/Interim/i)).toBeVisible()
    await expect(transcriptDialog.getByText(/final patient note/i)).toBeVisible()

    await page.keyboard.press('Escape')

    await delay(300)

    await expect(page.getByText('Add ROS to complete documentation.').first()).toBeVisible()
    await expect(page.getByText('Z1234')).toBeVisible()

  })
})
