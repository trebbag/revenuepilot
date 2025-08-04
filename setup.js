const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts) {
  spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

const root = __dirname;

console.log('Installing Node dependencies...');
run('npm', ['install'], { cwd: root });

console.log('Creating Python virtual environment...');
const venvPath = path.join(root, 'backend', 'venv');
run('python', ['-m', 'venv', venvPath]);

const pip = process.platform === 'win32'
  ? path.join(venvPath, 'Scripts', 'pip')
  : path.join(venvPath, 'bin', 'pip');
console.log('Installing backend dependencies...');
run(pip, ['install', '-r', path.join('backend', 'requirements.txt')], { cwd: root });

console.log('Setup complete.');
