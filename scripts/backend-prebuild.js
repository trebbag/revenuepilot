/* eslint-env node */
/* global require, process, __dirname, console, setTimeout */

require('dotenv').config();

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    if (result.status === 0 && !result.error) {
      return cmd;
    }
  }
  throw new Error('No Python interpreter found. Set the PYTHON env variable.');
}

async function pipInstall(pipPath, reqFile) {
  await run(pipPath, ['install', '-r', reqFile]);
}

async function upgradePip(pipPath) {
  if (process.env.SKIP_PIP_UPGRADE === 'true') {
    console.log('Skipping pip upgrade (SKIP_PIP_UPGRADE=true).');
    return;
  }
  console.log('Upgrading pip/setuptools/wheel...');
  try {
    await run(pipPath, ['install', '--upgrade', 'pip', 'setuptools', 'wheel']);
  } catch (err) {
    console.warn('pip upgrade failed (continuing):', err.message);
  }
}

async function safeRmDir(target) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 });
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn(`Failed to remove ${target} after ${attempt} attempts:`, err.message);
        return; // Continue; we will attempt to create venv anyway.
      }
      if (err && err.code === 'ENOTEMPTY') {
        await new Promise(r => setTimeout(r, attempt * 150));
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const backendDir = path.join(__dirname, '..', 'backend');
  const venvDir = path.join(backendDir, 'venv');

  // Remove any existing virtual environment before creating a new one. Using
  // `fs.rmSync` is more robust than relying on Python's `--clear` flag which
  // can fail if certain packages (e.g. torch) contain read-only files or
  // nested directories that `venv` struggles to delete. This prevents errors
  // like "[Errno 66] Directory not empty" during prebuild.
  await safeRmDir(venvDir);

  const python = resolvePython();
  await run(python, ['-m', 'venv', '--copies', venvDir]);

  const pipPath = path.join(
    venvDir,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'pip.exe' : 'pip'
  );

  // Always attempt a pip tooling upgrade first for better wheel resolution
  await upgradePip(pipPath);

  const baseReq = path.join(backendDir, 'requirements.txt');
  try {
    await pipInstall(pipPath, baseReq);
  } catch (err) {
    console.error('Failed to install base backend requirements:', err);
    throw err; // Base requirements must succeed.
  }

  // Attempt optional audio extras only when env flag set (OFFLINE_TRANSCRIBE or WANT_AUDIO_EXTRAS)
  const wantAudio = process.env.WANT_AUDIO_EXTRAS === 'true' || process.env.OFFLINE_TRANSCRIBE === 'true';
  if (wantAudio) {
    const audioReq = path.join(backendDir, 'requirements_audio.txt');
    if (fs.existsSync(audioReq)) {
      console.log('Installing optional audio dependencies (pyannote.audio, torchaudio)...');
      console.log('Tip: if this fails you can retry with WANT_AUDIO_EXTRAS=true after installing matching torch/torchaudio wheels manually.');
      try {
        await pipInstall(pipPath, audioReq);
      } catch (err) {
        console.warn('Optional audio dependency install failed. Continuing without diarisation support. Error:', err.message);
      }
    }
  } else {
    console.log('Skipping optional heavy audio dependencies. Set WANT_AUDIO_EXTRAS=true to attempt install.');
  }

  const freeze = spawnSync(pipPath, ['freeze'], { encoding: 'utf8' });
  if (freeze.status === 0) {
    fs.writeFileSync(path.join(backendDir, 'requirements.lock'), freeze.stdout);
  } else {
    throw new Error('pip freeze failed');
  }
}

main().catch(err => {
  console.error('backend prebuild failed:', err);
  process.exit(1);
});
