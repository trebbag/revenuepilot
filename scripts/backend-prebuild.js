const { spawn } = require('child_process');
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

async function main() {
  const backendDir = path.join(__dirname, '..', 'backend');
  const venvDir = path.join(backendDir, 'venv');

  await run('python', ['-m', 'venv', '--copies', '--clear', venvDir]);

  const pipPath = path.join(
    venvDir,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'pip.exe' : 'pip'
  );

  await run(pipPath, ['install', '-r', path.join(backendDir, 'requirements.txt')]);
}

main().catch(err => {
  console.error('backend prebuild failed:', err);
  process.exit(1);
});
