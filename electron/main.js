/* eslint-env node */
/* global __dirname, process, console, setTimeout */
// eslint-disable-next-line no-undef
require('dotenv').config();

// eslint-disable-next-line no-undef
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// eslint-disable-next-line no-undef
const { autoUpdater } = require('electron-updater');
// eslint-disable-next-line no-undef
const { spawn, spawnSync } = require('child_process');
// eslint-disable-next-line no-undef
const fs = require('fs');
// eslint-disable-next-line no-undef
const path = require('path');
// eslint-disable-next-line no-undef
const PDFDocument = require('pdfkit');
// eslint-disable-next-line no-undef
const http = require('http');
// eslint-disable-next-line no-undef
const net = require('net');
// eslint-disable-next-line no-undef
const { writeRtfFile } = require('./rtfExporter');

let backendProcess;
let mainWindow;
let chosenPort = 8000; // may be reassigned if 8000 is busy
const DEFAULT_PORT = 8000;

// Ring buffer of recent backend startup log lines for diagnostics surfaced in Login UI
const backendLogBuffer = [];
const MAX_LOG_LINES = 400; // keep generous tail
let backendLogFile; // path to on-disk log file
function appendBackendLog(line) {
  const cleaned = line.toString().replace(/\r/g, '').trimEnd();
  if (!cleaned) return;
  backendLogBuffer.push(cleaned);
  while (backendLogBuffer.length > MAX_LOG_LINES) backendLogBuffer.shift();
  if (backendLogFile) {
    try { fs.appendFileSync(backendLogFile, cleaned + '\n'); } catch { /* ignore */ }
  }
}
function sendDiagnostics(message, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend-diagnostics', {
      message,
      logTail: backendLogBuffer.slice(-60), // last 60 lines for UI brevity
      logFile: backendLogFile || null,
      ...extra,
    });
  }
}

// Choose an available localhost port starting from DEFAULT_PORT
function choosePort(start = DEFAULT_PORT, max = start + 100) {
  return new Promise(resolve => {
    const tryPort = (p) => {
      if (p > max) return resolve(start); // fallback to default if none found
      const srv = net.createServer();
      srv.once('error', () => { srv.close(() => tryPort(p + 1)); });
      srv.once('listening', () => { srv.close(() => resolve(p)); });
      srv.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}

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

function ensureBackendVenv(backendDir) {
  const venvDir = path.join(backendDir, 'venv');
  const pythonBin = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
  if (fs.existsSync(pythonBin)) return pythonBin;
  appendBackendLog('Backend virtualenv missing – creating at first launch');
  const sysPython = process.platform === 'win32' ? 'python' : 'python3';
  try {
    const res = spawnSync(sysPython, ['--version'], { encoding: 'utf8' });
    if (res.status !== 0) {
      appendBackendLog(`System Python (${sysPython}) not found or not executable.`);
      return 'python';
    }
    spawnSync(sysPython, ['-m', 'venv', venvDir], { stdio: 'inherit' });
  } catch (e) {
    appendBackendLog(`Virtualenv creation failed: ${e.message}`);
    return 'python';
  }
  const pip = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');
  const requirements = path.join(backendDir, 'requirements.txt');
  if (fs.existsSync(pip) && fs.existsSync(requirements)) {
    try {
      appendBackendLog('Installing backend dependencies…');
      spawnSync(pip, ['install', '-r', requirements], { stdio: 'inherit' });
    } catch (e) {
      appendBackendLog(`Dependency install failed: ${e.message}`);
    }
  }
  return pythonBin;
}

function waitForServer(baseUrl, timeout = 10000) {
  // poll /health for readiness (explicit readiness vs TCP accept only)
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(`${baseUrl}/health`, res => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            res.resume();
            return resolve(true);
          }
          res.resume();
          if (Date.now() - start > timeout) return reject(new Error(`Status ${res.statusCode}`));
          setTimeout(check, 350);
        })
        .on('error', err => {
          if (Date.now() - start > timeout) return reject(err);
          setTimeout(check, 350);
        });
    };
    check();
  });
}

function detectSystemPython() {
  const candidates = process.platform === 'win32' ? ['python.exe', 'python'] : ['python3', 'python'];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
      if (r.status === 0) return c;
    } catch { /* ignore */ }
  }
  return null;
}

async function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const userData = app.getPath('userData');
  backendLogFile = path.join(userData, 'backend-startup.log');
  try { fs.writeFileSync(backendLogFile, '--- Backend startup log ---\n'); } catch { /* ignore */ }

  chosenPort = await choosePort(DEFAULT_PORT);
  if (chosenPort !== DEFAULT_PORT) {
    appendBackendLog(`Port ${DEFAULT_PORT} busy – using fallback port ${chosenPort}`);
    sendDiagnostics(`Backend port chosen: ${chosenPort}`);
  }

  const venvPath = process.platform === 'win32'
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python');
  let pythonExecutable = fs.existsSync(venvPath) ? venvPath : 'python';
  if (app.isPackaged && !fs.existsSync(venvPath)) {
    pythonExecutable = ensureBackendVenv(backendDir);
  }

  if (pythonExecutable === 'python') {
    const sysPy = detectSystemPython();
    if (!sysPy) {
      appendBackendLog('No system Python interpreter found. Backend cannot start.');
      sendDiagnostics('Python interpreter missing. Install Python 3.11+ and restart the app.', { fatal: true });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
      return;
    }
  }

  const args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(chosenPort)];
  appendBackendLog(`Spawning backend: ${pythonExecutable} ${args.join(' ')}`);

  // Use parent of backendDir as cwd so that 'backend' is importable as a package (required for backend.main:app)
  const backendParentDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..');
  const env = { ...process.env };
  // Ensure PYTHONPATH contains parent so backend package resolves even if cwd changes elsewhere later
  env.PYTHONPATH = env.PYTHONPATH ? `${backendParentDir}:${env.PYTHONPATH}` : backendParentDir;

  try {
    backendProcess = spawn(pythonExecutable, args, { cwd: backendParentDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    appendBackendLog(`Failed spawning backend process: ${e.message}`);
    sendDiagnostics(`Failed to spawn backend process: ${e.message}`, { fatal: true, code: e.code || null });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
    return;
  }

  backendProcess.stdout.on('data', d => appendBackendLog(d));
  backendProcess.stderr.on('data', d => appendBackendLog(d));
  backendProcess.on('exit', (code, signal) => {
    appendBackendLog(`Backend process exited (code=${code} signal=${signal || 'none'})`);
    sendDiagnostics(`Backend exited unexpectedly (code=${code}).`, { fatal: true });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
  });

  waitForServer(`http://127.0.0.1:${chosenPort}`, 20000)
    .then(() => {
      appendBackendLog('Backend reported healthy on /health');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-ready');
        sendDiagnostics('Backend ready', { port: chosenPort });
      }
    })
    .catch(err => {
      appendBackendLog(`Backend did not become ready in time: ${err.message}`);
      sendDiagnostics('Backend failed to become ready within timeout.', { timeout: true, port: chosenPort });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
    });
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
    const injected = `window.__BACKEND_URL__ = ${JSON.stringify(`http://127.0.0.1:${chosenPort}`)};`;
    mainWindow.webContents.executeJavaScript(injected).catch(err => console.error('Inject URL failed:', err));
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
