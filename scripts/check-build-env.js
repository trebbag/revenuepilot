require('dotenv').config();

const required = [
  'UPDATE_SERVER_URL',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
];

const missing = required.filter(name => !process.env[name]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
