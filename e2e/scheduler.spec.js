/* eslint-env node */
import { test, expect, _electron as electron } from '@playwright/test';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

test('scheduler scheduling flow', async () => {
  const app = await electron.launch({ args: ['electron/main.js'] });
  const win = await app.firstWindow();
  await win.waitForEvent('domcontentloaded');

  const appointments = [
    {
      id: 1,
      patient: 'Existing Patient',
      reason: 'Follow-up',
      start: iso(new Date('2024-01-01T10:00:00Z')),
      end: iso(new Date('2024-01-01T10:30:00Z')),
      provider: null,
      status: 'scheduled',
      patientId: null,
      encounterId: null,
      location: 'Main Clinic',
      visitSummary: null,
    },
  ];

  let nextId = 2;

  await win.route('**/health', (route) => route.fulfill({ status: 200, body: 'ok' }));
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
  await win.route('**/followup', (route) =>
    route.fulfill({ json: { interval: '6 weeks', ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR', reason: 'code mapping' } }),
  );
  await win.route('**/api/schedule/appointments', (route) =>
    route.fulfill({ json: { appointments, visitSummaries: {} } }),
  );
  await win.route('**/schedule', async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || '{}');
    const start = body.start ? new Date(body.start) : new Date();
    const end = body.end ? new Date(body.end) : new Date(start.getTime() + 30 * 60000);
    const record = {
      id: nextId++,
      patient: body.patient || 'Patient',
      reason: body.reason || 'Reason',
      start: iso(start),
      end: iso(end),
      provider: body.provider || null,
      status: 'scheduled',
      patientId: body.patientId || null,
      encounterId: body.encounterId || null,
      location: body.location || 'Main Clinic',
      visitSummary: null,
    };
    appointments.push(record);
    await route.fulfill({ json: record });
  });
  await win.route('**/schedule/export', (route) =>
    route.fulfill({ json: { ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' } }),
  );
  await win.route('**/api/schedule/bulk-operations', async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || '{}');
    let succeeded = 0;
    for (const update of body.updates || []) {
      const appt = appointments.find((item) => item.id === update.id);
      if (!appt) continue;
      if (typeof update.action === 'string' && update.action.toLowerCase() === 'reschedule' && update.time) {
        const newStart = new Date(update.time);
        if (!Number.isNaN(newStart.getTime())) {
          appt.start = iso(newStart);
          const newEnd = new Date(newStart.getTime() + 30 * 60000);
          appt.end = iso(newEnd);
          appt.status = 'scheduled';
          succeeded += 1;
          continue;
        }
      }
      if (typeof update.action === 'string') {
        const action = update.action.toLowerCase();
        if (action === 'complete') {
          appt.status = 'completed';
          succeeded += 1;
        } else if (action === 'cancel') {
          appt.status = 'cancelled';
          succeeded += 1;
        } else if (action === 'check-in' || action === 'checkin' || action === 'start') {
          appt.status = 'in-progress';
          succeeded += 1;
        }
      }
    }
    await route.fulfill({ json: { succeeded, failed: (body.updates || []).length - succeeded } });
  });

  await win.fill('input[type="text"]', 'demo');
  await win.fill('input[type="password"]', 'demo-password');
  await win.click('button:has-text("Login")');

  await delay(500);

  await win.click('button:has-text("Scheduler")');

  await expect(win.locator('table')).toContainText('Existing Patient');

  await win.click('button:has-text("Recommend follow-up")');
  await expect(win.locator('input[placeholder*="interval"]').first()).toHaveValue('6 weeks');

  await win.fill('label:has-text("Patient") input', 'Jane Doe');
  await win.fill('label:has-text("Reason") input', 'Re-check');
  await win.fill('label:has-text("Start") input', '2024-01-02T09:00');

  await win.click('button:has-text("Schedule appointment")');
  await expect(win.locator('table')).toContainText('Jane Doe');

  await win.click('input[aria-label="Appointment 2"]');
  await win.click('button:has-text("Apply")');

  await expect(win.locator('table')).toContainText('completed');

  await app.close();
});
