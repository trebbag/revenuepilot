require('dotenv').config();

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

let backendProcess;

function waitForServer(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(url, res => {
          res.resume();
          resolve();
        })
        .on('error', err => {
          if (Date.now() - start > timeout) {
            reject(err);
          } else {
            setTimeout(check, 200);
          }
        });
    };
    check();
  });
}

async function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const venvPath = process.platform === 'win32'
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python');
  const pythonExecutable = fs.existsSync(venvPath) ? venvPath : 'python';

  const args = [
    '-m',
    'uvicorn',
    'main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8000'
  ];

  backendProcess = spawn(pythonExecutable, args, {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit'
  });

  await waitForServer('http://127.0.0.1:8000');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'dist', 'index.html')
    : path.join(__dirname, 'dist', 'index.html');
  win.loadFile(indexPath);

  // Inject the backend URL so the frontend can locate the API server.
  // This avoids having to bake the URL at build time and allows local
  // development against the Python backend running on port 8000.
  win.webContents.on('dom-ready', () => {
    win.webContents.executeJavaScript(
      "window.__BACKEND_URL__ = 'http://localhost:8000';"
    );
  });
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  if (process.env.UPDATE_SERVER_URL) {
    autoUpdater.setFeedURL({ url: process.env.UPDATE_SERVER_URL });
  } else {
    console.warn('UPDATE_SERVER_URL not set; auto-updates disabled.');
  }
  autoUpdater.checkForUpdatesAndNotify();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto-update error:', err);
});
