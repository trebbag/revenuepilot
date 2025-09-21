import { expect, test } from '@playwright/test';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('RevenuePilot frontend integration flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      class MockMediaStreamTrack {
        stop() {
          // no-op
        }
      }

      class MockMediaStream {
        getTracks() {
          return [new MockMediaStreamTrack()];
        }
      }

      class MockMediaRecorder {
        private _interval: ReturnType<typeof setInterval> | null = null;
        public stream: MockMediaStream;
        public state: 'inactive' | 'recording' = 'inactive';
        public ondataavailable: ((event: { data: Blob }) => void) | null = null;
        public onstop: (() => void) | null = null;
        public onstart: (() => void) | null = null;

        constructor(stream: MockMediaStream) {
          this.stream = stream;
        }

        start(timeslice = 1000) {
          this.state = 'recording';
          this.onstart?.();
          this._interval = setInterval(() => {
            if (this.ondataavailable) {
              const blob = new Blob(['mock-audio'], { type: 'audio/webm' });
              this.ondataavailable({ data: blob });
            }
          }, Math.max(100, timeslice));
        }

        stop() {
          if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
          }
          this.state = 'inactive';
          this.onstop?.();
        }

        requestData() {
          // ignored
        }

        addEventListener() {
          // ignored
        }

        removeEventListener() {
          // ignored
        }
      }

      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        writable: true,
        value: MockMediaRecorder,
      });

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        readyState = MockWebSocket.OPEN;
        url: string;
        protocol?: string | string[];
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;

        constructor(url: string, protocols?: string | string[]) {
          this.url = url;
          this.protocol = protocols;
          setTimeout(() => {
            this.onopen?.(new Event('open'));
          }, 0);
        }

        send(_data: ArrayBuffer | ArrayBufferView | Blob | string) {
          // ignore outbound audio data
        }

        close() {
          if (this.readyState === MockWebSocket.CLOSED) {
            return;
          }
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.(new CloseEvent('close'));
        }

        addEventListener() {
          // noop
        }

        removeEventListener() {
          // noop
        }
      }

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: MockWebSocket,
      });

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
          async getUserMedia() {
            return new MockMediaStream();
          },
        },
      });
    });
  });

  test('auth handshake, analytics, activity log, and finalization wizard', async ({ page }) => {
    await page.request.post('http://127.0.0.1:4010/__mock__/auth/state', {
      data: { authenticated: false },
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email or Username').fill('clinician@exampleclinic.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('Clinician123!');
    const signInButton = page.getByRole('button', { name: 'Sign in' });
    await expect(signInButton).toBeEnabled();
    await signInButton.click();

    await page
      .getByText('Signing you in', { exact: false })
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => undefined);

    const sidebarNavItem = (label: string) =>
      page
        .locator('[data-sidebar="menu"]')
        .getByText(label, { exact: true });

    const toggleSidebar = page.locator('[data-sidebar="trigger"]');

    const ensureSidebarExpanded = async () => {
      const homeNav = sidebarNavItem('Home Dashboard');

      if (await homeNav.isVisible()) {
        return;
      }

      await toggleSidebar.waitFor({ state: 'visible' });
      await toggleSidebar.click();
      await expect(homeNav).toBeVisible();
    };

    await toggleSidebar.waitFor({ state: 'visible' });

    await ensureSidebarExpanded();

    await expect(sidebarNavItem('Analytics')).toBeVisible();

    await sidebarNavItem('Analytics').click();
    await expect(page.getByRole('heading', { name: 'Analytics Dashboard' }).first()).toBeVisible();
    await expect(page.getByText('Daily Revenue', { exact: true })).toBeVisible();
    await expect(page.getByText('Period total: $48,250', { exact: false })).toBeVisible();

    await sidebarNavItem('Activity Log').click();
    await expect(page.getByRole('heading', { name: 'Activity Log' }).first()).toBeVisible();
    await expect(page.getByText('Finalized SOAP note', { exact: false }).first()).toBeVisible();

    await sidebarNavItem('Documentation').click();

    const patientField = page.getByLabel('Patient ID');
    await patientField.fill('Jane');

    await wait(600);
    const patientOption = page.getByRole('button', { name: /Jane Doe/ }).first();
    await expect(patientOption).toBeVisible();
    await patientOption.click();

    const encounterField = page.getByLabel('Encounter ID');
    await encounterField.fill('67890');

    await expect(page.getByText('Follow-up', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Start Visit' }).click();
    await expect(page.getByRole('button', { name: 'Stop Visit' })).toBeVisible();

    await page.waitForTimeout(2000);

    const finalizeButton = page.getByRole('button', { name: 'Save & Finalize Note' });
    await expect(finalizeButton).toBeEnabled();
    await finalizeButton.click();

    await page.waitForTimeout(1000);
    await expect(page.getByRole('heading', { name: 'Code Review' }).first()).toBeVisible();
    await expect(page.getByText(/context established/i)).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Suggestion Review' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    const continueToCompare = page.getByRole('button', { name: 'Continue to Compare & Edit' });
    await expect(continueToCompare).toBeVisible();
    await continueToCompare.click();

    const acceptEnhanced = page.getByRole('button', { name: /Accept Enhanced Version/ });
    await expect(acceptEnhanced).toBeVisible();
    await acceptEnhanced.click();

    const switchToSummary = page.getByRole('button', { name: /Switch to Summary/ });
    await switchToSummary.click();

    const acceptSummary = page.getByRole('button', { name: /Accept Summary Version/ });
    await acceptSummary.click();

    const continueToBilling = page.getByRole('button', { name: /Continue to Billing/ });
    await expect(continueToBilling).toBeEnabled();
    await continueToBilling.click();

    await expect(page.getByRole('heading', { name: 'Billing & Attest' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Sign & Dispatch' }).first()).toBeVisible();

    const dispatchButton = page.getByRole('button', { name: 'Finalize & Dispatch' });
    await expect(dispatchButton).toBeVisible();
    await dispatchButton.click();

    const dispatchFinalizedButton = page.getByRole('button', { name: 'Dispatch Finalized Note' });
    await expect(dispatchFinalizedButton).toBeVisible();
    await expect(dispatchFinalizedButton).toBeEnabled();
    await expect(page.getByText('Step completed', { exact: false })).toContainText('100%');

    const closeButton = page.getByRole('button', { name: 'Close' });
    // Trigger the React handler directly to avoid framer-motion overlays
    // that intermittently intercept pointer events during exit animations.
    await closeButton.evaluate(node => (node as HTMLButtonElement).click());

    await expect(page.getByRole('heading', { name: 'Finalization Wizard' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Note Finalized' })).toBeDisabled();
    await expect(page.getByText('Note finalized', { exact: false })).toBeVisible();
  });
});
