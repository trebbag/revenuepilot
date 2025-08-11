/* eslint-env node */
/* global require, __dirname, process, Buffer, console */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const zlib = require('zlib');

// --- PNG generation utilities (pure JS, no native deps) ---
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return ~c >>> 0; // unsigned
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateSolidPng(dest, width = 512, height = 512, rgba = [0x5c, 0x72, 0xa8, 0xff]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data with filter byte per row (0) + RGBA pixels
  const rowSize = 1 + width * 4; // filter + pixels
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const off = y * rowSize + 1 + x * 4;
      raw[off] = rgba[0];
      raw[off + 1] = rgba[1];
      raw[off + 2] = rgba[2];
      raw[off + 3] = rgba[3];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const pngBuf = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(dest, pngBuf);
  console.log(`Generated placeholder PNG ${dest} (${width}x${height}, size ${pngBuf.length} bytes).`);
}

function parsePngDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, 24, 0);
    fs.closeSync(fd);
    if (header.slice(0, 8).compare(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) !== 0) return null;
    // IHDR chunk length 13 then 'IHDR'
    if (header.readUInt32BE(8) !== 13) return null;
    if (header.slice(12, 16).toString('ascii') !== 'IHDR') return null;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

// Fallback URL (still attempted first if network allowed)
const FALLBACK_PLACEHOLDER_URL = 'https://via.placeholder.com/512.png?text=RP';

const icons = [
  { env: 'ICON_PNG_URL', name: 'icon.png', required: true },
  { env: 'ICON_ICO_URL', name: 'icon.ico', required: false },
  { env: 'ICON_ICNS_URL', name: 'icon.icns', required: false },
];

const dir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    execFile('curl', ['-L', url, '-o', dest], error => {
      if (error) {
        resolve(false); // non-fatal
      } else {
        resolve(true);
      }
    });
  });
}

async function ensurePngPlaceholder(dest) {
  // Attempt download first (env URL will override global FALLBACK)
  try {
    const ok = await download(FALLBACK_PLACEHOLDER_URL, dest);
    if (ok) {
      const dims = parsePngDimensions(dest);
      const stat = fs.statSync(dest);
      if (dims && dims.width >= 256 && dims.height >= 256 && stat.size > 1500) { // lowered size guard to allow highly-compressible solids
        console.log(`Downloaded placeholder (${dims.width}x${dims.height}, ${stat.size} bytes).`);
        return;
      }
    }
  } catch {/* ignore */}
  // Generate programmatically (guaranteed valid)
  generateSolidPng(dest, 512, 512, [0x5c, 0x72, 0xa8, 0xff]);
}

function isValidDesiredPng(dest) {
  try {
    const dims = parsePngDimensions(dest);
    if (!dims) return false;
    if (dims.width < 256 || dims.height < 256) return false;
    const size = fs.statSync(dest).size;
    // Minimum plausible size for 256x256+ rgba compressed (heuristic) ~ >1.5KB (solid-color 512x512 ~1.8KB)
    if (size < 1500) return false; // truncated/corrupt threshold lowered from 2000
    return true;
  } catch {
    return false;
  }
}

async function run() {
  for (const icon of icons) {
    const url = process.env[icon.env];
    const dest = path.join(dir, icon.name);
    let downloaded = false;
    if (url) {
      try {
        downloaded = await download(url, dest);
        if (downloaded) console.log(`Downloaded ${icon.name} from ${url}`);
      } catch (err) {
        console.warn(`Failed downloading ${icon.name} from ${url}: ${err}. Will attempt placeholder.`);
      }
    }
    if (!downloaded) {
      if (!fs.existsSync(dest)) {
        if (icon.name === 'icon.png') {
          await ensurePngPlaceholder(dest);
        } else {
          console.log(`No ${icon.name} provided; skipping optional format.`);
        }
      } else if (icon.name === 'icon.png') {
        if (!isValidDesiredPng(dest)) {
          console.log(`Existing ${icon.name} invalid/too small; regenerating.`);
          await ensurePngPlaceholder(dest);
        } else {
          console.log(`${icon.name} already present and looks valid.`);
        }
      } else {
        console.log(`${icon.name} already present.`);
      }
    }
  }
}

run().catch(err => {
  console.error('Icon fetch failed:', err);
  process.exit(1);
});
