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

async function main() {
  const backendDir = path.join(__dirname, '..', 'backend');
  const venvDir = path.join(backendDir, 'venv');

  const python = resolvePython();
  await run(python, ['-m', 'venv', '--copies', '--clear', venvDir]);

  const pipPath = path.join(
    venvDir,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'pip.exe' : 'pip'
  );

  await run(pipPath, ['install', '-r', path.join(backendDir, 'requirements.txt')]);

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
