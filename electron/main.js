/* eslint-env node */
/* global __dirname, process, console, setTimeout */
require('dotenv').config();

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const http = require('http');
const { writeRtfFile } = require('./rtfExporter');

let backendProcess;
let mainWindow;
const backendUrl = process.env.BACKEND_URL || process.env.VITE_API_URL || 'http://localhost:8000';

ipcMain.handle('export-note', async (_event, { beautified, summary }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [
      { name: 'Text File', extensions: ['txt'] },
      { name: 'PDF', extensions: ['pdf'] },
    ],
  });
  if (canceled || !filePath) return;
  if (filePath.endsWith('.pdf')) {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.text('Beautified Note:\n');
      doc.text(beautified || '');
      doc.moveDown();
      doc.text('Summary:\n');
      doc.text(summary || '');
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  } else {
    const content = `Beautified Note:\n${beautified || ''}\n\nSummary:\n${summary || ''}`;
    fs.writeFileSync(filePath, content);
  }
});

ipcMain.handle('export-rtf', async (_event, { beautified, summary }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'Rich Text', extensions: ['rtf'] }],
  });
  if (canceled || !filePath) return;
  writeRtfFile(filePath, beautified, summary);
});

function waitForServer(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(url, res => {
          res.resume();
            resolve(true);
        })
        .on('error', err => {
          if (Date.now() - start > timeout) {
            return reject(err);
          }
          setTimeout(check, 300);
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

  const args = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'];

  try {
    backendProcess = spawn(pythonExecutable, args, { cwd: backendDir, env: process.env, stdio: 'inherit' });
  } catch (e) {
    console.error('Failed spawning backend process:', e);
    dialog.showErrorBox('Backend Error', 'Failed to start backend process. Some features may not work.');
    return;
  }

  waitForServer('http://127.0.0.1:8000', 12000)
    .then(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-ready'); })
    .catch(err => { console.warn('Backend did not become ready in time:', err.message); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed'); });
}

function resolveIndexHtml() {
  const devPath = path.join(__dirname, 'dist', 'index.html'); // when running from source (electron/dist)
  const packagedPath = path.join(__dirname, '..', 'dist', 'index.html'); // inside asar (dist)
  if (fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(packagedPath)) return packagedPath;
  console.error('Could not locate index.html. Looked in:', devPath, packagedPath);
  return devPath; // attempt anyway so error is surfaced in logs
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    show: false,
    backgroundColor: '#111111',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const indexPath = resolveIndexHtml();
  console.log('Loading index.html from', indexPath, 'app.isPackaged=', app.isPackaged);
  mainWindow.loadFile(indexPath).catch(err => console.error('Failed to load index.html:', err));

  // Primary show path
  mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
  // Fallback show in case ready-to-show never fires (e.g. missing file) so user still sees a window
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('Forcing window show (ready-to-show not fired).');
      mainWindow.show();
    }
  }, 2500);

  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`window.__BACKEND_URL__ = ${JSON.stringify(backendUrl)};`).catch(err => console.error('Inject URL failed:', err));
  });
}

app.whenReady().then(() => {
  createWindow();
  startBackend();
  if (process.env.UPDATE_SERVER_URL) {
    try {
      autoUpdater.setFeedURL({ url: process.env.UPDATE_SERVER_URL });
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      console.warn('Auto-update setup failed:', e.message);
    }
  } else {
    console.warn('UPDATE_SERVER_URL not set; auto-updates disabled.');
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('update-available', () => { console.log('Update available'); });
autoUpdater.on('update-downloaded', () => { console.log('Update downloaded; installing'); autoUpdater.quitAndInstall(); });
autoUpdater.on('error', (err) => { console.error('Auto-update error:', err); });
