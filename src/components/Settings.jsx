// Settings page component for RevenuePilot.
// Allows the user to toggle which suggestion categories are shown and switch colour themes.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.js';
import { setApiKey, saveSettings } from '../api.js';


const SPECIALTIES = ['', 'cardiology', 'dermatology'];
const PAYERS = ['', 'medicare', 'aetna'];

function Settings({ settings, updateSettings }) {
  const { t } = useTranslation();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [templates, setTemplates] = useState([]);
  const handleDeleteTemplate = (id) => {
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
  };
  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    updateSettings(updated);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error(e);
    }

  };
  const handleThemeChange = async (event) => {
    const updated = { ...settings, theme: event.target.value };
    updateSettings(updated);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error(e);
    }
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

  const handleLangChange = async (event) => {
    const newLang = event.target.value;
    if (newLang === settings.lang) return;
    const updated = { ...settings, lang: newLang };
    updateSettings(updated);
    i18n.changeLanguage(newLang);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSpecialtyChange = async (event) => {
    const updated = { ...settings, specialty: event.target.value };
    updateSettings(updated);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePayerChange = async (event) => {
    const updated = { ...settings, payer: event.target.value };
    updateSettings(updated);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="settings-page" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h2>{t('settings.title')}</h2>
      <h3>{t('settings.apiKey')}</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>{t('settings.apiKeyHelp')}</p>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk-... (e.g., sk-proj-...)"
          style={{ flexGrow: 1, padding: '0.5rem', border: '1px solid var(--disabled)', borderRadius: '4px' }}
        />
        <button onClick={handleSaveKey} style={{ marginLeft: '0.5rem' }}>{t('settings.saveKey')}</button>
      </div>
      {apiKeyStatus && <p style={{ color: 'var(--secondary)' }}>{apiKeyStatus}</p>}

      <h3>{t('settings.theme')}</h3>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="modern"
          checked={settings.theme === 'modern'}
          onChange={handleThemeChange}
        />{' '}
        {t('settings.modern')}
      </label>

      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="dark"
          checked={settings.theme === 'dark'}
          onChange={handleThemeChange}
        />{' '}
        {t('settings.dark')}
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="radio"
          name="theme"
          value="warm"
          checked={settings.theme === 'warm'}
          onChange={handleThemeChange}
        />{' '}
        {t('settings.warm')}
      </label>

      <h3>{t('settings.suggestionCategories')}</h3>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableCodes}
          onChange={() => handleToggle('enableCodes')}
        />{' '}
        {t('settings.showCodes')}
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableCompliance}
          onChange={() => handleToggle('enableCompliance')}
        />{' '}
        {t('settings.showCompliance')}
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enablePublicHealth}
          onChange={() => handleToggle('enablePublicHealth')}
        />{' '}
        {t('settings.showPublicHealth')}
      </label>
      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={settings.enableDifferentials}
          onChange={() => handleToggle('enableDifferentials')}
        />{' '}
        {t('settings.showDifferentials')}
      </label>

      <h3>{t('settings.customRules')}</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>{t('settings.customRulesHelp')}</p>
      <textarea
        value={(settings.rules || []).join('\n')}
        onChange={async (e) => {
          const lines = e.target.value
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
          const updated = { ...settings, rules: lines };
          updateSettings(updated);
          try {
            await saveSettings(updated);
          } catch (err) {
            console.error(err);
          }
        }}
        rows={5}
        style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--disabled)' }}
        placeholder={t('settings.customRulesPlaceholder')}
      />
  <h3>{t('settings.language')}</h3>
  <select value={settings.lang} onChange={handleLangChange}>
    <option value="en">{t('settings.english')}</option>
    <option value="es">{t('settings.spanish')}</option>
  </select>

      <h3>{t('settings.specialty')}</h3>
      <select
        value={settings.specialty || ''}
        onChange={handleSpecialtyChange}
        style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', border: '1px solid var(--disabled)', borderRadius: '4px' }}
      >
        {SPECIALTIES.map((s) => (
          <option key={s} value={s}>
            {s || '--'}
          </option>
        ))}
      </select>

      <h3>{t('settings.payer')}</h3>
      <select
        value={settings.payer || ''}
        onChange={handlePayerChange}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--disabled)', borderRadius: '4px' }}
      >
        {PAYERS.map((p) => (
          <option key={p} value={p}>
            {p || '--'}
          </option>
        ))}
      </select>

      <h3>{t('settings.templates')}</h3>
      <ul>

        {templates.map((tpl) => (
          <li key={tpl.id}>
            {tpl.name}{' '}
            <button onClick={() => handleDeleteTemplate(tpl.id)}>{t('templatesModal.delete')}</button>
          </li>
        ))}
        {templates.length === 0 && <li>{t('settings.noTemplates')}</li>}
      </ul>
    </div>
  );
}

export default Settings;
