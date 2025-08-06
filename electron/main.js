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
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.VITE_API_URL ||
  'http://localhost:8000';

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
  // The value is read from BACKEND_URL or VITE_API_URL and falls back to
  // http://localhost:8000 for local development.
  win.webContents.on('dom-ready', () => {
    win.webContents.executeJavaScript(
      `window.__BACKEND_URL__ = ${JSON.stringify(backendUrl)};`
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
