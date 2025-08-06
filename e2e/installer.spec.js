const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// This test downloads the packaged installer, launches the installed app and
// verifies a few core user interactions. The test is skipped by default unless
// an INSTALLER_URL environment variable is provided. In CI a previously built
// installer can be exposed via this variable.
test('installer launches and basic flows work', async ({}, testInfo) => {
  const url = process.env.INSTALLER_URL;
  if (!url) {
    test.skip(true, 'INSTALLER_URL not set');
  }

  const target = path.join(testInfo.outputDir, path.basename(url));
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  fs.chmodSync(target, 0o755);

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
