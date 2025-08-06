import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n.js';
import NoteEditor from './components/NoteEditor.jsx';
import SuggestionPanel from './components/SuggestionPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import Logs from './components/Logs.jsx';
import Help from './components/Help.jsx';
import Settings from './components/Settings.jsx';
import {
  beautifyNote,
  getSuggestions,
  logEvent,
  transcribeAudio,
  summarizeNote,
  getSettings,
} from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Drafts from './components/Drafts.jsx';
import Login from './components/Login.jsx';
import ClipboardExportButtons from './components/ClipboardExportButtons.jsx';
import TemplatesModal from './components/TemplatesModal.jsx';

// Utility to convert HTML strings into plain text by stripping tags.  The
// ReactQuill editor stores content as HTML; our backend accepts plain
// text.  This naive implementation removes all markup.  For more
// sophisticated handling (e.g., preserving paragraphs or lists), consider
// using a library like html-to-text.
function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, '') : '';
}

// Basic skeleton component implementing the toolbar, tab system and suggestion panel.
function App() {
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
  });
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  // References for MediaRecorder and audio chunks
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  // Track whether the sidebar is collapsed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Control visibility of the suggestion panel (for sliding effect)
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [baseTemplates, setBaseTemplates] = useState([]);

  // Track the current patient ID for draft saving
  const [patientID, setPatientID] = useState('');
  // Demographic details used for public health suggestions
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  // Suggestions fetched from the API
  const [suggestions, setSuggestions] = useState({
    codes: [],
    compliance: [],
    publicHealth: [],
    differentials: [],
  });

  // Default values for theme and suggestion category settings.
  const defaultSettings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    lang: 'en',
    specialty: '',
    payer: '',
    // Array of custom clinical rules supplied by the user.  When non‑empty,
    // these rules are appended to the prompt sent to the AI model.  Each
    // entry should be a concise guideline such as “Payer X requires ROS for 99214”.
    rules: [],
    region: '',
  };
  // User settings controlling theme and which suggestion categories are enabled.
  const [settingsState, setSettingsState] = useState(defaultSettings);

  // Function to update settings
  const updateSettings = (newSettings) => {
    setSettingsState(newSettings);
  };

  const handleUnauthorized = () => {
    alert('Session expired');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
  };

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

  // If there is no JWT stored, show the login form instead of the main app
  if (!token) {
    return (
      <Login
        onLoggedIn={(tok, settings) => {
          setToken(tok);
          if (settings) {
            const merged = { ...defaultSettings, ...settings };
            updateSettings(merged);
            i18n.changeLanguage(merged.lang);
          }
        }}
      />
    );
  }

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
    beautifyNote(plain, settingsState.lang, { specialty: settingsState.specialty, payer: settingsState.payer })
      .then((cleaned) => {
        setBeautified(cleaned);
        setActiveTab('beautified');
        // Log a beautify event with patient ID and note length
        if (patientID) {
          logEvent('beautify', { patientID, length: draftText.length }).catch(() => {});
        }
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
      lang: settingsState.lang,
      specialty: settingsState.specialty,
      payer: settingsState.payer,
    })
      .then((summary) => {
        setSummaryText(summary);
        setActiveTab('summary');
        if (patientID) {
          logEvent('summary', { patientID, length: draftText.length }).catch(() => {});
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
    setActiveTab('draft');
  };

  // Insert a suggestion into the draft note.  Appends the text to the
  // current draft and focuses the draft tab so the user can continue
  // editing after inserting a suggestion.
  const handleInsertSuggestion = (text) => {
    setDraftText((prev) => {
      const usesHtml = /<[^>]+>/.test(prev);
      if (usesHtml) {
        // Append as a new paragraph in the HTML string
        return `${prev}<p>${text}</p>`;
      }
      const prefix = prev && !prev.endsWith('\n') ? '\n' : '';
      return `${prev}${prefix}${text}`;
    });
    setActiveTab('draft');
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
        logEvent('chart_upload', { patientID, filename: file.name }).catch(() => {});
      }
    };
    // Read as text; in a future iteration we could parse PDFs or structured formats.
    reader.readAsText(file);
  };

  /**
   * Start or stop audio recording.  Uses the browser's MediaRecorder API to
   * capture audio from the user's microphone.  When recording stops the
   * resulting ``Blob`` is uploaded to the backend ``/transcribe`` endpoint
   * and the returned transcript stored in ``audioTranscript``.  The raw
   * audio is never persisted locally.
   */
  const handleRecordAudio = async () => {
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setTranscribing(true);
          try {
            await transcribeAudio(blob, true);
            setTranscriptionError('');
          } catch (err) {
            if (err.message === 'Unauthorized') {
              handleUnauthorized();
            } else {
              console.error('Transcription failed', err);
              setTranscriptionError('Transcription failed');
            }
          } finally {
            setTranscribing(false);
          }
          if (patientID) {
            logEvent('audio_recorded', { patientID, size: blob.size }).catch(() => {});
          }
        };
        mediaRecorder.start();
        setRecording(true);
      } catch (err) {
        console.error('Error accessing microphone', err);
        setTranscriptionError('Error accessing microphone');
      }
    } else {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setRecording(false);
    }
  };

  const handleTranscriptChange = (data) => {
    setAudioTranscript({
      provider: data.provider || '',
      patient: data.patient || '',
    });
    const combined = `${data.provider || ''}${
      data.provider && data.patient ? '\n' : ''
    }${data.patient || ''}`.trim();
    if (combined) {
      setDraftText((prev) => {
        const prefix = prev && !prev.endsWith('\n') ? '\n' : '';
        return `${prev}${prefix}${combined}`;
      });
      setActiveTab('draft');
    }
  };

  // Keep track of previous draft text to detect when a new note is started
  const prevDraftRef = useRef('');

  // Ref for the hidden chart file input
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (prevDraftRef.current.trim() === '' && draftText.trim() !== '' && patientID) {
      // Log a note_started event when the user begins typing a new draft
      logEvent('note_started', { patientID, length: draftText.length }).catch(() => {});
    }
    prevDraftRef.current = draftText;
  }, [draftText, patientID]);

  /*
   * Debounce the suggestion API calls.  When the draft text changes, wait
   * a short delay before fetching new suggestions.  This prevents making
   * a network request on every keystroke and improves responsiveness.  If
   * the user continues typing, the timer resets.  When the timer completes,
   * call the API and update the suggestions.
   */
  useEffect(() => {
    // If the draft is empty, clear suggestions and skip API call
    if (!draftText.trim()) {
      setSuggestions({ codes: [], compliance: [], publicHealth: [], differentials: [] });
      return;
    }
    // Set loading state and start a timeout to call the API
    setLoadingSuggestions(true);
    const timer = setTimeout(() => {
      // Strip HTML tags before sending to the backend for suggestions.
      const plain = stripHtml(draftText);
      getSuggestions(plain, {
        chart: chartText,
        rules: settingsState.rules,
        audio: `${audioTranscript.provider} ${audioTranscript.patient}`.trim(),
        lang: settingsState.lang,
        specialty: settingsState.specialty,
        payer: settingsState.payer,
        age: age ? parseInt(age, 10) : undefined,
        sex,
        region: settingsState.region,
      })
        .then((data) => {
          setSuggestions(data);
          // Log a suggest event once suggestions are fetched
          if (patientID) {
            logEvent('suggest', { patientID, length: draftText.length }).catch(() => {});
          }
        })
        .catch((e) => {
          if (e.message === 'Unauthorized') {
            handleUnauthorized();
          } else {
            console.error('Suggestions failed', e);
          }
        })
        .finally(() => setLoadingSuggestions(false));
    }, 600); // 600ms delay
    // Cleanup function cancels the previous timer if draftText changes again
    return () => clearTimeout(timer);
  }, [draftText, audioTranscript, age, sex, settingsState.region, settingsState.specialty, settingsState.payer]);



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

  return (
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
              <button onClick={() => setShowTemplatesModal(true)}>
                {t('app.templates')}
              </button>
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
              <ClipboardExportButtons
                beautified={beautified}
                summary={summaryText}
                patientID={patientID}
              />
              <button
                disabled={!patientID || !draftText.trim()}
                onClick={() => {
                  localStorage.setItem(`draft_${patientID}`, draftText);
                  logEvent('note_saved', { patientID, length: draftText.length }).catch(() => {});
                }}
              >
                {t('app.saveDraft')}
              </button>
              {/* Upload an exported chart (text or PDF) */}
              <input
                type="file"
                accept=".txt,.pdf,.html,.xml"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleChartChange}
              />
              <button
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
              >
                {chartFileName ? t('app.changeChart') : t('app.uploadChart')}
              </button>
              {chartFileName && (
                <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--secondary)' }}>
                  {chartFileName}
                </span>
              )}
              {/* Toggle suggestion panel visibility */}
              <button
                onClick={() => setShowSuggestions((s) => !s)}
                style={{ marginLeft: '0.5rem' }}
              >
                {showSuggestions ? t('app.hideSuggestions') : t('app.showSuggestions')}
              </button>
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
                  className={summaryText ? (activeTab === 'summary' ? 'tab active' : 'tab') : 'tab disabled'}
                  onClick={() => summaryText && setActiveTab('summary')}
                >
                  {t('app.summary')}
                </button>
                </div>
                <div className="editor-area card">
                  {activeTab === 'draft' ? (
                    <NoteEditor
                      id="draft-input"
                      value={draftText}
                      onChange={handleDraftChange}
                      onRecord={handleRecordAudio}
                      recording={recording}
                      transcribing={transcribing}
                      onTranscriptChange={handleTranscriptChange}
                      error={transcriptionError}
                    />
                  ) : (
                    activeTab === 'beautified' ? (
                      <div className="beautified-view">{beautified}</div>
                    ) : (
                      <div className="beautified-view">{summaryText}</div>
                    ))}
                </div>
              </div>
              {(() => {
                const filtered = {
                  codes: settingsState.enableCodes ? suggestions.codes : [],
                  compliance: settingsState.enableCompliance ? suggestions.compliance : [],
                  publicHealth: settingsState.enablePublicHealth ? suggestions.publicHealth : [],
                  differentials: settingsState.enableDifferentials ? suggestions.differentials : [],
                };
                return (
                  <SuggestionPanel
                    suggestions={filtered}
                    loading={loadingSuggestions}
                    className={showSuggestions ? '' : 'collapsed'}
                    onInsert={handleInsertSuggestion}
                  />
                );
              })()}
            </>
          )}
          {view === 'dashboard' && <Dashboard />}
          {view === 'help' && <Help />}
          {view === 'settings' && (
            <Settings settings={settingsState} updateSettings={updateSettings} />
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
        </div>
      </div>
      {showTemplatesModal && (
        <TemplatesModal
          baseTemplates={baseTemplates}
          onSelect={(content) => {
            insertTemplate(content);
            setShowTemplatesModal(false);
          }}
          onClose={() => setShowTemplatesModal(false)}
        />
      )}
    </div>
  );
}

export default App;
