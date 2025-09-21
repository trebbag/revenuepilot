/* eslint-env node */
import { test, expect, _electron as electron } from '@playwright/test';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('visit session streams render live websocket data', async () => {
  const app = await electron.launch({ args: ['electron/main.js'] });
  const win = await app.firstWindow();

  await win.waitForEvent('domcontentloaded');

  await win.addInitScript(() => {
    const sockets = [];
    class MockSocket {
      constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.listeners = {};
        sockets.push(this);
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          this.emit('open', {});
        }, 0);
      }
      addEventListener(type, handler) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(handler);
      }
      emit(type, payload) {
        (this.listeners[type] || []).forEach((handler) => handler(payload));
      }
      send() {}
      close() {
        this.readyState = WebSocket.CLOSED;
        this.emit('close', { code: 1000 });
      }
    }
    window.__mockSockets = sockets;
    window.WebSocket = MockSocket;
  });

  await win.route('**/health', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await win.route('**/login', (route) =>
    route.fulfill({
      json: {
        access_token: 'token',
        refresh_token: 'refresh',
        settings: { theme: 'modern', categories: {} },
      },
    }),
  );
  await win.route('**/settings', (route) =>
    route.fulfill({ json: { theme: 'modern', categories: {} } }),
  );
  await win.route('**/beautify', (route) =>
    route.fulfill({ json: { beautified: 'Beautified content' } }),
  );
  await win.route('**/suggest', (route) =>
    route.fulfill({
      json: {
        codes: [{ code: '99213', description: 'Office visit' }],
        compliance: [],
        publicHealth: [],
        differentials: [],
        followUp: null,
      },
    }),
  );
  await win.route('**/api/visits/session', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        json: {
          sessionId: 11,
          status: 'started',
          startTime: '2024-01-01T00:00:00Z',
        },
      });
    }
    return route.fulfill({
      json: {
        sessionId: 11,
        status: 'pause',
        startTime: '2024-01-01T00:00:00Z',
        endTime: null,
      },
    });
  });

  await win.fill('input[type="text"]', 'demo');
  await win.fill('input[type="password"]', 'demo-password');
  await win.click('button:has-text("Login")');

  await delay(500);

  await win.fill('#note-patient-field', 'PX1');
  await win.fill('#note-encounter-field', '42');

  await delay(500);

  await win.evaluate(() => {
    const [transcription, compliance, codes, collaboration] = window.__mockSockets;
    transcription.emit('message', {
      data: JSON.stringify({ event: 'connected', sessionId: 'ws-trans' }),
    });
    transcription.emit('message', {
      data: JSON.stringify({
        eventId: 1,
        transcript: 'final patient note',
        isInterim: false,
        speakerLabel: 'patient',
      }),
    });
    compliance.emit('message', {
      data: JSON.stringify({
        eventId: 2,
        issues: [{ message: 'Live compliance alert', severity: 'warning' }],
      }),
    });
    codes.emit('message', {
      data: JSON.stringify({ eventId: 3, code: 'Z1234', rationale: 'Streaming code' }),
    });
    collaboration.emit('message', {
      data: JSON.stringify({
        eventId: 4,
        participants: [{ userId: 'abc', name: 'Dr Demo' }],
      }),
    });
    collaboration.emit('message', {
      data: JSON.stringify({
        eventId: 5,
        conflicts: ['Simultaneous edits detected'],
      }),
    });
  });

  await expect(win.locator('text=final patient note')).toBeVisible();
  await expect(win.locator('text=Live compliance alert')).toBeVisible();
  await expect(win.locator('text=Z1234')).toBeVisible();
  await expect(win.locator('text=Collaborators')).toBeVisible();
  await expect(win.locator('text=Simultaneous edits detected')).toBeVisible();

  await app.close();
});
