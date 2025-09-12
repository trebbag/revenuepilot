/* Simple mock backend for RevenuePilot used during frontend development.

   Provides minimal implementations of endpoints the frontend expects so the
   app is functional without the Python backend. This mock stores data in
   memory and signs JWTs with a development secret.
*/
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.DEV_JWT_SECRET || 'revenuepilot-dev-secret';
const ACCESS_TTL = 60 * 60; // 1h

// In-memory stores
const users = new Map(); // username -> { password, role }
const refreshStore = new Map(); // refreshToken -> username
const settingsStore = new Map(); // username -> settings
const events = [];

// bootstrap a default user
if (!users.has('demo')) {
  users.set('demo', { password: 'demo', role: 'admin' });
  settingsStore.set('demo', { theme: 'modern', lang: 'en', summaryLang: 'en' });
}

function signAccessToken(username, role) {
  return jwt.sign({ sub: username, role }, JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

function createRefreshToken(username) {
  const token = crypto.randomBytes(24).toString('hex');
  refreshStore.set(token, { username, created: Date.now() });
  return token;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth)
    return res.status(401).json({ detail: 'Missing Authorization header' });
  const parts = auth.split(' ');
  if (parts.length !== 2)
    return res.status(401).json({ detail: 'Invalid Authorization header' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = { username: data.sub, role: data.role };
    next();
  } catch (e) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), db: true });
});

app.post('/login', (req, res) => {
  const { username, password, lang } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ detail: 'Missing credentials' });
  const u = users.get(username);
  if (!u || u.password !== password)
    return res.status(401).json({ detail: 'Invalid username or password' });
  const access_token = signAccessToken(username, u.role);
  const refresh_token = createRefreshToken(username);
  const settings = settingsStore.get(username) || {
    lang: lang || 'en',
    summaryLang: lang || 'en',
  };
  res.json({ access_token, refresh_token, settings });
});

app.post('/auth/register', (req, res) => {
  const { username, password, lang } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ detail: 'Missing fields' });
  if (users.has(username))
    return res.status(409).json({ detail: 'User exists' });
  users.set(username, { password, role: 'user' });
  settingsStore.set(username, {
    theme: 'modern',
    lang: lang || 'en',
    summaryLang: lang || 'en',
  });
  const access_token = signAccessToken(username, 'user');
  const refresh_token = createRefreshToken(username);
  res.json({
    access_token,
    refresh_token,
    settings: settingsStore.get(username),
  });
});

app.post('/register', (req, res) => app._router.handle(req, res, () => {})); // alias handled above

app.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token)
    return res.status(400).json({ detail: 'No refresh token' });
  const stored = refreshStore.get(refresh_token);
  if (!stored) return res.status(401).json({ detail: 'Invalid refresh token' });
  const username = stored.username;
  const u = users.get(username);
  const access_token = signAccessToken(username, u.role);
  res.json({ access_token });
});

app.get('/settings', authMiddleware, (req, res) => {
  const username = req.user.username;
  const s = settingsStore.get(username) || {
    theme: 'modern',
    lang: 'en',
    summaryLang: 'en',
  };
  res.json({
    ...s,
    categories: {
      codes: true,
      compliance: true,
      publicHealth: true,
      differentials: true,
    },
    rules: [],
  });
});

app.post('/settings', authMiddleware, (req, res) => {
  const username = req.user.username;
  const settings = req.body || {};
  settingsStore.set(username, settings);
  res.json({ status: 'ok' });
});

app.get('/transcribe', authMiddleware, (req, res) => {
  // Return a small static transcript for UX testing
  res.json({
    provider: 'Dr. Smith',
    patient: 'Jane Doe',
    segments: [{ text: 'Patient reports mild headache.' }],
  });
});

app.post('/suggest', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  // Return deterministic stub suggestions
  const codes =
    text && text.toLowerCase().includes('cough')
      ? [{ code: '99213', rationale: 'Visit level' }]
      : [{ code: '99214', rationale: 'Complex visit' }];
  res.json({
    codes,
    compliance: ['Ensure follow-up'],
    publicHealth: [],
    differentials: [
      { diagnosis: 'Viral upper respiratory infection', score: 0.7 },
    ],
  });
});

app.post('/beautify', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ detail: 'Missing text' });
  const beautified = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1');
  res.json({ beautified });
});

app.post('/summarize', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ summary: '' });
  const summary = text.split('.')[0] || text.slice(0, 100);
  res.json({ summary, recommendations: [], warnings: [] });
});

app.post('/export', authMiddleware, (req, res) => {
  // Return a bundle placeholder
  res.json({ status: 'bundle', bundle: { id: 'bundle-123', entries: [] } });
});

app.post('/apikey', authMiddleware, (req, res) => {
  // pretend to persist key
  res.json({ status: 'ok' });
});

app.post('/event', (req, res) => {
  const evt = { timestamp: Date.now(), ...req.body };
  events.push(evt);
  res.json({ status: 'ok' });
});

app.get('/events', (req, res) => {
  res.json(events.slice(-200));
});

app.listen(PORT, () => {
  console.log(
    `Mock RevenuePilot backend listening on http://localhost:${PORT}`,
  );
});
