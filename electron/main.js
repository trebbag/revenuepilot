const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let backendProcess;

function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const venvPath = process.platform === 'win32'
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python');
  const pythonExecutable = fs.existsSync(venvPath) ? venvPath : 'python';
  const scriptPath = path.join(backendDir, 'main.py');

  backendProcess = spawn(pythonExecutable, [scriptPath], {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit'
  });
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

  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  if (process.env.UPDATE_SERVER_URL) {
    autoUpdater.setFeedURL({ url: process.env.UPDATE_SERVER_URL });
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
