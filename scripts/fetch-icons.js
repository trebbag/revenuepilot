const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const icons = [
  { env: 'ICON_PNG_URL', name: 'icon.png' },
  { env: 'ICON_ICO_URL', name: 'icon.ico' },
  { env: 'ICON_ICNS_URL', name: 'icon.icns' },
];

const dir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve();
    execFile('curl', ['-L', url, '-o', dest], error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function run() {
  for (const icon of icons) {
    const url = process.env[icon.env];
    const dest = path.join(dir, icon.name);
    if (url) {
      await download(url, dest);
      console.log(`Downloaded ${icon.name} from ${url}`);
    } else if (fs.existsSync(dest)) {
      console.log(`${icon.name} already present, skipping download`);
    } else {
      console.error(`${icon.env} not set and ${icon.name} missing`);
      process.exit(1);
    }
  }
}

run().catch(err => {
  console.error('Icon fetch failed:', err);
  process.exit(1);
});
