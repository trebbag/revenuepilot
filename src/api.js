/* eslint-env browser */
/* global window localStorage fetch setTimeout FormData console URLSearchParams AbortController clearTimeout */
// Placeholder API functions.  In a real deployment these would
// make HTTP requests to a backend service that calls OpenAI or
// other AI models.  For now they simulate asynchronous
// operations with dummy data.

// Keep a reference to the original ``fetch`` so we can implement
// automatic token refresh without recursion.
const rawFetch = globalThis.fetch.bind(globalThis);

// Simplified and hardened backend URL resolver (replaces earlier experimental logic)
function resolveBaseUrl() {
  if (typeof window !== 'undefined' && window.__BACKEND_URL__)
    return window.__BACKEND_URL__;
  try {
    const env =
      typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    if (env && env.VITE_API_URL) return env.VITE_API_URL;
  } catch {
    /* ignore */
  }
  if (
    typeof window !== 'undefined' &&
    window.location &&
    !window.location.origin.startsWith('file:')
  ) {
    return window.location.origin;
  }
  return 'http://127.0.0.1:8000';
}

let __lastBackendError = null; // store last connectivity error details
export function getLastBackendError() {
  return __lastBackendError;
}

// ---------------------------------------------------------------------------
// Offline caching utilities
// ---------------------------------------------------------------------------
const TEMPLATE_CACHE_KEY = 'cache.templates';
const NOTE_CACHE_KEY = 'cache.recentNotes';
const CODE_CACHE_KEY = 'cache.codes';
const OFFLINE_QUEUE_KEY = 'cache.pendingOps';

function loadCache(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function enqueueOffline(op) {
  const q = loadCache(OFFLINE_QUEUE_KEY, []);
  q.push(op);
  saveCache(OFFLINE_QUEUE_KEY, q);
}

async function processOp(op) {
  const baseUrl = resolveBaseUrl();
  const token = localStorage.getItem('token');
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  if (op.type === 'template:create') {
    await rawFetch(`${baseUrl}/templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(op.tpl),
    });
  } else if (op.type === 'template:update') {
    await rawFetch(`${baseUrl}/templates/${op.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(op.tpl),
    });
  } else if (op.type === 'template:delete') {
    await rawFetch(`${baseUrl}/templates/${op.id}`, {
      method: 'DELETE',
      headers,
    });
  } else if (op.type === 'note:autoSave') {
    await rawFetch(`${baseUrl}/api/notes/auto-save`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(op.note),
    });
  }
}

export async function syncOfflineQueue() {
  const q = loadCache(OFFLINE_QUEUE_KEY, []);
  if (!q.length) return;
  const remaining = [];
  for (const op of q) {
    try {
      await processOp(op);
    } catch {
      remaining.push(op);
    }
  }
  saveCache(OFFLINE_QUEUE_KEY, remaining);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineQueue();
  });
  // attempt sync on load
  syncOfflineQueue();
}

function cacheTemplates(list) {
  saveCache(TEMPLATE_CACHE_KEY, list);
}
export function getCachedTemplates() {
  return loadCache(TEMPLATE_CACHE_KEY, []);
}

function cacheRecentNote(note) {
  const notes = loadCache(NOTE_CACHE_KEY, []);
  notes.unshift({ ...note, ts: Date.now() });
  saveCache(NOTE_CACHE_KEY, notes.slice(0, 20));
}
export function getCachedRecentNotes() {
  return loadCache(NOTE_CACHE_KEY, []);
}

function cacheCodes(codes = []) {
  const map = loadCache(CODE_CACHE_KEY, {});
  for (const c of codes) {
    if (c && c.code) map[c.code] = c;
  }
  saveCache(CODE_CACHE_KEY, map);
}
export function getCachedCodes() {
  return loadCache(CODE_CACHE_KEY, {});
}

export async function pingBackend(opts = {}) {
  const { attempts = 3, timeoutMs = 8000, intervalMs = 750 } = opts || {};
  const baseUrl = resolveBaseUrl();
  for (let i = 1; i <= attempts; i++) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now ? performance.now() : Date.now();
      const res = await rawFetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(to);
      if (res.ok) {
        __lastBackendError = null;
        return true;
      }
      __lastBackendError = `Health status ${res.status}`;
    } catch (e) {
      __lastBackendError = e && e.message ? e.message : 'fetch_failed';
    }
    if (i < attempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

/**
 * Authenticate a user and retrieve JWT access and refresh tokens from the backend. After a
 * successful login the user's persisted settings are also fetched.
 * Both tokens and settings are returned to the caller so they can be
 * stored in application state or cached in localStorage. Throws an error
 * when authentication fails.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, settings: object|null}>}
 */
export async function login(username, password, lang = 'en') {
  const baseUrl = resolveBaseUrl();
  let resp;
  try {
    resp = await rawFetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, lang }),
    });
  } catch {
    throw new Error(
      'Cannot reach backend service. Please wait a few seconds for it to start and try again.',
    );
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.message || 'Login failed');
  }
  const data = await resp.json();
  const token = data.access_token;
  const refreshToken = data.refresh_token;
  const settings = data.settings
    ? { ...data.settings, lang, summaryLang: data.settings.summaryLang || lang }
    : { lang, summaryLang: lang };
  const session = data.session || null;
  return { token, refreshToken, settings, session };
}

export async function register(username, password, lang = 'en') {
  const baseUrl = resolveBaseUrl();
  let resp;
  // Prefer /auth/register (idempotent) fall back to /register
  const endpoints = [`${baseUrl}/auth/register`, `${baseUrl}/register`];
  let lastErr;
  for (const url of endpoints) {
    try {
      resp = await rawFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, lang }),
      });
    } catch (e) {
      lastErr = e;
      continue;
    }
    if (resp && resp.ok) break;
    lastErr = await resp
      .json()
      .catch(() => ({ detail: `HTTP ${resp.status}` }));
    if (resp.status < 500) break; // don't try second endpoint for client errors
  }
  if (!resp || !resp.ok) {
    const err =
      lastErr && lastErr.detail ? lastErr : await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.message || 'Registration failed');
  }
  const data = await resp.json();
  const token = data.access_token;
  const refreshToken = data.refresh_token;
  const settings = data.settings
    ? { ...data.settings, lang, summaryLang: data.settings.summaryLang || lang }
    : { lang, summaryLang: lang };
  const session = data.session || null;
  return { token, refreshToken, settings, session };
}

/**
 * Exchange a refresh token for a new access token.
 * @param {string} refreshToken
 */
export async function refreshAccessToken(refreshToken) {
  const baseUrl = resolveBaseUrl();
  const resp = await rawFetch(`${baseUrl}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!resp.ok) throw new Error('Failed to refresh token');
  return await resp.json();
}

/**
 * Reset a user's password. This helper is primarily used by the login UI
 * when a user wishes to change their password without logging in first.
 *
 * @param {string} username
 * @param {string} password Current password
 * @param {string} newPassword New desired password
 */
export async function resetPassword(username, password, newPassword) {
  const baseUrl = resolveBaseUrl();
  const resp = await rawFetch(`${baseUrl}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, new_password: newPassword }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.message || 'Failed to reset password');
  }
  return await resp.json();
}

function clearStoredTokens() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
}

let refreshFailures = 0;

async function authFetch(input, init = {}, retry = true) {
  let resp;
  try {
    resp = await rawFetch(input, init);
  } catch (e) {
    // Network error (backend not reachable). Record last error and return
    // a Response-like object so callers can handle a failed fetch without
    // an uncaught TypeError.
    __lastBackendError = e && e.message ? e.message : 'fetch_failed';
    return {
      ok: false,
      status: 0,
      json: async () => ({ detail: __lastBackendError }),
      text: async () => __lastBackendError,
    };
  }
  if ((resp.status === 401 || resp.status === 403) && retry) {
    const refreshToken =
      typeof window !== 'undefined'
        ? localStorage.getItem('refreshToken')
        : null;
    if (!refreshToken) {
      refreshFailures += 1;
      if (refreshFailures >= 2) clearStoredTokens();
      throw new Error('Unauthorized');
    }
    try {
      const data = await refreshAccessToken(refreshToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', data.access_token);
      }
      const headers = {
        ...(init.headers || {}),
        Authorization: `Bearer ${data.access_token}`,
      };
      resp = await rawFetch(input, { ...init, headers });
    } catch {
      refreshFailures += 1;
      if (refreshFailures >= 2) clearStoredTokens();
      throw new Error('Unauthorized');
    }
    if (resp.status === 401 || resp.status === 403) {
      refreshFailures += 1;
      if (refreshFailures >= 2) clearStoredTokens();
      throw new Error('Unauthorized');
    }
  }
  if (resp.ok) {
    refreshFailures = 0;
  }
  return resp;
}

globalThis.fetch = authFetch;

/**
 * Fetch persisted user settings from the backend.  A JWT must be
 * provided; if omitted the token is read from localStorage which acts as
 * a cache.
 * @param {string} [token]
 * @returns {Promise<object>}
 */
export async function getSettings(token) {
  const baseUrl = resolveBaseUrl();
  const auth =
    token ||
    (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!auth) throw new Error('Not authenticated');

  // Try a few likely endpoints so the frontend is resilient to different
  // backend path configurations (root /settings, /api/settings, etc.). If
  // the server returns 401/403 propagate Unauthorized so callers can handle
  // token refresh; otherwise fall back to an empty settings object so the
  // UI can continue with defaults instead of failing loudly.
  const endpoints = [
    `${baseUrl}/settings`,
    `${baseUrl}/api/settings`,
    `/settings`,
    `/api/settings`,
  ];
  let lastErr = null;
  let resp = null;
  for (const url of endpoints) {
    try {
      resp = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
    } catch (e) {
      // network error — remember and try next endpoint
      lastErr = e;
      continue;
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (resp.ok) break;
    // non-auth client/server error — record and try next
    try {
      const txt = await resp.text();
      lastErr = new Error(`HTTP ${resp.status}: ${txt}`);
    } catch (e) {
      lastErr = new Error(`HTTP ${resp.status}`);
    }
  }

  if (!resp || !resp.ok) {
    // Log underlying issue for diagnostics, but return an empty settings
    // object so the application can continue using defaults.
    __lastBackendError = lastErr
      ? lastErr.message || String(lastErr)
      : 'Failed to fetch settings';
    return {};
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    // Response was not valid JSON (e.g., an HTML error page). Record the
    // response text for diagnostics and return empty settings so the
    // frontend can proceed with defaults.
    try {
      const txt = await resp.text();
      __lastBackendError =
        txt && txt.length > 0
          ? txt.slice(0, 1024)
          : 'Invalid JSON in settings response';
    } catch (ee) {
      __lastBackendError = 'Invalid JSON in settings response';
    }
    return {};
  }
  const categories = data.categories || {};
  return {
    theme: data.theme,
    enableCodes: categories.codes !== false,
    enableCompliance: categories.compliance !== false,
    enablePublicHealth: categories.publicHealth !== false,
    enableDifferentials: categories.differentials !== false,
    rules: data.rules || [],
    lang: data.lang || 'en',
    summaryLang: data.summaryLang || data.lang || 'en',
    specialty: data.specialty || '',
    payer: data.payer || '',
    region: data.region || '',
    template: data.template || null,
    useLocalModels: data.useLocalModels || false,
    useOfflineMode: data.useOfflineMode || false,
    agencies: data.agencies || ['CDC', 'WHO'],
    beautifyModel: data.beautifyModel || '',
    suggestModel: data.suggestModel || '',
    summarizeModel: data.summarizeModel || '',
    deidEngine: data.deidEngine || 'regex',
  };
}

/**
 * Persist user settings to the backend. A JWT may be provided explicitly
 * or will be read from localStorage as a fallback.
 * @param {object} settings
 * @param {string} [token]
 * @returns {Promise<object>}
 */
export async function saveSettings(settings, token) {
  const baseUrl = resolveBaseUrl();
  const auth =
    token ||
    (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!auth) throw new Error('Not authenticated');
  const payload = {
    theme: settings.theme,
    categories: {
      codes: settings.enableCodes,
      compliance: settings.enableCompliance,
      publicHealth: settings.enablePublicHealth,
      differentials: settings.enableDifferentials,
    },
    rules: settings.rules || [],
    lang: settings.lang || 'en',
    summaryLang: settings.summaryLang || settings.lang || 'en',
    specialty: settings.specialty || null,
    payer: settings.payer || null,
    region: settings.region || '',
    template: settings.template || null,
    useLocalModels: settings.useLocalModels || false,
    useOfflineMode: settings.useOfflineMode || false,
    agencies: settings.agencies || [],
    beautifyModel: settings.beautifyModel || null,
    suggestModel: settings.suggestModel || null,
    summarizeModel: settings.summarizeModel || null,
    deidEngine: settings.deidEngine || null,
  };
  const resp = await fetch(`${baseUrl}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('Failed to save settings');
  const data = await resp.json();
  const categories = data.categories || {};
  return {
    theme: data.theme,
    enableCodes: categories.codes !== false,
    enableCompliance: categories.compliance !== false,
    enablePublicHealth: categories.publicHealth !== false,
    enableDifferentials: categories.differentials !== false,
    rules: data.rules || [],
    lang: data.lang || 'en',
    summaryLang: data.summaryLang || data.lang || 'en',
    specialty: data.specialty || '',
    payer: data.payer || '',
    region: data.region || '',
    template: data.template || null,
    useLocalModels: data.useLocalModels || false,
    useOfflineMode: data.useOfflineMode || false,
    agencies: data.agencies || [],
    beautifyModel: data.beautifyModel || '',
    suggestModel: data.suggestModel || '',
    summarizeModel: data.summarizeModel || '',
    deidEngine: data.deidEngine || 'regex',
  };
}

/**
 * Beautify (reformat) the clinical note.  In this stub it simply
 * capitalises the text and trims whitespace.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function beautifyNote(text, lang = 'en', context = {}) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  // If a backend URL is configured, call the API.  Otherwise, fall back to a stub.
  if (baseUrl) {
    const payload = { text, lang };
    if (context.specialty) payload.specialty = context.specialty;
    if (context.payer) payload.payer = context.payer;
    if (typeof context.useLocalModels === 'boolean')
      payload.useLocalModels = context.useLocalModels;
    if (typeof context.useOfflineMode === 'boolean')
      payload.useOfflineMode = context.useOfflineMode;
    if (context.beautifyModel) payload.beautifyModel = context.beautifyModel;
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${baseUrl}/beautify`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    const data = await resp.json();
    return data.beautified;
  }
  // simulate network delay in stub mode
  await new Promise((resolve) => setTimeout(resolve, 500));
  return text.trim().toUpperCase();
}

/**
 * Get coding and clinical suggestions based on the draft note.
 * The returned object has arrays for different suggestion types.
 * @param {string} text
 * @returns {Promise<{codes: {code:string,rationale?:string,upgrade_to?:string}[], compliance: string[], publicHealth: {recommendation:string, reason?:string}[], differentials: {diagnosis:string, score?:number}[], followUp?: {interval:string, ics?:string}}>}  The differential score is a number between 0 and 1.

*/
export async function getSuggestions(text, context = {}) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (baseUrl) {
    // Construct the request payload.  Always include the main note text; add
    // optional chart, rules and audio transcript when provided.  The backend
    // should ignore any empty or missing fields.
    const payload = { text, lang: context.lang };
    if (context.chart) payload.chart = context.chart;
    if (
      context.rules &&
      Array.isArray(context.rules) &&
      context.rules.length > 0
    ) {
      payload.rules = context.rules;
    }
    if (context.audio) payload.audio = context.audio;
    if (typeof context.age === 'number') payload.age = context.age;
    if (context.sex) payload.sex = context.sex;
    if (context.region) payload.region = context.region;
    if (context.specialty) payload.specialty = context.specialty;
    if (context.payer) payload.payer = context.payer;
    if (context.template) payload.template = context.template;
    if (
      context.agencies &&
      Array.isArray(context.agencies) &&
      context.agencies.length > 0
    )
      payload.agencies = context.agencies;
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    if (typeof context.useLocalModels === 'boolean')
      payload.useLocalModels = context.useLocalModels;
    if (typeof context.useOfflineMode === 'boolean')
      payload.useOfflineMode = context.useOfflineMode;
    if (context.suggestModel) payload.suggestModel = context.suggestModel;
    const resp = await fetch(`${baseUrl}/suggest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    const data = await resp.json();
    cacheCodes(data.codes);
    return data;
  }
  // fallback: simulate network delay and return stub suggestions
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!text || text.trim() === '') {
    return {
      codes: [],
      compliance: [],
      publicHealth: [],
      differentials: [],
    };
  }
  // In stub mode, we ignore additional context and return sample suggestions
  const stub = {
    codes: [
      {
        code: '99213',
        rationale: 'Established patient, low complexity',
        upgrade_to: '99214',
        upgradePath: '99213 → 99214 for extended visit time',
      },
      { code: '99395', rationale: 'Annual preventive visit' },
    ],
    compliance: [
      'Include duration of symptoms',
      'Add ROS for cardiovascular system',
    ],
    publicHealth: [
      {
        recommendation: 'Consider flu vaccine',
        reason: 'Seasonal influenza prevention',
        source: 'CDC',
        evidenceLevel: 'A',
      },
      {
        recommendation: 'Screen for depression',
        reason: 'Common in adults',
        source: 'WHO',
        evidenceLevel: 'B',
      },
    ],
    differentials: [
      { diagnosis: 'Influenza', score: 0.6 },
      { diagnosis: 'Acute sinusitis', score: 0.4 },
    ],
    followUp: { interval: '3 months', ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
  };
  cacheCodes(stub.codes);
  return stub;
}

/**
 * Request a follow-up schedule recommendation from the backend.
 * @param {string} text Note text
 * @param {string[]} codes Optional billing codes
 * @returns {Promise<{interval:string|null, ics:string|null}>}
 */
export async function scheduleFollowUp(text, codes = []) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/schedule`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, codes }),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  return await resp.json();
}

/**
 * Generate an ICS file for a follow-up interval.
 * @param {string} interval Textual interval such as "2 weeks"
 * @param {string} summary Event summary (patient name or reason)
 * @returns {Promise<string>} ICS text
 */
export async function exportFollowUp(interval, summary = '') {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/export_ics`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ interval, summary }),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  const data = await resp.json();
  return data.ics;
}

/**
 * Upload an audio ``Blob`` to the backend for transcription.
 * Returns the text transcript or a placeholder if the backend is not
 * configured or the request fails.
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function transcribeAudio(blob, diarise = false) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (baseUrl) {
    const form = new FormData();
    form.append('file', blob, 'audio.webm');
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`${baseUrl}/transcribe?diarise=${diarise}`, {
        method: 'POST',
        body: form,
        headers,
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Unauthorized');
      }
      const data = await resp.json();
      if (data.provider || data.patient) {
        return {
          provider: data.provider || '',
          patient: data.patient || '',
          segments: data.segments || [],
          error: data.error || '',
        };
      }
      if (data.transcript) {
        return {
          provider: data.transcript,
          patient: '',
          segments: data.segments || [],
          error: data.error || '',
        };
      }
    } catch (err) {
      console.error('Transcription error', err);
    }
  }
  // Fallback placeholder when no backend is available
  return {
    provider: `[transcribed ${blob.size} bytes]`,
    patient: '',
    segments: [],
    error: '',
  };
}

/**
 * Retrieve the most recent audio transcript from the backend.
 * @returns {Promise<{provider: string, patient: string}>}
 */
export async function fetchLastTranscript() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (baseUrl) {
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`${baseUrl}/transcribe`, { headers });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Unauthorized');
      }
      const data = await resp.json();
      return {
        provider: data.provider || '',
        patient: data.patient || '',
        segments: data.segments || [],
        error: data.error || '',
      };
    } catch (err) {
      console.error('fetchLastTranscript error', err);
    }
  }
  return { provider: '', patient: '', segments: [], error: '' };
}

/**
 * Log an analytics event.  Sends the event type and optional details to the
 * backend.  If no backend is configured, the call is a no-op.
 * @param {string} eventType
 * @param {object} details
 * @returns {Promise<void>}
 */
export async function logEvent(eventType, details = {}) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) {
    // In stub mode just resolve immediately
    return;
  }
  try {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ eventType, details }),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
  } catch (err) {
    // Suppress errors; analytics should not block UI
    console.error('Failed to log event', err);
  }
}

/**
 * Submit a satisfaction survey to the backend.
 * @param {number} rating 1-5 star rating
 * @param {string} feedback Optional free-text feedback
 */
export async function submitSurvey(rating, feedback = '') {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return;
  try {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${baseUrl}/survey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating, feedback }),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
  } catch (err) {
    console.error('Failed to submit survey', err);
  }
}

/**
 * Fetch aggregated metrics from the backend.  Returns stubbed metrics
 * when no backend is configured.
 * @returns {Promise<object>}
 */
export async function getMetrics(filters = {}) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) {
    // Return stub metrics
    return {
      baseline: {
        total_notes: 0,
        total_beautify: 0,
        total_suggest: 0,
        total_summary: 0,
        total_chart_upload: 0,
        total_audio: 0,
        avg_note_length: 0,
        avg_beautify_time: 0,
        avg_time_to_close: 0,
        revenue_projection: 0,
        revenue_per_visit: 0,
        denial_rate: 0,
        deficiency_rate: 0,
      },
      current: {
        total_notes: 0,
        total_beautify: 0,
        total_suggest: 0,
        total_summary: 0,
        total_chart_upload: 0,
        total_audio: 0,
        avg_note_length: 0,
        avg_beautify_time: 0,
        avg_time_to_close: 0,
        revenue_projection: 0,
        revenue_per_visit: 0,
        denial_rate: 0,
        deficiency_rate: 0,
      },
      improvement: {},
      coding_distribution: {},
      denial_rates: {},
      compliance_counts: {},
      avg_satisfaction: 0,
      public_health_rate: 0,

      clinicians: [],
      timeseries: { daily: [], weekly: [] },
      template_usage: { current: {}, baseline: {} },
    };
  }
  const params = new URLSearchParams();
  if (filters.start) params.append('start', filters.start);
  if (filters.end) params.append('end', filters.end);
  if (filters.clinician) params.append('clinician', filters.clinician);
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${baseUrl}/metrics?${params.toString()}`, {
    headers,
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    throw new Error('Failed to fetch metrics');
  }
  return await resp.json();
}

/**
 * Retrieve persisted backend settings such as the advanced scrubber toggle.
 * Returns an empty object if the backend is unreachable.
 * @returns {Promise<object>}
 */

/**
 * Retrieve custom templates for the current user from the backend.
 * Returns an empty array if the backend is unreachable.
 * @returns {Promise<Array<{id:number,name:string,content:string}>>}
 */
export async function getTemplates(specialty, payer) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const params = new URLSearchParams();
  if (specialty) params.append('specialty', specialty);
  if (payer) params.append('payer', payer);
  const query = params.toString() ? `?${params.toString()}` : '';
  try {
    const resp = await fetch(`${baseUrl}/templates${query}`, { headers });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (!resp.ok) {
      throw new Error('Failed to fetch templates');
    }
    const data = await resp.json();
    cacheTemplates(data);
    return data;
  } catch {
    return getCachedTemplates();
  }
}

/**
 * Persist a custom template for the current user.
 * @param {{name:string, content:string}} tpl
 * @returns {Promise<object>}
 */
export async function createTemplate(tpl) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const offlineTpl = { id: Date.now(), ...tpl };
  try {
    const resp = await fetch(`${baseUrl}/templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tpl),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (!resp.ok) {
      throw new Error('Failed to create template');
    }
    const data = await resp.json();
    cacheTemplates([...getCachedTemplates(), data]);
    return data;
  } catch {
    cacheTemplates([...getCachedTemplates(), offlineTpl]);
    enqueueOffline({ type: 'template:create', tpl: offlineTpl });
    return offlineTpl;
  }
}

/**
 * Update an existing custom template by id.
 * @param {number} id
 * @param {{name:string, content:string}} tpl
 * @returns {Promise<object>}
 */
export async function updateTemplate(id, tpl) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const offlineTpl = { id, ...tpl };
  try {
    const resp = await fetch(`${baseUrl}/templates/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(tpl),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (!resp.ok) {
      throw new Error('Failed to update template');
    }
    const data = await resp.json();
    const list = getCachedTemplates().map((t) => (t.id === id ? data : t));
    cacheTemplates(list);
    return data;
  } catch {
    const list = getCachedTemplates().map((t) =>
      t.id === id ? offlineTpl : t,
    );
    cacheTemplates(list);
    enqueueOffline({ type: 'template:update', id, tpl: offlineTpl });
    return offlineTpl;
  }
}

/**
 * Delete a custom template by its identifier.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteTemplate(id) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const resp = await fetch(`${baseUrl}/templates/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (!resp.ok) {
      throw new Error('Failed to delete template');
    }
  } catch {
    enqueueOffline({ type: 'template:delete', id });
  }
  cacheTemplates(getCachedTemplates().filter((t) => t.id !== id));
}

export async function getPromptTemplates() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return {};
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${baseUrl}/prompt-templates`, { headers });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    throw new Error('Failed to fetch prompt templates');
  }
  return await resp.json();
}

export async function savePromptTemplates(data) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return data;
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/prompt-templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save prompt templates');
  }
  return await resp.json();
}

/**
 * Send the OpenAI API key to the backend for persistent storage.  This
 * allows the user to configure the key through the UI instead of
 * environment variables.  If no backend is configured, the call
 * returns immediately.
 * @param {string} key
 * @returns {Promise<void>}
 */
/**
 * Send the OpenAI API key to the backend for persistent storage.  This
 * allows the user to configure the key through the UI instead of
 * environment variables.  Returns the status string from the server.
 *
 * @param {string} key
 * @returns {Promise<{status: string, message?: string}>}
 */
export async function setApiKey(key) {
  // Compute the backend URL.  This falls back to a global injected
  // BACKEND_URL or the current origin.  If none is found, throw an
  // explicit error so the caller can handle the missing configuration.
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) {
    throw new Error('Backend URL not set');
  }
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/apikey`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key }),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || 'Failed to save key');
  }
  return await resp.json();
}

/**
 * Auto-save note content locally and queue server sync.
 * @param {string} noteId
 * @param {string} content
 */
export async function createNote({
  patientId,
  encounterId,
  template,
  content,
} = {}) {
  if (!patientId) {
    throw new Error('patientId is required to create a note');
  }
  const baseUrl = resolveBaseUrl();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const body = {
    patientId,
    content: typeof content === 'string' ? content : '',
  };
  if (encounterId) body.encounterId = encounterId;
  if (template !== undefined && template !== null && template !== '') {
    body.template = template;
  }
  const resp = await rawFetch(`${baseUrl}/api/notes/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    let message = 'Failed to create note';
    try {
      const err = await resp.json();
      message = err?.detail || err?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return await resp.json();
}

export async function autoSaveNote(noteId, content) {
  if (!noteId) return;
  const resolvedId = String(noteId);
  const note = { note_id: resolvedId, content };
  cacheRecentNote({ noteId: resolvedId, content });
  const baseUrl = resolveBaseUrl();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  try {
    const resp = await rawFetch(`${baseUrl}/api/notes/auto-save`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ note_id: resolvedId, content }),
    });
    if (!resp.ok) throw new Error('Failed');
  } catch {
    enqueueOffline({ type: 'note:autoSave', note });
  }
}

/**
 * Fetch code metadata with offline cache fallback.
 * @param {string[]} codes
 */
export async function getCodeDetails(codes = []) {
  const baseUrl = resolveBaseUrl();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  try {
    const resp = await rawFetch(`${baseUrl}/api/codes/details/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ codes }),
    });
    if (!resp.ok) throw new Error('Failed');
    const data = await resp.json();
    cacheCodes(data);
    return data;
  } catch {
    const cache = getCachedCodes();
    return codes.map((c) => cache[c]).filter(Boolean);
  }
}

/**
 * Export a note to an EHR system. Requires an admin token.
 * @param {string} note
 * @param {string[]} [codes]
 * @param {string} [patientId]
 * @param {string} [encounterId]
 * @param {string} [token]
 */
export async function exportToEhr(
  note,
  codes = [],
  patientID = '',
  encounterID = '',
  procedures = [],
  medications = [],
  direct = false,
  token,
) {
  // ``direct`` acts as a frontend toggle. When false the function resolves
  // immediately without contacting the backend so the caller can simply copy
  // the note manually. This keeps the UI logic straightforward while allowing
  // opt‑in EHR submission.
  if (!direct) {
    return { status: 'skipped' };
  }

  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const auth =
    token ||
    (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!auth) return { status: 'error', detail: 'Not authenticated' };
  try {
    const resp = await fetch(`${baseUrl}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
      },
      body: JSON.stringify({
        note,
        codes,
        patientID,
        encounterID,
        procedures,
        medications,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        status: 'error',
        detail: data.detail || data.message || 'Export failed',
      };
    }
    return data; // may include {status: exported|bundle|error, bundle?, response?}
  } catch (err) {
    return { status: 'error', detail: err.message };
  }
}

/**
 * Generate a patient‑friendly summary of the clinical note.  Sends the
 * note (and optional context) to the backend /summarize endpoint.  In
 * fallback mode when no backend is configured, it returns the first
 * sentence or a truncated version of the note.
 * @param {string} text
 * @param {object} context
 * @returns {Promise<string>}
 */
export async function summarizeNote(text, context = {}) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (baseUrl) {
    const payload = { text };
    if (context.lang) payload.lang = context.lang;
    if (context.patientAge != null) payload.patientAge = context.patientAge;
    if (context.chart) payload.chart = context.chart;
    if (context.audio) payload.audio = context.audio;
    if (context.specialty) payload.specialty = context.specialty;
    if (context.payer) payload.payer = context.payer;
    if (typeof context.useLocalModels === 'boolean')
      payload.useLocalModels = context.useLocalModels;
    if (context.summarizeModel) payload.summarizeModel = context.summarizeModel;
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token
        ? {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          }
        : { 'Content-Type': 'application/json' };
      const resp = await fetch(`${baseUrl}/summarize`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Unauthorized');
      }
      const data = await resp.json();
      return {
        summary: data.summary || '',
        recommendations: data.recommendations || [],
        warnings: data.warnings || [],
      };
    } catch (err) {
      console.error('Error summarizing note:', err);
      // fall through to stub behaviour
    }
  }
  // fallback: return the first sentence or first 200 characters
  if (!text) return { summary: '', recommendations: [], warnings: [] };
  // Try to extract the first sentence by splitting on period; otherwise truncate
  const sentences = text.split(/\.(\s|$)/);
  let summary = sentences[0];
  if (!summary || summary.length < 5) {
    summary = text.slice(0, 200);
  }
  if (text.length > summary.length) {
    summary = summary.trim();
    if (!summary.endsWith('...')) summary += '...';
  }
  return { summary, recommendations: [], warnings: [] };
}

/**
 * Fetch recent analytics events from the backend for troubleshooting/logging.
 * Returns an array of objects with eventType, timestamp and details.  If no
 * backend is configured, returns an empty array.
 * @returns {Promise<Array<{eventType: string, timestamp: number, details: object}>>}
 */
export async function getEvents() {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return [];
  try {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await rawFetch(`${baseUrl}/events`, { headers });
    if (resp.status === 401 || resp.status === 403)
      throw new Error('Unauthorized');
    if (!resp.ok) throw new Error('Failed to fetch events');
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    throw new Error('Failed to fetch events');
  }
}

export async function getUserSession() {
  const baseUrl = resolveBaseUrl();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await rawFetch(`${baseUrl}/api/user/session`, { headers });
  if (!resp.ok) throw new Error('Failed to fetch session');
  return await resp.json();
}

export async function putUserSession(state) {
  const baseUrl = resolveBaseUrl();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await rawFetch(`${baseUrl}/api/user/session`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(state || {}),
  });
  if (!resp.ok) throw new Error('Failed to save session');
  return await resp.json();
}

export function getBackendBaseUrl() {
  return resolveBaseUrl();
}
