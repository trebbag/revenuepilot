const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const venvPython = process.platform === 'win32'
  ? path.join(__dirname, 'backend', 'venv', 'Scripts', 'python')
  : path.join(__dirname, 'backend', 'venv', 'bin', 'python');
const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';

console.log('Starting backend (FastAPI)...');
const backend = spawn(pythonCmd, [path.join('backend', 'main.py')], { stdio: 'inherit' });

process.env.VITE_API_URL = 'http://localhost:8000';
console.log('Starting frontend (Vite)...');
const frontend = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });

frontend.on('close', () => {
  backend.kill();
});
