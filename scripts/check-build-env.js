
require('dotenv').config();

const required = ['UPDATE_SERVER_URL'];

const signing = ['CSC_LINK', 'CSC_KEY_PASSWORD'];

if (!process.env.UPDATE_SERVER_URL) {
  console.warn('UPDATE_SERVER_URL not set; updates will be disabled.');
}
for (const name of signing) {
  if (!process.env[name]) {
    console.warn(`Signing variable ${name} not set; build may be unsigned.`);
  }
}
