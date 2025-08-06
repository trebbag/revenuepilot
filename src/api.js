// Placeholder API functions.  In a real deployment these would
// make HTTP requests to a backend service that calls OpenAI or
// other AI models.  For now they simulate asynchronous
// operations with dummy data.

/**
 * Authenticate a user and retrieve a JWT from the backend. The token is
 * returned to the caller so it can be persisted in localStorage or other
 * storage. Throws an error when authentication fails.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} JWT access token
 */
export async function login(username, password) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const resp = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }
  const data = await resp.json();
  // Backend returns token under access_token
  return data.access_token;
}

/**
 * Fetch persisted user settings from the backend.
 * Requires a valid JWT stored in localStorage.
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) throw new Error('Not authenticated');
  const resp = await fetch(`${baseUrl}/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('Failed to fetch settings');
  return await resp.json();
}

/**
 * Persist user settings to the backend.
 * Requires authentication and mirrors the payload returned from getSettings.
 * @param {object} settings
 * @returns {Promise<object>}
 */
export async function saveSettings(settings) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) throw new Error('Not authenticated');
  const resp = await fetch(`${baseUrl}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settings),
  });
  if (!resp.ok) throw new Error('Failed to save settings');
  return await resp.json();
}

/**
 * Beautify (reformat) the clinical note.  In this stub it simply
 * capitalises the text and trims whitespace.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function beautifyNote(text, lang = 'en') {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  // If a backend URL is configured, call the API.  Otherwise, fall back to a stub.
  if (baseUrl) {
    const resp = await fetch(`${baseUrl}/beautify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });
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
 * @returns {Promise<{codes: string[], compliance: string[], publicHealth: string[], differentials: string[]}>}
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
    if (context.rules && Array.isArray(context.rules) && context.rules.length > 0) {
      payload.rules = context.rules;
    }
    if (context.audio) payload.audio = context.audio;
    if (typeof context.age === 'number') payload.age = context.age;
    if (context.sex) payload.sex = context.sex;
    if (context.region) payload.region = context.region;
    const resp = await fetch(`${baseUrl}/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await resp.json();
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
  return {
    codes: [
      { code: '99213', rationale: 'Established patient, low complexity' },
      { code: '99395', rationale: 'Annual preventive visit' },
    ],
    compliance: ['Include duration of symptoms', 'Add ROS for cardiovascular system'],
    publicHealth: ['Consider flu vaccine', 'Screen for depression'],
    differentials: ['Influenza', 'Acute sinusitis'],
  };
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
      const resp = await fetch(`${baseUrl}/transcribe?diarise=${diarise}`, {
        method: 'POST',
        body: form,
      });
      const data = await resp.json();
      if (data.provider || data.patient) {
        return { provider: data.provider || '', patient: data.patient || '' };
      }
      if (data.transcript) {
        return { provider: data.transcript, patient: '' };
      }
    } catch (err) {
      console.error('Transcription error', err);
    }
  }
  // Fallback placeholder when no backend is available
  return { provider: `[transcribed ${blob.size} bytes]`, patient: '' };
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
    await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, details }),
    });
  } catch (err) {
    // Suppress errors; analytics should not block UI
    console.error('Failed to log event', err);
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
      total_notes: 0,
      total_beautify: 0,
      total_suggest: 0,
      total_summary: 0,
      total_chart_upload: 0,
      total_audio: 0,
      avg_note_length: 0,
      avg_beautify_time: 0,
      avg_close_time: 0,
      revenue_per_visit: 0,
      coding_distribution: {},
      denial_rate: 0,
      denial_rates: {},
      deficiency_rate: 0,
      timeseries: { daily: [], weekly: [] },
    };
  }
  const params = new URLSearchParams();
  if (filters.start) params.append('start', filters.start);
  if (filters.end) params.append('end', filters.end);
  if (filters.clinician) params.append('clinician', filters.clinician);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${baseUrl}/metrics?${params.toString()}`, { headers });
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
export async function getTemplates() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return [];
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${baseUrl}/templates`, { headers });
  if (!resp.ok) return [];
  return await resp.json();
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
  if (!baseUrl) return tpl;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(tpl),
  });
  return await resp.json();
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
  if (!baseUrl) return { id, ...tpl };
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
  const resp = await fetch(`${baseUrl}/templates/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(tpl),
  });
  return await resp.json();
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
  if (!baseUrl) return;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  await fetch(`${baseUrl}/templates/${id}`, {
    method: 'DELETE',
    headers,
  });
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
  const resp = await fetch(`${baseUrl}/apikey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || 'Failed to save key');
  }
  return await resp.json();
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
    const payload = { text, lang: context.lang };
    if (context.chart) payload.chart = context.chart;
    if (context.audio) payload.audio = context.audio;
    try {
      const resp = await fetch(`${baseUrl}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      return data.summary || '';
    } catch (err) {
      console.error('Error summarizing note:', err);
      // fall through to stub behaviour
    }
  }
  // fallback: return the first sentence or first 200 characters
  if (!text) return '';
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
  return summary;
}

/**
 * Fetch recent analytics events from the backend for troubleshooting/logging.
 * Returns an array of objects with eventType, timestamp and details.  If no
 * backend is configured, returns an empty array.
 * @returns {Promise<Array<{eventType: string, timestamp: number, details: object}>>}
 */
export async function getEvents() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) {
    return [];
  }
  try {
    const resp = await fetch(`${baseUrl}/events`);
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching events:', err);
    return [];
  }
}
