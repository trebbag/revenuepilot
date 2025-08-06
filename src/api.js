// Placeholder API functions.  In a real deployment these would
// make HTTP requests to a backend service that calls OpenAI or
// other AI models.  For now they simulate asynchronous
// operations with dummy data.

/**
 * Authenticate a user and retrieve a JWT from the backend. After a
 * successful login the user's persisted settings are also fetched.
 * Both the token and settings are returned to the caller so they can be
 * stored in application state or cached in localStorage. Throws an error
 * when authentication fails.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, settings: object|null}>}
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
    throw new Error(err.detail || err.message || 'Login failed');
  }
  const data = await resp.json();
  const token = data.access_token;
  // Fetch persisted settings after successful login
  let settings = null;
  try {
    const s = await getSettings(token);
    settings = s;
  } catch (e) {
    console.error('Failed to fetch settings', e);
  }
  return { token, settings };
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
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const resp = await fetch(`${baseUrl}/reset-password`, {
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

/**
 * Fetch persisted user settings from the backend.  A JWT must be
 * provided; if omitted the token is read from localStorage which acts as
 * a cache.
 * @param {string} [token]
 * @returns {Promise<object>}
 */
export async function getSettings(token) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const auth =
    token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!auth) throw new Error('Not authenticated');
  const resp = await fetch(`${baseUrl}/settings`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  if (!resp.ok) throw new Error('Failed to fetch settings');
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
    specialty: data.specialty || '',
    payer: data.payer || '',
    region: data.region || '',
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
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const auth =
    token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
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
    specialty: settings.specialty || null,
    payer: settings.payer || null,
    region: settings.region || '',
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
  return await resp.json();
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
 * @returns {Promise<{codes: {code:string,rationale?:string,upgrade_to?:string}[], compliance: string[], publicHealth: {recommendation:string, reason?:string}[], differentials: {diagnosis:string, score?:number}[], followUp?: string}>}  The differential score is a number between 0 and 1.

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
    if (context.specialty) payload.specialty = context.specialty;
    if (context.payer) payload.payer = context.payer;
    if (context.template) payload.template = context.template;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${baseUrl}/suggest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
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
      {
        code: '99213',
        rationale: 'Established patient, low complexity',
        upgrade_to: '99214',
        upgradePath: '99213 → 99214 for extended visit time',
      },
      { code: '99395', rationale: 'Annual preventive visit' },
    ],
    compliance: ['Include duration of symptoms', 'Add ROS for cardiovascular system'],
    publicHealth: [
      { recommendation: 'Consider flu vaccine', reason: 'Seasonal influenza prevention' },
      { recommendation: 'Screen for depression', reason: 'Common in adults' },
    ],
    differentials: [
      { diagnosis: 'Influenza', score: 0.6 },
      { diagnosis: 'Acute sinusitis', score: 0.4 },
    ],
    followUp: '3 months',
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`${baseUrl}/transcribe`, { headers });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Unauthorized');
      }
      const data = await resp.json();
      return { provider: data.provider || '', patient: data.patient || '' };
    } catch (err) {
      console.error('fetchLastTranscript error', err);
    }
  }
  return { provider: '', patient: '' };
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
      avg_satisfaction: 0,
      public_health_rate: 0,
      compliance_counts: {},
      top_compliance: [],
      clinicians: [],
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
export async function getTemplates() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return [];
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${baseUrl}/templates`, { headers });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    throw new Error('Failed to fetch templates');
  }
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
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    throw new Error('Failed to create template');
  }
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
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) {
    throw new Error('Failed to update template');
  }
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
}

export async function getPromptTemplates() {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  if (!baseUrl) return {};
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
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
 * Export a note to an EHR system. Requires an admin token.
 * @param {string} note
 * @param {string} [token]
 */
export async function exportToEhr(note, token) {
  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;
  const auth =
    token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!auth) throw new Error('Not authenticated');
  const resp = await fetch(`${baseUrl}/export_to_ehr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify({ note }),
  });
  if (!resp.ok) throw new Error('Export failed');
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
    if (context.specialty) payload.specialty = context.specialty;
    if (context.payer) payload.payer = context.payer;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch(`${baseUrl}/events`, { headers });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Unauthorized');
    }
    if (!resp.ok) {
      throw new Error('Failed to fetch events');
    }
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching events:', err);
    throw err;
  }
}
