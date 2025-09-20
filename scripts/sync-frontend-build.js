#!/usr/bin/env node
/* eslint-env node */

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(workspaceRoot, 'revenuepilot-frontend', 'build');
const targetDir = path.join(workspaceRoot, 'electron', 'dist');

if (!fs.existsSync(sourceDir)) {
  console.error(`Expected frontend build output at ${sourceDir}, but it was not found. Did you run the workspace build?`);
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied revenuepilot-frontend build from ${sourceDir} to ${targetDir}.`);
