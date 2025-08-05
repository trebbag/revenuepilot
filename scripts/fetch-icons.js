const https = require('https');
const fs = require('fs');
const path = require('path');

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
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function run() {
  for (const icon of icons) {
    const url = process.env[icon.env];
    if (url) {
      const dest = path.join(dir, icon.name);
      await download(url, dest);
    }
  }
}

run().catch(err => {
  console.error('Icon fetch failed:', err);
  process.exit(1);
});
