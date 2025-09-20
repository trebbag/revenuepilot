#!/usr/bin/env node
/* eslint-env node */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const source = path.join(rootDir, 'src', 'index.css');
const destination = path.join(rootDir, 'dist', 'style.css');

if (!existsSync(source)) {
  console.error(`Unable to find ${source}.`);
  process.exit(1);
}

mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`Copied ${source} to ${destination}.`);
