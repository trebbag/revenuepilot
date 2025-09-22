/* eslint-env node */
// Basic smoke test that launches the built Electron app (development build) and exercises
// login -> draft editing -> beautify suggestion pathways with stubbed backend routes.
// Intended to run quickly in CI without requiring the real Python backend.

import { test, expect, _electron as electron } from '@playwright/test';

function delay(ms) { return new Promise(r => globalThis.setTimeout(r, ms)); }

import.meta && null; // noop to keep ESM happy if transformed

test('smoke: login, beautify, suggestions', async () => {
  const app = await electron.launch({ args: ['electron/main.js'] });
  const win = await app.firstWindow();

  await win.waitForEvent('domcontentloaded');

  // Stub endpoints
  await win.route('**/health', route => route.fulfill({ status: 200, body: 'ok' }));
  await win.route('**/auth/policy', route => route.fulfill({ json: { lockoutThreshold: 5, lockoutDurationSeconds: 900 } }));
  await win.route('**/login', route => route.fulfill({ json: { access_token: 'token', refresh_token: 'rt', settings: { theme: 'modern', categories: {} } } }));
  await win.route('**/settings', route => route.fulfill({ json: { theme: 'modern', categories: {} } }));
  await win.route('**/beautify', route => route.fulfill({ json: { beautified: 'Beautified content' } }));
  await win.route('**/suggest', route => route.fulfill({ json: { codes: [{ code: '99213', description: 'Office visit' }], compliance: [], publicHealth: [], differentials: [], followUp: null } }));

  await win.fill('input[type="text"]', 'demo');
  await win.fill('input[type="password"]', 'demo-password');
  await win.click('button:has-text("Login")');

  await delay(500);
  await win.fill('#draft-input', 'Initial draft content');

  const beautifyButton = win.locator('button:has-text("Beautify")').first();
  if (await beautifyButton.count()) {
    await beautifyButton.click();
  }

  const beautifiedTab = win.locator('button:has-text("Beautified")');
  if (await beautifiedTab.count()) await beautifiedTab.click();

  await expect(win.locator('#beautified-output')).toContainText('Beautified');

  // Check suggestions appear
  const codeLocator = win.locator('text=99213');
  await expect(codeLocator.first()).toContainText('99213');

  await app.close();
});
