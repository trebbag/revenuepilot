// Settings page component for RevenuePilot.
// Allows the user to toggle which suggestion categories are shown and switch colour themes.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.js';
import {
  setApiKey,
  saveSettings,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../api.js';

const SPECIALTIES = ['', 'cardiology', 'dermatology'];
const PAYERS = ['', 'medicare', 'aetna'];
const API_KEY_REGEX = /^sk-(?:proj-)?[A-Za-z0-9]{16,}$/;
// Region/country codes are user-entered to keep the list flexible

function Settings({ settings, updateSettings }) {
  const { t } = useTranslation();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [templates, setTemplates] = useState([]);
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [tplError, setTplError] = useState(null);

  useEffect(() => {
    getTemplates()
      .then((data) => setTemplates(data))
      .catch((e) => {
        if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
          alert(t('dashboard.accessDenied'));
          localStorage.removeItem('token');
          window.location.href = '/';
        } else {
          setTplError(e.message);
        }
      });
  }, []);

  const handleDeleteTemplate = async (id) => {
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    } catch (e) {
      if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
        alert(t('dashboard.accessDenied'));
        localStorage.removeItem('token');
        window.location.href = '/';
      } else {
        setTplError(e.message);
      }
    }
  };

  const handleEditTemplate = (tpl) => {
    setEditingId(tpl.id);
    setTplName(tpl.name);
    setTplContent(tpl.content);
  };

  const handleSaveTemplate = async () => {
    if (!tplName.trim() || !tplContent.trim()) return;
    try {
      if (editingId) {
        const updated = await updateTemplate(editingId, {
          name: tplName.trim(),
          content: tplContent.trim(),
        });
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? updated : t)),
        );
      } else {
        const created = await createTemplate({
          name: tplName.trim(),
          content: tplContent.trim(),
        });
        setTemplates((prev) => [...prev, created]);
      }
      setTplName('');
      setTplContent('');
      setEditingId(null);
      setTplError(null);
    } catch (e) {
      if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
        alert(t('dashboard.accessDenied'));
        localStorage.removeItem('token');
        window.location.href = '/';
      } else {
        setTplError(e.message);
      }
    }
  };
  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };
  const handleThemeChange = async (event) => {
    const updated = { ...settings, theme: event.target.value };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };
  const handleSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    if (!API_KEY_REGEX.test(trimmed)) {
      setApiKeyStatus(t('settings.invalidApiKey'));
      setApiKeyInput('');
      setTimeout(() => setApiKeyStatus(''), 4000);
      return;
    }
    try {
      const res = await setApiKey(trimmed);
      // The backend returns {status: 'saved'} on success or an
      // object with a message on failure.  Display the appropriate
      // status message.
      setApiKeyStatus(res.status === 'saved' ? t('saved') : res.message);
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
    i18n.changeLanguage(newLang);
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSummaryLangChange = async (event) => {
    const newLang = event.target.value;
    if (newLang === settings.summaryLang) return;
    const updated = { ...settings, summaryLang: newLang };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSpecialtyChange = async (event) => {
    const value = event.target.value || '';
    const updated = { ...settings, specialty: value };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePayerChange = async (event) => {
    const value = event.target.value || '';
    const updated = { ...settings, payer: value };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegionChange = async (event) => {
    const value = event.target.value.toUpperCase().trim();
    const updated = { ...settings, region: value };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      className="settings-page"
      style={{ padding: '1rem', overflowY: 'auto' }}
    >
      <h2>{t('settings.title')}</h2>
      <h3>{t('settings.apiKey')}</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        {t('settings.apiKeyHelp')}
      </p>
      <div
        style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}
      >
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk-... (e.g., sk-proj-...)"
          style={{
            flexGrow: 1,
            padding: '0.5rem',
            border: '1px solid var(--disabled)',
            borderRadius: '4px',
          }}
        />
        <button onClick={handleSaveKey} style={{ marginLeft: '0.5rem' }}>
          {t('settings.saveKey')}
        </button>
      </div>
      {apiKeyStatus && (
        <p style={{ color: 'var(--secondary)' }}>{apiKeyStatus}</p>
      )}

      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="checkbox"
          checked={settings.useLocalModels}
          onChange={() => handleToggle('useLocalModels')}
        />{' '}
        {t('settings.useLocalModels')}
      </label>
      <p style={{ fontSize: '0.9rem', color: '#6B7280', marginTop: '-0.5rem' }}>
        {t('settings.useLocalModelsHelp')}
      </p>

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
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        {t('settings.customRulesHelp')}
      </p>
      <textarea
        value={(settings.rules || []).join('\n')}
        onChange={async (e) => {
          const lines = e.target.value
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
          const updated = { ...settings, rules: lines };
          try {
            const saved = await saveSettings(updated);
            updateSettings(saved);
          } catch (err) {
            console.error(err);
          }
        }}
        rows={5}
        style={{
          width: '100%',
          marginTop: '0.5rem',
          padding: '0.5rem',
          borderRadius: '4px',
          border: '1px solid var(--disabled)',
        }}
        placeholder={t('settings.customRulesPlaceholder')}
      />
      <h3>{t('settings.language')}</h3>
      <select
        value={settings.lang}
        onChange={handleLangChange}
        aria-label={t('settings.language')}
      >
        <option value="en">{t('settings.english')}</option>
        <option value="es">{t('settings.spanish')}</option>
      </select>

      <h3>{t('settings.summaryLanguage')}</h3>
      <select
        value={settings.summaryLang}
        onChange={handleSummaryLangChange}
        aria-label={t('settings.summaryLanguage')}
      >
        <option value="en">{t('settings.english')}</option>
        <option value="es">{t('settings.spanish')}</option>
      </select>

      <h3>{t('settings.specialty')}</h3>
      <select
        value={settings.specialty || ''}
        onChange={handleSpecialtyChange}
        aria-label={t('settings.specialty')}
        style={{
          width: '100%',
          padding: '0.5rem',
          marginBottom: '0.5rem',
          border: '1px solid var(--disabled)',
          borderRadius: '4px',
        }}
      >
        {SPECIALTIES.map((s) => (
          <option key={s} value={s}>
            {s ? t(`settings.specialties.${s}`) : '--'}
          </option>
        ))}
      </select>

      <h3>{t('settings.payer')}</h3>
      <select
        value={settings.payer || ''}
        onChange={handlePayerChange}
        aria-label={t('settings.payer')}
        style={{
          width: '100%',
          padding: '0.5rem',
          border: '1px solid var(--disabled)',
          borderRadius: '4px',
        }}
      >
        {PAYERS.map((p) => (
          <option key={p} value={p}>
            {p ? t(`settings.payers.${p}`) : '--'}
          </option>
        ))}
      </select>

      <h3>{t('settings.region')}</h3>
      <input
        type="text"
        value={settings.region || ''}
        onChange={handleRegionChange}
        placeholder={t('settings.regionPlaceholder')}
        aria-label={t('settings.region')}
        style={{
          width: '100%',
          padding: '0.5rem',
          marginBottom: '0.5rem',
          border: '1px solid var(--disabled)',
          borderRadius: '4px',
        }}
      />

      <h3>{t('settings.templates')}</h3>
      {tplError && <p style={{ color: 'red' }}>{tplError}</p>}
      <ul>
        {templates.map((tpl) => (
          <li key={tpl.id}>
            {tpl.name}{' '}
            <button
              onClick={() => handleEditTemplate(tpl)}
              style={{ marginLeft: '0.25rem' }}
            >
              {t('templatesModal.edit')}
            </button>
            <button
              onClick={() => handleDeleteTemplate(tpl.id)}
              style={{ marginLeft: '0.25rem' }}
            >
              {t('templatesModal.delete')}
            </button>
          </li>
        ))}
        {templates.length === 0 && <li>{t('settings.noTemplates')}</li>}
      </ul>
      <div style={{ marginTop: '0.5rem' }}>
        <input
          type="text"
          placeholder={t('templatesModal.name')}
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        />
        <textarea
          placeholder={t('templatesModal.content')}
          value={tplContent}
          onChange={(e) => setTplContent(e.target.value)}
          rows={4}
          style={{ width: '100%' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={handleSaveTemplate}
            disabled={!tplName.trim() || !tplContent.trim()}
          >
            {t('templatesModal.save')}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setTplName('');
                setTplContent('');
              }}
              style={{ marginLeft: '0.5rem' }}
            >
              {t('templatesModal.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Settings;
