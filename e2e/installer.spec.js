const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Helper to download the installer to the test's output directory.
async function downloadInstaller(testInfo) {
  const url = process.env.INSTALLER_URL;
  const target = path.join(testInfo.outputDir, path.basename(url));
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  fs.chmodSync(target, 0o755);
  return target;
}

// These tests are skipped unless an INSTALLER_URL is provided. In CI a
// previously built installer can be exposed via this variable.

test('installer launches and basic flows work', async ({}, testInfo) => {
  const url = process.env.INSTALLER_URL;
  if (!url) {
    test.skip(true, 'INSTALLER_URL not set');
  }

  const target = await downloadInstaller(testInfo);
  const app = await electron.launch({ executablePath: target });
  const window = await app.firstWindow();

  // Stub network calls so the test can run without a backend.
  await window.route('**/login', (route) =>
    route.fulfill({ json: { access_token: 'token' } })
  );
  await window.route('**/settings', (route) =>
    route.fulfill({ json: { theme: 'modern', categories: {} } })
  );
  await window.route('**/beautify', (route) =>
    route.fulfill({ json: { beautified: 'Beautified note' } })
  );
  await window.route('**/suggest', (route) =>
    route.fulfill({
      json: {
        codes: [{ code: '99213', description: 'Office visit' }],
        compliance: [],
        publicHealth: [],
        differentials: [],
        followUp: null,
      },
    })
  );

  // Login
  await window.fill('input[type="text"]', 'user');
  await window.fill('input[type="password"]', 'pass');
  await window.click('button:has-text("Login")');

  // Draft editing and beautify
  await window.fill('#draft-input', 'Some note');
  await window.click('button:has-text("Beautify")');
  await window.click('button:has-text("Beautified Note")');
  await expect(window.locator('#beautified-output')).toContainText('Beautified note');

  // Suggestions panel
  await expect(window.locator('.suggestion-panel')).toContainText('99213');

  await app.close();
});

test('auto-update checks for updates', async ({}, testInfo) => {
  const url = process.env.INSTALLER_URL;
  if (!url) {
    test.skip(true, 'INSTALLER_URL not set');
  }

  const target = await downloadInstaller(testInfo);

  let requested = false;
  const server = http.createServer((req, res) => {
    requested = true;
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const app = await electron.launch({
    executablePath: target,
    env: { UPDATE_SERVER_URL: `http://127.0.0.1:${port}` },
  });

  for (let i = 0; i < 50 && !requested; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  await app.close();
  server.close();

  expect(requested).toBeTruthy();
});
