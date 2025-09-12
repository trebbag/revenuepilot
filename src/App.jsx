import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n.js';
import NoteEditor from './components/NoteEditor.jsx';
import SuggestionPanel from './components/SuggestionPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import Logs from './components/Logs.jsx';
import Help from './components/Help.jsx';
import Settings from './components/Settings.jsx';
import TranscriptView from './components/TranscriptView.jsx';
import {
  beautifyNote,
  logEvent,
  summarizeNote,
  getSettings,
  saveSettings,
  refreshAccessToken,
} from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Drafts from './components/Drafts.jsx';
import Login from './components/Login.jsx';
import ClipboardExportButtons from './components/ClipboardExportButtons.jsx';
import TemplatesModal from './components/TemplatesModal.jsx';
import AdminUsers from './components/AdminUsers.jsx';
import SatisfactionSurvey from './components/SatisfactionSurvey.jsx';

// Utility to convert HTML strings into plain text by stripping tags.  The
// ReactQuill editor stores content as HTML; our backend accepts plain
// text.  This naive implementation removes all markup.  For more
// sophisticated handling (e.g., preserving paragraphs or lists), consider
// using a library like html-to-text.
function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, '') : '';
}

function parseJwt(tok) {
  try {
    return JSON.parse(atob(tok.split('.')[1]));
  } catch {
    return null;
  }
}

// Basic skeleton component implementing the toolbar, tab system and suggestion panel.
function App() {
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  );
  const [refreshToken, setRefreshToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null,
  );
  const [userRole, setUserRole] = useState(() =>
    token ? parseJwt(token)?.role : null,
  );
  const { t } = useTranslation();
  // Track which tab is active: 'draft' or 'beautified'
  const [activeTab, setActiveTab] = useState('draft');
  // Store the beautified text once generated
  const [beautified, setBeautified] = useState('');
  // Store the patient-friendly summary once generated
  const [summaryText, setSummaryText] = useState('');
  // Track which main view is active: 'note', 'dashboard', 'logs', 'settings', 'help' or 'drafts'
  const [view, setView] = useState('note');
  // Loading states for API calls
  const [loadingBeautify, setLoadingBeautify] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  // Track the current draft text
  const [draftText, setDraftText] = useState('');

  // Optional additional context for suggestions:
  // chartText holds the contents of an uploaded medical chart.  When provided,
  // it is concatenated with the clinical note before sending to the AI.  The
  // user can upload text or PDF exports from their EHR as a privacy‑preserving
  // alternative to direct API integration.
  const [chartText, setChartText] = useState('');
  const [chartFileName, setChartFileName] = useState('');

  // Audio transcript extracted from a recorded visit.  Recording is
  // optional; when present, the transcript is appended to the note to
  // enrich suggestions.  The recording itself is not stored; only the
  // text is used.  When diarisation is enabled we keep provider and
  // patient segments separately so the UI can display them individually.
  const [audioTranscript, setAudioTranscript] = useState({
    provider: '',
    patient: '',
    segments: [],
  });

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  // References for MediaRecorder and audio chunks
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const editorRef = useRef(null);

  // Keep track of previous draft text to detect when a new note is started
  const prevDraftRef = useRef('');
  // Ref for the hidden chart file input
  const fileInputRef = useRef(null);

  // Track the current patient ID for draft saving
  const [patientID, setPatientID] = useState('');
  const [encounterID, setEncounterID] = useState('');

  useEffect(() => {
    if (
      prevDraftRef.current.trim() === '' &&
      draftText.trim() !== '' &&
      patientID
    ) {
      // Log a note_started event when the user begins typing a new draft
      logEvent('note_started', { patientID, length: draftText.length }).catch(() => {});
    }
    prevDraftRef.current = draftText;
  }, [draftText, patientID]);

  // Track whether the sidebar is collapsed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Control visibility of the suggestion panel (for sliding effect)
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [baseTemplates, setBaseTemplates] = useState([]);
  const [templateContext, setTemplateContext] = useState('');
  // Toolbar menu state for grouping secondary actions
  const [showToolbarMenu, setShowToolbarMenu] = useState(false);
  // Demographic details used for public health suggestions
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  // Suggestions fetched from the API
  const [suggestions, setSuggestions] = useState({
    codes: [],
    compliance: [],
    publicHealth: [],
    differentials: [],
    followUp: null,
  });

  const calcRevenue = (codes = []) => {
    const map = { 99212: 50, 99213: 75, 99214: 110, 99215: 160 };
    return (codes || []).reduce((sum, c) => sum + (map[c] || 0), 0);
  };

  // Default values for theme and suggestion category settings.
  const defaultSettings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    lang: 'en',
    summaryLang: 'en',
    specialty: '',
    payer: '',
    rules: [],
    region: '',
    useLocalModels: false,
    useOfflineMode: false,
    agencies: ['CDC', 'WHO'],
    template: null,
    beautifyModel: '',
    suggestModel: '',
    summarizeModel: '',
    deidEngine: 'regex',
  };
  // User settings controlling theme and which suggestion categories are enabled.
  const [settingsState, setSettingsState] = useState(defaultSettings);

  // Function to update settings
  const updateSettings = (newSettings) => {
    setSettingsState(newSettings);
  };

  const handleDefaultTemplateChange = async (tplId) => {
    const newSettings = { ...settingsState, template: tplId };
    setSettingsState(newSettings);
    try {
      await saveSettings(newSettings);
    } catch (e) {
      console.error('Failed to save template selection', e);
    }
  };

  const logout = () => {
    setToken(null);
    setRefreshToken(null);
    setUserRole(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  };

  const handleUnauthorized = () => {
    alert(t('sessionExpired'));
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const suggestionContext = {
    chart: chartText,
    rules: settingsState.rules,
    audio: `${audioTranscript.provider} ${audioTranscript.patient}`.trim(),
    lang: settingsState.lang,
    specialty: settingsState.specialty,
    payer: settingsState.payer,
    age: age ? parseInt(age, 10) : undefined,
    sex,
    region: settingsState.region,
    useLocalModels: settingsState.useLocalModels,
    useOfflineMode: settingsState.useOfflineMode,
    agencies: settingsState.agencies,
    suggestModel: settingsState.suggestModel,
  };

  useEffect(() => {
    if (token) {
      setUserRole(parseJwt(token)?.role || null);
    } else {
      setUserRole(null);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !refreshToken) return;
    const payload = parseJwt(token);
    if (!payload?.exp) return;
    const delay = payload.exp * 1000 - Date.now() - 60000;
    if (delay <= 0) {
      doRefresh();
      return;
    }
    const id = setTimeout(doRefresh, delay);
    return () => clearTimeout(id);
  }, [token, refreshToken]);

  async function doRefresh() {
    try {
      const data = await refreshAccessToken(refreshToken);
      setToken(data.access_token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', data.access_token);
      }
    } catch (e) {
      handleUnauthorized();
    }
  }

  useEffect(() => {
    if (!token) return;
    async function fetchSettings() {
      try {
        const remote = await getSettings(token);
        const merged = { ...defaultSettings, ...remote };
        setSettingsState(merged);
        i18n.changeLanguage(merged.lang);
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
    fetchSettings();
  }, [token]);

  useEffect(() => {
    i18n.changeLanguage(settingsState.lang);
  }, [settingsState.lang]);

  // Load default templates from a JSON file at runtime so deployments can
  // customise them without rebuilding the frontend bundle.
  useEffect(() => {
    fetch('/templates.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBaseTemplates(data))
      .catch(() => setBaseTemplates([]));
  }, []);


  // When the user clicks the Beautify button, run a placeholder transformation.
  // In the real app this will call the LLM API to reformat the note.
  const handleBeautify = () => {
    // Call the API helper to beautify the note.  If there's no
    // draft text, do nothing.
    if (!draftText.trim()) return;
    setLoadingBeautify(true);
    // Strip HTML tags before sending the note to the backend.  ReactQuill
    // produces an HTML string; the backend expects plain text.
    const plain = stripHtml(draftText);
    beautifyNote(plain, settingsState.lang, {
      specialty: settingsState.specialty,
      payer: settingsState.payer,
      useLocalModels: settingsState.useLocalModels,
      useOfflineMode: settingsState.useOfflineMode,
      beautifyModel: settingsState.beautifyModel,
    })
      .then((cleaned) => {
        setBeautified(cleaned);
        setActiveTab('beautified');
        // Log a beautify event with patient ID and note length
        if (patientID) {
          const codes = suggestions.codes.map((c) => c.code);
          const revenue = calcRevenue(codes);
          logEvent('beautify', {
            patientID,
            length: draftText.length,
            codes,
            revenue,
            compliance: suggestions.compliance,
            publicHealth: suggestions.publicHealth.length > 0,
          }).catch(() => {});
        }
        setShowSurvey(true);
      })
      .catch((e) => {
        if (e.message === 'Unauthorized') {
          handleUnauthorized();
        } else {
          console.error('Beautify failed', e);
        }
      })
      .finally(() => {
        setLoadingBeautify(false);
      });
  };

  /**
   * Handle the Summarize button.  Calls the backend to generate a
   * patient‑friendly summary of the current note.  If the note is
   * empty, this function does nothing.  When the summary is returned,
   * it sets the summary text and switches to the Summary tab.  It
   * also logs a summary event for analytics.
   */
  const handleSummarize = () => {
    if (!draftText.trim()) return;
    setLoadingSummary(true);
    const plain = stripHtml(draftText);
    summarizeNote(plain, {
      chart: chartText,
      audio: `${audioTranscript.provider} ${audioTranscript.patient}`.trim(),
      lang: settingsState.summaryLang,
      patientAge: age ? parseInt(age, 10) : undefined,
      specialty: settingsState.specialty,
      payer: settingsState.payer,
      useLocalModels: settingsState.useLocalModels,
      summarizeModel: settingsState.summarizeModel,
    })
      .then((data) => {
        let combined = data.summary;
        if (data.recommendations?.length) {
          combined += `\n\n${data.recommendations.map((r) => `- ${r}`).join('\n')}`;
        }
        if (data.warnings?.length) {
          combined += `\n\n${data.warnings.map((w) => `! ${w}`).join('\n')}`;
        }
        setSummaryText(combined);
        setActiveTab('summary');
        if (patientID) {
          const codes = suggestions.codes.map((c) => c.code);
          const revenue = calcRevenue(codes);
          logEvent('summary', {
            patientID,
            length: draftText.length,
            codes,
            revenue,
            compliance: suggestions.compliance,
            publicHealth: suggestions.publicHealth.length > 0,
          }).catch(() => {});
        }
      })
      .catch((e) => {
        if (e.message === 'Unauthorized') {
          handleUnauthorized();
        } else {
          console.error('Summary failed', e);
        }
      })
      .finally(() => setLoadingSummary(false));
  };

  // Update the draft text when the editor changes.
  const handleDraftChange = (value) => {
    setDraftText(value);
  };

  // Load a saved draft from localStorage when the patient ID changes
  useEffect(() => {
    if (!patientID) return;
    const saved = localStorage.getItem(`draft_${patientID}`);
    if (saved !== null) {
      setDraftText(saved);
      setActiveTab('draft');
      // Force suggestions update
      // suggestions will update via useEffect on draftText
    } else {
      setDraftText('');
    }
  }, [patientID]);

  // Persist the draft to localStorage whenever it changes
  useEffect(() => {
    if (!patientID) return;
    localStorage.setItem(`draft_${patientID}`, draftText);
  }, [draftText, patientID]);

  // Insert template into the draft
  const insertTemplate = (content) => {
    setDraftText(content);
    setTemplateContext(content);
    setActiveTab('draft');
  };

  // Insert a suggestion into the draft note at the current cursor position
  // and focus the draft tab so the user can continue editing.
  const handleInsertSuggestion = (text) => {
    if (
      editorRef.current &&
      typeof editorRef.current.insertAtCursor === 'function'
    ) {
      editorRef.current.insertAtCursor(text);
    } else {
      setDraftText(
        (prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${text}`,
      );
    }
    setActiveTab('draft');
  };

  const handleSuggestions = (data) => {
    setSuggestions(data);
    if (patientID) {
      const codes = data.codes.map((c) => c.code);
      const revenue = calcRevenue(codes);
      logEvent('suggest', {
        patientID,
        length: draftText.length,
        codes,
        revenue,
        compliance: data.compliance,
        publicHealth: data.publicHealth.length > 0,
      }).catch(() => {});
    }
  };

  /**
   * Handle upload of an exported medical chart.  Reads the file as text and
   * stores its contents in chartText.  Logs an event for analytics.  This
   * provides an alternative to connecting directly to an EHR API.
   */
  const handleChartChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setChartText(typeof text === 'string' ? text : '');
      setChartFileName(file.name);
      if (patientID) {
        logEvent('chart_upload', { patientID, filename: file.name }).catch(
          () => {},
        );
      }
    };
    // Read as text; in a future iteration we could parse PDFs or structured formats.
    reader.readAsText(file);
  };

  const handleTranscriptChange = (data) => {
    setAudioTranscript({
      provider: data.provider || '',
      patient: data.patient || '',
      segments: data.segments || [],
    });
    setActiveTab('draft');
  };

  const handleAddSegment = (idx) => {
    const seg = audioTranscript.segments[idx];
    if (!seg) return;
    setDraftText((prev) => {
      const prefix = prev && !prev.endsWith('\n') ? '\n' : '';
      return `${prev}${prefix}${seg.text}`;
    });
    setAudioTranscript((prev) => ({
      ...prev,
      segments: prev.segments.filter((_, i) => i !== idx),
    }));
  };

  const handleIgnoreSegment = (idx) => {
    setAudioTranscript((prev) => ({
      ...prev,
      segments: prev.segments.filter((_, i) => i !== idx),
    }));
  };


  // Effect: apply theme colours to CSS variables when the theme changes
  useEffect(() => {
    const themes = {
      modern: {
        '--bg': '#F9FAFC',
        '--text': '#1F2937',
        '--primary': '#1E3A8A',
        '--secondary': '#0D9488',
        '--panel-bg': '#FFFFFF',
        '--disabled': '#E5E7EB',
      },
      dark: {
        '--bg': '#263238',
        '--text': '#FAFAFA',
        '--primary': '#FF6F00',
        '--secondary': '#00897B',
        '--panel-bg': '#37474F',
        '--disabled': '#455A64',
      },
      warm: {
        '--bg': '#ECEFF1',
        '--text': '#37474F',
        '--primary': '#D32F2F',
        '--secondary': '#1976D2',
        '--panel-bg': '#FFFFFF',
        '--disabled': '#B0BEC5',
      },
    };
    const themeVars = themes[settingsState.theme] || themes.modern;
    Object.entries(themeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [settingsState.theme]);

  return !token ? (
    <Login
      onLoggedIn={(tok, settings) => {
        setToken(tok);
        setRefreshToken(
          typeof window !== 'undefined'
            ? localStorage.getItem('refreshToken')
            : null,
        );
        if (settings) {
          const merged = { ...defaultSettings, ...settings };
          updateSettings(merged);
          i18n.changeLanguage(merged.lang);
        }
      }}
    />
  ) : (
    <div className="app">
      <Sidebar
        collapsed={sidebarCollapsed}
        toggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onNavigate={(key) => {
          setView(key);
          // Reset active tab when switching views so that returning to notes
          // always starts on the draft tab.
          setActiveTab('draft');
        }}
        role={userRole}
        onLogout={logout}
      />
      <div className={`content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <header className="toolbar">
          {view !== 'note' ? (
            <button onClick={() => setView('note')}>{t('app.back')}</button>
          ) : (
            <button onClick={() => setView('note')}>{t('app.file')}</button>
          )}
          {view === 'note' && (
            <>
              <input
                type="text"
                placeholder={t('app.patientId')}
                value={patientID}
                onChange={(e) => setPatientID(e.target.value)}
                className="patient-input"
              />
              <select
                value={settingsState.summaryLang}
                onChange={(e) => setSettingsState({ ...settingsState, summaryLang: e.target.value })}
                aria-label={t('app.patientLanguage')}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <input
                type="number"
                placeholder={t('app.patientAge')}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="patient-age-input"
                style={{ width: '4rem', marginLeft: '0.5rem' }}
              />
              {/* Primary actions */}
              <button
                disabled={loadingBeautify || !draftText.trim()}
                onClick={handleBeautify}
              >
                {loadingBeautify ? t('app.beautifying') : t('app.beautify')}
              </button>
              <button
                disabled={loadingSummary || !draftText.trim()}
                onClick={handleSummarize}
                style={{ marginLeft: '0.5rem' }}
              >
                {loadingSummary ? t('app.summarizing') : t('app.summarize')}
              </button>

              {/* Compact "More" menu that holds secondary actions to reduce toolbar width */}
              <div className="toolbar-menu" style={{ position: 'relative', marginLeft: '0.5rem' }}>
                <button
                  aria-haspopup="true"
                  aria-expanded={showToolbarMenu}
                  onClick={() => setShowToolbarMenu((s) => !s)}
                >
More ▾
                </button>
                {showToolbarMenu && (
                  <div className="toolbar-menu-content" role="menu">
                    <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <ClipboardExportButtons
                        beautified={beautified}
                        summary={summaryText}
                        patientID={patientID}
                        suggestions={suggestions}
                      />

                      <button
                        disabled={!patientID || !draftText.trim()}
                        onClick={() => {
                          localStorage.setItem(`draft_${patientID}`, draftText);
                          logEvent('note_saved', {
                            patientID,
                            length: draftText.length,
                          }).catch(() => {});
                          setShowToolbarMenu(false);
                        }}
                      >
                        {t('app.saveDraft')}
                      </button>

                      <button
                        onClick={() => {
                          if (fileInputRef.current) fileInputRef.current.click();
                          setShowToolbarMenu(false);
                        }}
                      >
                        {chartFileName ? t('app.changeChart') : t('app.uploadChart')}
                      </button>

                      <button onClick={() => { setShowSuggestions((s) => !s); setShowToolbarMenu(false); }}>
                        {showSuggestions ? t('app.hideSuggestions') : t('app.showSuggestions')}
                      </button>

                      <hr style={{ border: 'none', borderTop: '1px solid var(--disabled)', margin: '0.25rem 0' }} />

                      <button onClick={() => { setShowTemplatesModal(true); setShowToolbarMenu(false); }}>
                        {t('app.templates')}
                      </button>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem' }}>Language:</span>
                        <select
                          value={settingsState.summaryLang}
                          onChange={(e) => {
                            const merged = { ...settingsState, summaryLang: e.target.value };
                            setSettingsState(merged);
                            i18n.changeLanguage(merged.lang || merged.summaryLang);
                            setShowToolbarMenu(false);
                          }}
                        >
                          <option value="en">English</option>
                          <option value="es">Español</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem' }}>{t('app.patientAge')}</span>
                        <input
                          type="number"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          style={{ width: '4rem' }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </header>
        <div className="main">
          {view === 'note' && (
            <>
              <div className="editor-wrapper">
                <div className="tabs">
                  <button
                    className={activeTab === 'draft' ? 'tab active' : 'tab'}
                    onClick={() => setActiveTab('draft')}
                  >
                    {t('app.originalNote')}
                  </button>
                  <button
                    className={beautified ? 'tab active' : 'tab disabled'}
                    onClick={() => beautified && setActiveTab('beautified')}
                  >
                    {t('app.beautifiedNote')}
                  </button>
                  <button
                    className={
                      summaryText
                        ? activeTab === 'summary'
                          ? 'tab active'
                          : 'tab'
                        : 'tab disabled'
                    }
                    onClick={() => summaryText && setActiveTab('summary')}
                  >
                    {t('app.summary')}
                  </button>
                </div>
                <div className="editor-area card">
                  {activeTab === 'draft' ? (

                    <NoteEditor
                      ref={editorRef}
                      id="draft-input"
                      value={draftText}
                      onChange={handleDraftChange}
                      onTranscriptChange={handleTranscriptChange}
                      specialty={settingsState.specialty}
                      payer={settingsState.payer}
                      defaultTemplateId={settingsState.template}
                      onTemplateChange={handleDefaultTemplateChange}
                      error={transcriptionError}
                      templateContext={templateContext}
                      suggestionContext={suggestionContext}
                      onSuggestions={handleSuggestions}
                      onSuggestionsLoading={setLoadingSuggestions}
                    />
                  ) : activeTab === 'beautified' ? (
                    <NoteEditor
                      id="beautified-output"
                      value={beautified}
                      onChange={setBeautified}
                      mode="beautified"
                    />
                  ) : (
                    <div className="beautified-view">{summaryText}</div>
                  )}

                </div>
                {audioTranscript.segments.length > 0 && (
                  <TranscriptView
                    transcript={audioTranscript}
                    onAdd={handleAddSegment}
                    onIgnore={handleIgnoreSegment}
                  />
                )}
              </div>
            </>
          )}
          {view === 'dashboard' && <Dashboard />}
          {view === 'help' && <Help />}
          {view === 'settings' && (
            <Settings
              settings={settingsState}
              updateSettings={updateSettings}
            />
          )}
          {view === 'drafts' && (
            <Drafts
              onOpenDraft={(pid) => {
                setPatientID(pid);
                setView('note');
              }}
            />
          )}
          {view === 'logs' && <Logs />}
          {view === 'admin-users' && userRole === 'admin' && (
            <AdminUsers token={token} />
          )}
        </div>
      </div>
      {showTemplatesModal && (
        <TemplatesModal
          baseTemplates={baseTemplates}
          specialty={settingsState.specialty}
          payer={settingsState.payer}
          onSelect={(tpl) => {
            insertTemplate(tpl.content);
            logEvent('template_use', { templateId: tpl.id }).catch(() => {});
            setShowTemplatesModal(false);
          }}
          onClose={() => setShowTemplatesModal(false)}
        />
      )}
      <SatisfactionSurvey
        open={showSurvey}
        onClose={() => setShowSurvey(false)}
      />
    </div>
  );
}

export default App;
