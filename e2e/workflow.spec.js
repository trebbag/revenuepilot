/* eslint-env node */
import { test, expect, _electron as electron } from '@playwright/test';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('workflow: create, validate, attest, dispatch', async () => {
  const app = await electron.launch({ args: ['electron/main.js'] });
  const win = await app.firstWindow();
  await win.waitForEvent('domcontentloaded');

  await win.route('**/health', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await win.route('**/auth/policy', (route) => route.fulfill({ json: { lockoutThreshold: 5, lockoutDurationSeconds: 900 } }));
  await win.route('**/login', (route) =>
    route.fulfill({
      json: {
        access_token: 'token',
        refresh_token: 'rt',
        settings: { theme: 'modern', categories: {} },
      },
    }),
  );
  await win.route('**/settings', (route) =>
    route.fulfill({ json: { theme: 'modern', categories: {} } }),
  );
  await win.route('**/beautify', (route) =>
    route.fulfill({ json: { beautified: 'Beautified note' } }),
  );
  await win.route('**/suggest', (route) =>
    route.fulfill({
      json: {
        codes: [{ code: '99213', description: 'Visit' }],
        compliance: ['Complete ROS'],
        publicHealth: [],
        differentials: [],
        followUp: null,
      },
    }),
  );

  await win.route('**/api/v1/workflow/sessions', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        json: {
          sessionId: 'wf-100',
          encounterId: 'enc-100',
          stepStates: { 1: { step: 1, status: 'in_progress', progress: 10 } },
        },
      });
    } else {
      route.continue();
    }
  });

  await win.route('**/api/v1/workflow/sessions/wf-100', (route) =>
    route.fulfill({
      json: {
        sessionId: 'wf-100',
        encounterId: 'enc-100',
        stepStates: { 1: { step: 1, status: 'in_progress', progress: 10 } },
      },
    }),
  );

  await win.route('**/api/v1/workflow/sessions/wf-100/step', (route) =>
    route.fulfill({
      json: {
        sessionId: 'wf-100',
        stepStates: { 1: { step: 1, status: 'completed', progress: 100 } },
      },
    }),
  );

  await win.route('**/api/v1/notes/enc-100/content', (route) =>
    route.fulfill({
      json: {
        session: {
          sessionId: 'wf-100',
          stepStates: { 1: { step: 1, status: 'completed', progress: 100 } },
          lastValidation: {
            canFinalize: true,
            reimbursementSummary: { total: 120 },
            issues: { content: [], codes: [] },
          },
        },
      },
    }),
  );

  await win.route('**/api/v1/workflow/wf-100/step5/attest', (route) =>
    route.fulfill({
      json: {
        session: {
          sessionId: 'wf-100',
          stepStates: { 5: { step: 5, status: 'completed', progress: 100 } },
          attestation: {
            attestation: { attestedBy: 'Dr. Demo', attestationText: 'Reviewed' },
          },
        },
      },
    }),
  );

  await win.route('**/api/v1/workflow/wf-100/step6/dispatch', (route) =>
    route.fulfill({
      json: {
        session: {
          sessionId: 'wf-100',
          stepStates: { 6: { step: 6, status: 'completed', progress: 100 } },
          dispatch: {
            destination: 'ehr',
            deliveryMethod: 'wizard',
            dispatchStatus: { dispatchCompleted: true },
          },
        },
        result: { exportReady: true },
      },
    }),
  );

  await win.fill('input[type="text"]', 'demo');
  await win.fill('input[type="password"]', 'demo-password');
  await win.click('button:has-text("Login")');
  await delay(500);

  await win.fill('#draft-input', 'Note content for workflow');
  await win.fill('#draft-input-patient-id', 'patient-100');
  await win.fill('#draft-input-encounter-id', 'enc-100');

  await win.click('button:has-text("Workflow")');
  await expect(win.locator('text=Workflow steps')).toBeVisible();

  await win.click('button:has-text("Create session")');
  await expect(win.locator('text=Step 1')).toBeVisible();

  await win.click('button:has-text("Run validation")');
  await expect(win.locator('text=Estimated reimbursement')).toBeVisible();

  await win.fill('input[name="attestedBy"]', 'Dr. Demo');
  await win.fill('textarea[name="statement"]', 'Reviewed');
  await win.click('button:has-text("Submit attestation")');

  await win.click('button:has-text("Dispatch")');
  await expect(win.locator('text=Dispatch result')).toBeVisible();

  await app.close();
});
