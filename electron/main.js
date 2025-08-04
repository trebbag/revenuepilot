const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let backendProcess;

function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const exec = app.isPackaged
    ? path.join(backendDir, process.platform === 'win32' ? 'backend.exe' : 'backend')
    : 'python';
  const args = app.isPackaged ? [] : [path.join(backendDir, 'main.py')];
  backendProcess = spawn(exec, args, { stdio: 'ignore' });
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
  autoUpdater.checkForUpdatesAndNotify();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
