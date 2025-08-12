/* eslint-env node */
/* global __dirname, process, console, setTimeout, clearTimeout */
// eslint-disable-next-line no-undef
require('dotenv').config();

// eslint-disable-next-line no-undef
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// Limit V8 heap to reduce runaway memory during heavy operations (adjustable via env)
try { app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${process.env.ELECTRON_MAX_OLD_SPACE || 2048}`); } catch { /* ignore */ }
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
let backendPortFile = process.env.BACKEND_PORT_FILE || null; // optional file for integration tests

// New: simple splash window while backend initializes (e.g., first-run model downloads)
let splashWindow = null;
function showSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  splashWindow = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: '#111111',
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>RevenuePilot – Initializing…</title>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; background: #111; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
        .wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding: 16px; box-sizing: border-box; }
        h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; color: #fff; }
        p { margin: 4px 0; color: #cbd5e1; font-size: 13px; text-align: center; }
        .box { width: 100%; max-width: 420px; background: #0b1220; border: 1px solid #223; border-radius: 8px; padding: 12px; box-sizing: border-box; }
        .progress { position: relative; height: 6px; background: #0f172a; border: 1px solid #1e293b; border-radius: 4px; overflow: hidden; margin-top: 8px; }
        .bar { position:absolute; left:-40%; top:0; height:100%; width:40%; background: linear-gradient(90deg,#22d3ee,#3b82f6); animation: slide 1.4s infinite; }
        @keyframes slide { 0%{ left:-40% } 50%{ left:60% } 100%{ left:100% } }
        pre { margin: 8px 0 0; padding: 8px; height: 120px; overflow: auto; font-size: 11px; line-height: 1.3; background: #0a0f1a; border: 1px solid #1e293b; border-radius: 6px; color: #9fb3c8; }
        .hint { font-size: 12px; color: #94a3b8; margin-top: 8px; }
        .last { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; color:#cbd5e1; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="box">
          <h1>Starting RevenuePilot backend…</h1>
          <p id="status">Initializing. This can take several minutes on first run while models are downloaded.</p>
          <div class="progress"><div class="bar"></div></div>
          <div id="last" class="last"></div>
          <pre id="log"></pre>
          <p class="hint">If this takes too long, ensure your internet connection is stable. The window will continue automatically when ready.</p>
        </div>
      </div>
    </body>
    </html>
  `)}`;
  splashWindow.loadURL(html).catch(() => {});
}
function updateSplash(message, logTail) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = (message || '').replace(/`/g, '\\`');
  const tailArr = Array.isArray(logTail) ? logTail.slice(-80) : [];
  const lastLine = tailArr.length ? tailArr[tailArr.length - 1] : '';
  const safeLast = (lastLine || '').replace(/`/g, '\\`');
  const safeLog = tailArr.join('\n').replace(/`/g, '\\`');
  splashWindow.webContents.executeJavaScript(
    `(() => { const s = document.getElementById('status'); if (s) s.textContent = \`${safeMsg}\`; const pre = document.getElementById('log'); if (pre) pre.textContent = \`${safeLog}\`; const last = document.getElementById('last'); if (last) last.textContent = \`${safeLast}\`; })();`
  ).catch(() => {});
}

// Ring buffer of recent backend startup log lines for diagnostics surfaced in Login UI
// Replaced dynamic array + splice (O(n) churn) with fixed-size circular buffer to avoid
// incremental memory growth and GC pressure under very chatty backends.
const MAX_LOG_LINES = 200;
const MAX_LOG_LINE_LENGTH = 2000; // hard clamp per line
const backendLogBuffer = new Array(MAX_LOG_LINES);
let backendLogWriteIndex = 0; // next position to write
let backendLogSize = 0; // number of valid entries (<= MAX_LOG_LINES)
let backendLogFile; // path to on-disk log file
function appendBackendLog(line) {
  try {
    if (!line) return;
    const cleaned = line.toString().replace(/\r/g, '').trimEnd().slice(0, MAX_LOG_LINE_LENGTH);
    if (!cleaned) return;
    backendLogBuffer[backendLogWriteIndex] = cleaned;
    backendLogWriteIndex = (backendLogWriteIndex + 1) % MAX_LOG_LINES;
    if (backendLogSize < MAX_LOG_LINES) backendLogSize += 1;
    if (backendLogFile) {
      try { fs.appendFileSync(backendLogFile, cleaned + '\n'); } catch { /* ignore disk errors */ }
    }
  } catch { /* defensive */ }
}
function getBackendLogTail(n) {
  const count = Math.min(n, backendLogSize);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    // oldest index among the kept entries
    const idx = (backendLogWriteIndex - count + i + MAX_LOG_LINES) % MAX_LOG_LINES;
    out[i] = backendLogBuffer[idx];
  }
  return out;
}
function sendDiagnostics(message, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend-diagnostics', {
      message,
      logTail: getBackendLogTail(60), // last 60 lines
      logFile: backendLogFile || null,
      ...extra,
    });
  }
  // Update splash concurrently if visible
  try { updateSplash(message, getBackendLogTail(80)); } catch { /* ignore */ }
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

let backendReadyAttempted = false; // prevent duplicate backend spawns
let healthPollTimer = null; // track waitForServer polling timer for cleanup
let lastSplashUpdate = 0;

async function startBackend() {
  if (backendReadyAttempted) { appendBackendLog('startBackend called again – ignoring duplicate invocation'); return; }
  backendReadyAttempted = true;

  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
  const userData = app.getPath('userData');
  backendLogFile = path.join(userData, 'backend-startup.log');
  try { fs.writeFileSync(backendLogFile, '--- Backend startup log ---\n'); } catch { /* ignore */ }

  chosenPort = await choosePort(DEFAULT_PORT);
  if (backendPortFile) { try { fs.writeFileSync(backendPortFile, String(chosenPort)); } catch { /* ignore */ } }
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
      updateSplash('Python 3.11+ not found. Please install Python and restart.');
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
  // Hint Presidio to use a lightweight spaCy model if/when initialized, avoiding large downloads like en_core_web_lg
  if (!env.PRESIDIO_SPACY_MODEL) env.PRESIDIO_SPACY_MODEL = 'en_core_web_sm';

  try {
    backendProcess = spawn(pythonExecutable, args, { cwd: backendParentDir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  } catch (e) {
    appendBackendLog(`Failed spawning backend process: ${e.message}`);
    sendDiagnostics(`Failed to spawn backend process: ${e.message}`, { fatal: true, code: e.code || null });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
    updateSplash('Failed to start backend process. See log for details.');
    return;
  }

  backendProcess.stdout.on('data', d => {
    appendBackendLog(d);
    const now = Date.now();
    if (now - lastSplashUpdate > 500) { lastSplashUpdate = now; updateSplash('Initializing backend…', getBackendLogTail(80)); }
  });
  backendProcess.stderr.on('data', d => {
    appendBackendLog(d);
    const now = Date.now();
    if (now - lastSplashUpdate > 500) { lastSplashUpdate = now; updateSplash('Initializing backend…', getBackendLogTail(80)); }
  });
  backendProcess.on('exit', (code, signal) => {
    appendBackendLog(`Backend process exited (code=${code} signal=${signal || 'none'})`);
    sendDiagnostics(`Backend exited unexpectedly (code=${code}).`, { fatal: true });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-failed');
    updateSplash(`Backend exited unexpectedly (code=${code}). See logs above.`);
  });

  // Cancellable readiness polling. For first-run model downloads, allow long waits.
  const READY_TIMEOUT_MS = parseInt(process.env.BACKEND_READY_TIMEOUT_MS || '900000', 10); // default 15 min
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const poll = () => {
    http.get(`http://127.0.0.1:${chosenPort}/health`, res => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        res.resume();
        appendBackendLog('Backend reported healthy on /health');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-ready');
          sendDiagnostics('Backend ready', { port: chosenPort });
        }
        updateSplash('Backend ready. Launching UI…', getBackendLogTail(40));
        if (healthPollTimer) clearTimeout(healthPollTimer);
        // Create main window on readiness, close splash
        createWindow();
        try { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close(); } catch { /* ignore */ }
        return;
      }
      res.resume();
      if (Date.now() > deadline) {
        // Keep waiting but inform user; do not fail hard since downloads may still be ongoing.
        sendDiagnostics('Still initializing. Large model downloads may be in progress.', { timeout: true, port: chosenPort });
        updateSplash('Still initializing. Large model downloads may be in progress…', getBackendLogTail(80));
      }
      healthPollTimer = setTimeout(poll, 1000);
    }).on('error', () => {
      if (Date.now() > deadline) {
        updateSplash('Still initializing. This can take several minutes on first run…', getBackendLogTail(80));
      }
      healthPollTimer = setTimeout(poll, 1000);
    });
  };
  poll();
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

  // Prevent renderer from navigating away (e.g., window.location = '/') which can cause blank screens in file:// scheme
  mainWindow.webContents.on('will-navigate', (event) => {
    try { event.preventDefault(); } catch { /* ignore */ }
    const safeIndex = resolveIndexHtml();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile(safeIndex).catch(err => console.error('Reload index failed:', err));
    }
  });
  // Block window.open and external navigations
  try {
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  } catch { /* older electron */ }
  // If a load fails for any reason, retry loading our index
  mainWindow.webContents.on('did-fail-load', () => {
    const safeIndex = resolveIndexHtml();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile(safeIndex).catch(err => console.error('Retry load failed:', err));
    }
  });

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
  // Show splash first, then start backend; create main window once backend is healthy
  showSplash();
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { showSplash(); startBackend(); } });
});

app.on('before-quit', () => {
  if (healthPollTimer) { try { clearTimeout(healthPollTimer); } catch { /* ignore */ } }
  if (backendProcess) try { backendProcess.kill(); } catch { /* ignore */ }
});
app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('update-available', () => { console.log('Update available'); });
autoUpdater.on('update-downloaded', () => { console.log('Update downloaded; installing'); autoUpdater.quitAndInstall(); });
autoUpdater.on('error', (err) => { console.error('Auto-update error:', err); });
