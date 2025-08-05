// Settings page component for RevenuePilot.
// Allows the user to toggle which suggestion categories are shown and switch colour themes.

import { useState, useEffect } from 'react';
import { setApiKey, updateServerSettings, getTemplates, deleteTemplate } from '../api.js';

function Settings({ settings, updateSettings }) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [templates, setTemplates] = useState([]);
  const handleToggle = (key) => {
    updateSettings({ ...settings, [key]: !settings[key] });
  };
  const handleThemeChange = (event) => {
    updateSettings({ ...settings, theme: event.target.value });
  };
  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await setApiKey(apiKeyInput.trim());
      // The backend returns {status: 'saved'} on success or an
      // object with a message on failure.  Display the appropriate
      // status message.
      setApiKeyStatus(res.status === 'saved' ? 'Saved' : res.message);
    } catch (e) {
      // If the API call throws, surface the error message to the user.
      setApiKeyStatus(e.message);
    } finally {
      // Clear the input to avoid leaving the secret in the UI
      setApiKeyInput('');
      // Clear the status after a short delay
      setTimeout(() => setApiKeyStatus(''), 4000);
    }
  };
  const handleAdvancedToggle = async () => {
    const newVal = !settings.advancedScrubbing;
    updateSettings({ ...settings, advancedScrubbing: newVal });
    try {
      await updateServerSettings({ advanced_scrubber: newVal });
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    getTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);
  const handleDeleteTemplate = async (id) => {
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error(e);
    }
  };
  return (
    <div className="settings-page" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h2>Settings</h2>
      <h3>OpenAI API Key</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        Enter your OpenAI API key here. The key will be stored securely on your
        machine and used by the backend to call the language model. You can
        update it at any time.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk-... (e.g., sk-proj-...)"
          style={{ flexGrow: 1, padding: '0.5rem', border: '1px solid var(--disabled)', borderRadius: '4px' }}
        />
        <button onClick={handleSaveKey} style={{ marginLeft: '0.5rem' }}>Save Key</button>
      </div>
      {apiKeyStatus && <p style={{ color: 'var(--secondary)' }}>{apiKeyStatus}</p>}

      <h3>Theme</h3>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="modern"
          checked={settings.theme === 'modern'}
          onChange={handleThemeChange}
        />{' '}
        Modern Minimal
      </label>

      <h3>Privacy</h3>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.advancedScrubbing}
          onChange={handleAdvancedToggle}
        />{' '}
        Enable advanced PHI scrubbing
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="dark"
          checked={settings.theme === 'dark'}
          onChange={handleThemeChange}
        />{' '}
        Dark Elegance
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="warm"
          checked={settings.theme === 'warm'}
          onChange={handleThemeChange}
        />{' '}
        Warm Professional
      </label>

      <h3>Suggestion Categories</h3>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableCodes}
          onChange={() => handleToggle('enableCodes')}
        />{' '}
        Show Codes & Rationale
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableCompliance}
          onChange={() => handleToggle('enableCompliance')}
        />{' '}
        Show Compliance Alerts
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enablePublicHealth}
          onChange={() => handleToggle('enablePublicHealth')}
        />{' '}
        Show Public Health Prompts
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableDifferentials}
          onChange={() => handleToggle('enableDifferentials')}
        />{' '}
        Show Differential Diagnoses
      </label>

      <h3>Custom Clinical Rules</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        Enter one rule per line. These rules will be passed to the AI model to
        customise suggestions based on payer or clinic‑specific requirements.
      </p>
      <textarea
        value={(settings.rules || []).join('\n')}
        onChange={(e) => {
          const lines = e.target.value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
          updateSettings({ ...settings, rules: lines });
        }}
        rows={5}
        style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--disabled)' }}
        placeholder="e.g. Commercial payer X requires three ROS for 99214; Include time spent on counselling for CPT 99406"
      />
      <h3>Templates</h3>
      <ul>
        {templates.map((tpl) => (
          <li key={tpl.id}>
            {tpl.name}{' '}
            <button onClick={() => handleDeleteTemplate(tpl.id)}>Delete</button>
          </li>
        ))}
        {templates.length === 0 && <li>No templates</li>}
      </ul>
    </div>
  );
}

export default Settings;