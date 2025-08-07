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
  getPromptTemplates,
  savePromptTemplates,
} from '../api.js';
import yaml from 'js-yaml';

const SPECIALTIES = ['', 'cardiology', 'dermatology'];
const PAYERS = ['', 'medicare', 'aetna'];
const AGENCIES = ['CDC', 'WHO'];
const API_KEY_REGEX = /^sk-(?:proj-)?[A-Za-z0-9]{16,}$/;
// Region/country codes are user-entered to keep the list flexible

function Settings({ settings, updateSettings }) {
  const { t } = useTranslation();
  let isAdmin = false;
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        isAdmin = JSON.parse(atob(token.split('.')[1])).role === 'admin';
      } catch {
        isAdmin = false;
      }
    }
  }
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [templates, setTemplates] = useState([]);
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [tplError, setTplError] = useState(null);
  const [promptOverrides, setPromptOverrides] = useState('');
  const [promptError, setPromptError] = useState(null);
  const [newRule, setNewRule] = useState('');
  const [editingRule, setEditingRule] = useState(null);
  const [ruleError, setRuleError] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');

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
    getPromptTemplates()
      .then((data) => setPromptOverrides(JSON.stringify(data, null, 2)))
      .catch((e) => {
        if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
          alert(t('dashboard.accessDenied'));
          localStorage.removeItem('token');
          window.location.href = '/';
        } else {
          setPromptError(e.message);
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

  const handleAgencyToggle = async (agency) => {
    const current = new Set(settings.agencies || []);
    if (current.has(agency)) current.delete(agency);
    else current.add(agency);
    const updated = { ...settings, agencies: Array.from(current) };
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

  const handleDownloadModels = () => {
    if (typeof window === 'undefined') return;
    setDownloadStatus('');
    const evt = new EventSource('/download-models');
    evt.onmessage = (e) => {
      if (e.data === 'done') {
        evt.close();
      } else {
        setDownloadStatus((prev) => prev + e.data + '\n');
      }
    };
    evt.onerror = () => {
      setDownloadStatus(t('settings.downloadModelsError'));
      evt.close();
    };
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
  const validatePromptTemplates = (obj) => {
    const hasCats = (entry) =>
      entry && ['beautify', 'suggest', 'summary'].every((k) => k in entry);
    if (!hasCats(obj.default)) return false;
    for (const group of ['specialty', 'payer']) {
      if (obj[group]) {
        for (const key of Object.keys(obj[group])) {
          if (!hasCats(obj[group][key])) return false;
        }
      }
    }
    return true;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let data;
        if (file.name.endsWith('.json')) data = JSON.parse(reader.result);
        else data = yaml.load(reader.result);
        if (!validatePromptTemplates(data)) {
          setPromptError(t('settings.invalidPromptTemplates'));
          return;
        }
        setPromptOverrides(JSON.stringify(data, null, 2));
        setPromptError(null);
      } catch {
        setPromptError(t('settings.invalidPromptTemplates'));
      }
    };
    reader.readAsText(file);
  };

  const handleSavePromptOverrides = async () => {
    try {
      const data = JSON.parse(promptOverrides || '{}');
      if (!validatePromptTemplates(data)) {
        setPromptError(t('settings.invalidPromptTemplates'));
        return;
      }
      const saved = await savePromptTemplates(data);
      setPromptOverrides(JSON.stringify(saved, null, 2));
      setPromptError(null);
    } catch (e) {
      if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
        alert(t('dashboard.accessDenied'));
        localStorage.removeItem('token');
        window.location.href = '/';
      } else {
        setPromptError(e.message);
      }
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

  const handleModelChange = async (key, value) => {
    const updated = { ...settings, [key]: value };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddOrUpdateRule = async () => {
    const text = newRule.trim();
    if (!text) {
      setRuleError(t('settings.ruleRequired'));
      return;
    }
    if (text.length > 200) {
      setRuleError(t('settings.ruleTooLong'));
      return;
    }
    const rules = [...(settings.rules || [])];
    if (editingRule !== null) {
      rules[editingRule] = text;
    } else {
      rules.push(text);
    }
    const updated = { ...settings, rules };
    try {
      const saved = await saveSettings(updated);
      updateSettings(saved);
      setNewRule('');
      setEditingRule(null);
      setRuleError('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditRule = (idx) => {
    setEditingRule(idx);
    setNewRule((settings.rules || [])[idx] || '');
    setRuleError('');
  };

  const handleDeleteRule = async (idx) => {
    const rules = (settings.rules || []).filter((_, i) => i !== idx);
    const updated = { ...settings, rules };
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

      <h3>{t('settings.general')}</h3>
      <h4>{t('settings.apiKey')}</h4>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        {t('settings.apiKeyHelp')}
      </p>
      <div
        style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}
      >
        <input
          id="api-key"
          type="password"
          aria-label={t('settings.apiKey')}
          title={t('settings.apiKeyHelp')}
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={t('settings.apiKeyPlaceholder')}
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

      <label
        style={{ display: 'block', marginBottom: '0.5rem' }}
        title={t('settings.useLocalModelsHelp')}
      >
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

      <button onClick={handleDownloadModels} style={{ marginBottom: '0.5rem' }}>
        {t('settings.downloadModels')}
      </button>
      {downloadStatus && (
        <pre
          style={{
            background: '#F3F4F6',
            padding: '0.5rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {downloadStatus}
        </pre>
      )}

      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        {t('settings.beautifyModel')}
        <input
          type="text"
          value={settings.beautifyModel || ''}
          onChange={(e) => handleModelChange('beautifyModel', e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--disabled)',
            borderRadius: '4px',
            marginTop: '0.25rem',
          }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        {t('settings.suggestModel')}
        <input
          type="text"
          value={settings.suggestModel || ''}
          onChange={(e) => handleModelChange('suggestModel', e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--disabled)',
            borderRadius: '4px',
            marginTop: '0.25rem',
          }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        {t('settings.summarizeModel')}
        <input
          type="text"
          value={settings.summarizeModel || ''}
          onChange={(e) => handleModelChange('summarizeModel', e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--disabled)',
            borderRadius: '4px',
            marginTop: '0.25rem',
          }}
        />
      </label>

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

      <h3>{t('settings.language')}</h3>
      <select
        value={settings.lang}
        onChange={handleLangChange}
        aria-label={t('settings.language')}
      >
        <option value="en">{t('settings.english')}</option>
        <option value="es">{t('settings.spanish')}</option>
        <option value="fr">{t('settings.french')}</option>
        <option value="de">{t('settings.german')}</option>
      </select>

      <h3>{t('settings.summaryLanguage')}</h3>
      <select
        value={settings.summaryLang}
        onChange={handleSummaryLangChange}
        aria-label={t('settings.summaryLanguage')}
      >
        <option value="en">{t('settings.english')}</option>
        <option value="es">{t('settings.spanish')}</option>
        <option value="fr">{t('settings.french')}</option>
        <option value="de">{t('settings.german')}</option>
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
        title={t('settings.regionPlaceholder')}
        style={{
          width: '100%',
          padding: '0.5rem',
          marginBottom: '0.5rem',
          border: '1px solid var(--disabled)',
          borderRadius: '4px',
        }}
      />

      <h3>{t('settings.agencies')}</h3>
      {AGENCIES.map((agency) => (
        <label key={agency} style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={(settings.agencies || []).includes(agency)}
            onChange={() => handleAgencyToggle(agency)}
          />{' '}
          {t(`settings.${agency.toLowerCase()}`)}
        </label>
      ))}

      <h3>{t('settings.templates')}</h3>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        {t('settings.templatesHelp')}
      </p>
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
      <h3 style={{ marginTop: '1rem' }}>{t('settings.prompts')}</h3>

      <h4>{t('settings.customRules')}</h4>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        {t('settings.customRulesHelp')}
      </p>
      <label htmlFor="new-rule" title={t('settings.customRulesHelp')}>
        {t('settings.addRule')}
      </label>
      <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
        <input
          id="new-rule"
          type="text"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          maxLength={200}
          placeholder={t('settings.customRulesPlaceholder')}
          style={{ flex: 1, marginRight: '0.5rem' }}
        />
        <button onClick={handleAddOrUpdateRule}>
          {editingRule !== null
            ? t('settings.saveRule')
            : t('settings.addRule')}
        </button>
      </div>
      {ruleError && <p style={{ color: 'red' }}>{ruleError}</p>}
      <ul>
        {(settings.rules || []).map((r, idx) => (
          <li
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}
          >
            <span style={{ flex: 1 }}>{r}</span>
            <button
              aria-label={t('settings.edit')}
              onClick={() => handleEditRule(idx)}
              style={{ marginLeft: '0.25rem' }}
            >
              {t('settings.edit')}
            </button>
            <button
              aria-label={t('settings.delete')}
              onClick={() => handleDeleteRule(idx)}
              style={{ marginLeft: '0.25rem' }}
            >
              {t('settings.delete')}
            </button>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          <h4>{t('settings.promptOverrides') || 'Prompt Overrides'}</h4>
          {promptError && <p style={{ color: 'red' }}>{promptError}</p>}
          <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
            {t('settings.promptTemplatesHelp')}
          </p>
          <input
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleFileUpload}
            style={{ marginBottom: '0.5rem' }}
          />
          <textarea
            aria-label="Prompt Overrides JSON"
            value={promptOverrides}
            onChange={(e) => setPromptOverrides(e.target.value)}
            rows={10}
            style={{ width: '100%' }}
          />
          <button
            onClick={handleSavePromptOverrides}
            style={{ marginTop: '0.5rem' }}
          >
            {t('settings.savePromptTemplates')}
          </button>
        </>
      )}
    </div>
  );
}

export default Settings;
