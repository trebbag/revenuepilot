import { useState, useEffect, useRef } from 'react';
import NoteEditor from './components/NoteEditor.jsx';
import SuggestionPanel from './components/SuggestionPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import Logs from './components/Logs.jsx';
import Help from './components/Help.jsx';
import Settings from './components/Settings.jsx';
import { beautifyNote, getSuggestions, logEvent, transcribeAudio, summarizeNote } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Drafts from './components/Drafts.jsx';

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
  // text is used.
  const [audioTranscript, setAudioTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  // References for MediaRecorder and audio chunks
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  // Track whether the sidebar is collapsed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Control visibility of the suggestion panel (for sliding effect)
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Track the current patient ID for draft saving
  const [patientID, setPatientID] = useState('');
  // Suggestions fetched from the API
  const [suggestions, setSuggestions] = useState({
    codes: [],
    compliance: [],
    publicHealth: [],
    differentials: [],
  });

  // Default values for theme and suggestion category settings.  These are
  // merged with any values persisted in ``localStorage`` so user preferences
  // survive page reloads.
  const defaultSettings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    // Array of custom clinical rules supplied by the user.  When non‑empty,
    // these rules are appended to the prompt sent to the AI model.  Each
    // entry should be a concise guideline such as “Payer X requires ROS for 99214”.
    rules: [],
  };
  // User settings controlling theme and which suggestion categories are enabled.
  // Load any previously saved settings from ``localStorage`` on first render.
  const [settingsState, setSettingsState] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('settings') || '{}') : {};
      return { ...defaultSettings, ...stored };
    } catch {
      return defaultSettings;
    }
  });

  // Function to update settings
  const updateSettings = (newSettings) => {
    setSettingsState(newSettings);
  };

  // Persist theme and suggestion category preferences whenever they change so
  // they remain after a page reload or application restart.
  useEffect(() => {
    const { theme, enableCodes, enableCompliance, enablePublicHealth, enableDifferentials } = settingsState;
    localStorage.setItem(
      'settings',
      JSON.stringify({ theme, enableCodes, enableCompliance, enablePublicHealth, enableDifferentials })
    );
  }, [
    settingsState.theme,
    settingsState.enableCodes,
    settingsState.enableCompliance,
    settingsState.enablePublicHealth,
    settingsState.enableDifferentials,
  ]);

  // Templates for quick note creation
  const templates = [
    {
      name: 'SOAP Note Template',
      content:
        'Subjective: \n\nObjective: \n\nAssessment: \n\nPlan: ',
    },
    {
      name: 'Wellness Visit Template',
      content:
        'Chief Complaint: Annual wellness visit\n\nHistory of Present Illness: \n\nPast Medical History: \n\nMedications: \n\nAllergies: \n\nPhysical Exam: \n\nAssessment & Plan: ',
    },
    {
      name: 'Follow-up Visit Template',
      content:
        'Chief Complaint: \n\nInterval History: \n\nReview of Systems: \n\nPhysical Exam: \n\nAssessment & Plan: ',
    },
  ];

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
    beautifyNote(plain)
      .then((cleaned) => {
        setBeautified(cleaned);
        setActiveTab('beautified');
        // Log a beautify event with patient ID and note length
        if (patientID) {
          logEvent('beautify', { patientID, length: draftText.length }).catch(() => {});
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
      audio: audioTranscript,
    })
      .then((summary) => {
        setSummaryText(summary);
        setActiveTab('summary');
        if (patientID) {
          logEvent('summary', { patientID, length: draftText.length }).catch(() => {});
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
          try {
            const text = await transcribeAudio(blob);
            setAudioTranscript(text);
          } catch (err) {
            console.error('Transcription failed', err);
            setAudioTranscript('');
          }
          if (patientID) {
            logEvent('audio_recorded', { patientID, size: blob.size }).catch(() => {});
          }
        };
        mediaRecorder.start();
        setRecording(true);
      } catch (err) {
        console.error('Error accessing microphone', err);
      }
    } else {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setRecording(false);
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
        audio: audioTranscript,
      })
        .then((data) => {
          setSuggestions(data);
          // Log a suggest event once suggestions are fetched
          if (patientID) {
            logEvent('suggest', { patientID, length: draftText.length }).catch(() => {});
          }
        })
        .finally(() => setLoadingSuggestions(false));
    }, 600); // 600ms delay
    // Cleanup function cancels the previous timer if draftText changes again
    return () => clearTimeout(timer);
  }, [draftText, audioTranscript]);

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
            <button onClick={() => setView('note')}>Back to Notes</button>
          ) : (
            <button onClick={() => setView('note')}>File</button>
          )}
          {view === 'note' && (
            <>
              <input
                type="text"
                placeholder="Patient ID"
                value={patientID}
                onChange={(e) => setPatientID(e.target.value)}
                className="patient-input"
              />
              <select
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx)) insertTemplate(templates[idx].content);
                  e.target.selectedIndex = 0;
                }}
                className="template-select"
              >
                <option value="">Insert Template</option>
                {templates.map((tpl, idx) => (
                  <option key={tpl.name} value={idx}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                disabled={loadingBeautify || !draftText.trim()}
                onClick={handleBeautify}
              >
                {loadingBeautify ? 'Beautifying…' : 'Beautify'}
              </button>
              <button
                disabled={loadingSummary || !draftText.trim()}
                onClick={handleSummarize}
                style={{ marginLeft: '0.5rem' }}
              >
                {loadingSummary ? 'Summarizing…' : 'Summarize'}
              </button>
              <button
                disabled={!beautified}
                onClick={() => navigator.clipboard.writeText(beautified)}
              >
                Copy
              </button>
              <button
                disabled={!patientID || !draftText.trim()}
                onClick={() => {
                  localStorage.setItem(`draft_${patientID}`, draftText);
                  logEvent('note_saved', { patientID, length: draftText.length }).catch(() => {});
                }}
              >
                Save Draft
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
                {chartFileName ? 'Change Chart' : 'Upload Chart'}
              </button>
              {chartFileName && (
                <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--secondary)' }}>
                  {chartFileName}
                </span>
              )}
              {/* Record or stop audio recording */}
              <button
                onClick={handleRecordAudio}
                style={{ marginLeft: '0.5rem' }}
              >
                {recording ? 'Stop Recording' : 'Record Audio'}
              </button>
              {audioTranscript && (
                <span
                  style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--secondary)' }}
                >
                  Transcript: {audioTranscript}
                </span>
              )}
              {/* Toggle suggestion panel visibility */}
              <button
                onClick={() => setShowSuggestions((s) => !s)}
                style={{ marginLeft: '0.5rem' }}
              >
                {showSuggestions ? 'Hide Suggestions' : 'Show Suggestions'}
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
                    Original Note
                  </button>
                  <button
                    className={beautified ? 'tab active' : 'tab disabled'}
                    onClick={() => beautified && setActiveTab('beautified')}
                  >
                    Beautified Note
                  </button>
                <button
                  className={summaryText ? (activeTab === 'summary' ? 'tab active' : 'tab') : 'tab disabled'}
                  onClick={() => summaryText && setActiveTab('summary')}
                >
                  Summary
                </button>
                </div>
                <div className="editor-area card">
                  {activeTab === 'draft' ? (
                    <NoteEditor
                      id="draft-input"
                      value={draftText}
                      onChange={handleDraftChange}
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
    </div>
  );
}

export default App;
