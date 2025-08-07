// Verify that signing and update variables are present before building.
// Environment variables are loaded via `node -r dotenv/config` when the build
// script is invoked, so we simply check for their presence here.

const required = [
  'UPDATE_SERVER_URL',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'LINUX_CSC_LINK',
  'LINUX_CSC_KEY_PASSWORD',
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.warn(
    `Missing environment variables: ${missing.join(', ')}.\n` +
      'Continuing unsigned build; set these variables to enable code signing and updates.'
  );
}
