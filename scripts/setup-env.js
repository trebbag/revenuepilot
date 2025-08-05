const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
const existing = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

const vars = [
  { name: 'OPENAI_API_KEY', prompt: 'OpenAI API key' },
  { name: 'VITE_API_URL', prompt: 'Backend API URL' },
  { name: 'ICON_PNG_URL', prompt: 'PNG icon URL' },
  { name: 'ICON_ICO_URL', prompt: 'ICO icon URL' },
  { name: 'ICON_ICNS_URL', prompt: 'ICNS icon URL' },
  { name: 'UPDATE_SERVER_URL', prompt: 'Update server URL' },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const answers = {};

function ask(index) {
  if (index === vars.length) {
    const lines = vars.map(v => `${v.name}=${answers[v.name] || ''}`).join('\n');
    fs.writeFileSync(envPath, lines + '\n');
    console.log(`Wrote ${envPath}`);
    rl.close();
    return;
  }
  const v = vars[index];
  const def = process.env[v.name] || existing[v.name] || '';
  rl.question(`${v.prompt}${def ? ` [${def}]` : ''}: `, (input) => {
    answers[v.name] = input || def;
    ask(index + 1);
  });
}

ask(0);
