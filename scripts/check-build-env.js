require('dotenv').config();

const required = ['UPDATE_SERVER_URL'];
const signing = ['CSC_LINK', 'CSC_KEY_PASSWORD'];

let missing = false;
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    missing = true;
  }
}
if (missing) {
  process.exit(1);
}
for (const name of signing) {
  if (!process.env[name]) {
    console.warn(`Signing variable ${name} not set; build may be unsigned.`);
  }
}
