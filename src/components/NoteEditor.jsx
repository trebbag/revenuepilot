import {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchLastTranscript,
  getTemplates,
  transcribeAudio,
  exportToEhr,
  logEvent,
} from '../api.js';
import SuggestionPanel from './SuggestionPanel.jsx';
import { beautifyNote, getSuggestions } from '../api/client.ts';

let ReactQuill;
try {
  ReactQuill = require('react-quill');
  require('react-quill/dist/quill.snow.css');
} catch (err) {
  ReactQuill = null;
}

const quillFormats = [
  'header',
  'bold',
  'italic',
  'underline',
  'list',
  'bullet',
];

// Maximum number of history entries to retain for undo/redo in beautified mode
const HISTORY_LIMIT = 20;

function useAudioRecorder(onTranscribed) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setError(t('noteEditor.audioUnsupported'));
      return;
    }
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
          const data = await transcribeAudio(blob, true);
          if (data.error) setError(data.error);
          else setError('');
          if (onTranscribed) onTranscribed(data, blob);
        } catch (err) {
          console.error('Transcription failed', err);
          setError(t('noteEditor.transcriptionFailed'));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Error accessing microphone', err);
      setError(t('noteEditor.microphoneAccessDenied'));
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      if (recorder.stream) recorder.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return { recording, transcribing, error, toggleRecording };
}

const NoteEditor = forwardRef(function NoteEditor(
  {
    id,
    value,
    onChange,
    onTranscriptChange,
    mode = 'draft',
    specialty,
    payer,
    defaultTemplateId,
    onTemplateChange,
    codes = [],
    patientId = '',
    encounterId = '',
    role = '',
  },
  ref,
) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value || '');
  const [history, setHistory] = useState(value ? [value] : []);
  const [historyIndex, setHistoryIndex] = useState(value ? 0 : -1);
  const [templates, setTemplates] = useState([]);
  const [sideTab, setSideTab] = useState('templates');
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [segments, setSegments] = useState([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [ehrFeedback, setEhrFeedback] = useState('');
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('draft'); // 'draft' | 'beautified'
  const [beautified, setBeautified] = useState('');
  const [beautifyLoading, setBeautifyLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true); // responsive suggestion panel
  const [isNarrow, setIsNarrow] = useState(false);
  const debounceRef = useRef();

  const quillRef = useRef(null);
  const textAreaRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (mode === 'draft') setLocalValue(value || '');
  }, [value, mode]);

  useEffect(() => {
    if (mode !== 'beautified') return;
    setHistory((prev) => {
      const current = historyIndex >= 0 ? prev[historyIndex] : undefined;
      if (current === value) return prev;
      const base = prev.slice(0, historyIndex + 1);
      const appended = [...base, value];
      const newHist = appended.slice(-HISTORY_LIMIT);
      setHistoryIndex(newHist.length - 1);
      return newHist;
    });
  }, [value, mode]);

  useEffect(() => {
    let active = true;
    getTemplates(specialty, payer)
      .then((tpls) => {
        if (!active) return;
        setTemplates(tpls);
        if (!value && defaultTemplateId) {
          const tpl = tpls.find(
            (t) => String(t.id) === String(defaultTemplateId),
          );
          if (tpl) insertText(tpl.content);
        }
      })
      .catch(() => {
        if (active) setTemplates([]);
      });
    return () => {
      active = false;
    };
  }, [specialty, payer, defaultTemplateId]);

  const loadTranscript = async () => {
    setLoadingTranscript(true);
    setFetchError('');
    try {
      const data = await fetchLastTranscript();
      setTranscript({
        provider: data.provider || '',
        patient: data.patient || '',
      });
      if (onTranscriptChange) onTranscriptChange(data);
      setSegments(data.segments || []);
      setFetchError(data.error || '');
    } catch (err) {
      setFetchError(t('noteEditor.failedToLoadTranscript'));
    } finally {
      setLoadingTranscript(false);
    }
  };

  useEffect(() => {
    if (mode === 'draft') loadTranscript();
  }, [mode]);

  const handleTextAreaChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    onChange(newVal);
  };

  const insertText = (text) => {
    if (ReactQuill && quillRef.current) {
      const inst = quillRef.current.getEditor ? quillRef.current.getEditor() : null;
      if (!inst) {
        // Fallback for test environments where Quill not fully initialised
        const newVal = (value || '') + text;
        onChange(newVal);
        return;
      }
      const range = inst.getSelection(true);
      const index = range ? range.index : inst.getLength();
      inst.insertText(index, text);
      try { inst.setSelection(index + text.length); } catch (e) { /* ignore selection errors in tests */ }
      onChange(inst.root.innerHTML);
    } else if (textAreaRef.current) {
      const el = textAreaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = `${localValue.slice(0, start)}${text}${localValue.slice(end)}`;
      setLocalValue(newVal);
      onChange(newVal);
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + text.length;
      }, 0);
    } else {
      const newVal = `${localValue}${text}`;
      setLocalValue(newVal);
      onChange(newVal);
    }
  };

  useImperativeHandle(ref, () => ({ insertAtCursor: insertText }));
  const handleTemplateClick = (tpl) => {
    insertText(tpl.content);
    if (onTemplateChange) onTemplateChange(tpl.id);
    logEvent('template_use', { templateId: tpl.id }).catch(() => {});
  };

  const {
    recording,
    transcribing,
    error: recorderError,
    toggleRecording,
  } = useAudioRecorder((data, blob) => {
    setTranscript({
      provider: data.provider || '',
      patient: data.patient || '',
    });
    setSegments(data.segments || []);
    if (onTranscriptChange) onTranscriptChange(data);
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } else {
      setAudioUrl('');
    }
  });

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const handleTimeUpdate = () => {
    if (!segments.length || !audioRef.current) return;
    const t = audioRef.current.currentTime;
    const seg = segments.find((s) => t >= s.start && t <= s.end);
    if (seg) setCurrentSpeaker(seg.speaker);
  };

  const templateList = templates.length ? (
    <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
      {templates.map((tpl) => (
        <li key={tpl.id} style={{ marginBottom: '0.25rem' }}>
          <button type="button" onClick={() => handleTemplateClick(tpl)}>
            {tpl.name}
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p>{t('settings.noTemplates')}</p>
  );

  const recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    window.MediaRecorder;

  const audioControls = recordingSupported ? (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        onClick={toggleRecording}
        aria-label={
          recording
            ? t('noteEditor.stopRecording')
            : t('noteEditor.recordAudio')
        }
      >
        {recording
          ? t('noteEditor.stopRecording')
          : t('noteEditor.recordAudio')}
      </button>
      {recording && (
        <span style={{ marginLeft: '0.5rem' }}>
          {t('noteEditor.recording')}
        </span>
      )}
      {transcribing && (
        <span style={{ marginLeft: '0.5rem' }}>
          {t('noteEditor.transcribing')}
        </span>
      )}
    </div>
  ) : (
    <p style={{ marginBottom: '0.5rem' }}>{t('noteEditor.audioUnsupported')}</p>
  );

  const transcriptControls = (transcript.provider || transcript.patient) && (
    <div style={{ marginTop: '0.5rem' }}>
      <strong>{t('noteEditor.transcript')}</strong>
      {transcript.provider !== undefined && (
        <div style={{ marginTop: '0.25rem' }}>
          <label>
            <strong>Provider:</strong>
          </label>
          <textarea
            value={transcript.provider}
            onChange={(e) =>
              setTranscript((prev) => ({ ...prev, provider: e.target.value }))
            }
            style={{
              width: '100%',
              backgroundColor:
                currentSpeaker === 'provider' ? '#fff3cd' : undefined,
            }}
          />
          <button type="button" onClick={() => insertText(transcript.provider)}>
            {t('noteEditor.insert')}
          </button>
        </div>
      )}
      {transcript.patient !== undefined && (
        <div style={{ marginTop: '0.25rem' }}>
          <label>
            <strong>Patient:</strong>
          </label>
          <textarea
            value={transcript.patient}
            onChange={(e) =>
              setTranscript((prev) => ({ ...prev, patient: e.target.value }))
            }
            style={{
              width: '100%',
              backgroundColor:
                currentSpeaker === 'patient' ? '#fff3cd' : undefined,
            }}
          />
          <button type="button" onClick={() => insertText(transcript.patient)}>
            {t('noteEditor.insert')}
          </button>
        </div>
      )}
    </div>
  );

  const segmentList =
    segments.length > 0 ? (
      <div style={{ marginTop: '0.5rem' }}>
        <strong>{t('noteEditor.segments')}</strong>
        <ul style={{ paddingLeft: '1.25rem' }}>
          {segments.map((s, i) => (
            <li
              key={i}
              style={{
                backgroundColor:
                  currentSpeaker === s.speaker ? '#fff3cd' : undefined,
              }}
            >
              <strong>{s.speaker}:</strong> {s.text}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const sidebar = (
    <div style={{ width: '200px', marginLeft: '0.5rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setSideTab('templates')}
          disabled={sideTab === 'templates'}
        >
          {t('app.templates')}
        </button>
        <button
          type="button"
          onClick={() => setSideTab('transcript')}
          disabled={sideTab === 'transcript'}
          style={{ marginLeft: '0.5rem' }}
        >
          {t('noteEditor.transcript')}
        </button>
      </div>
      <div>
        {sideTab === 'templates' ? (
          templateList
        ) : (
          <div>
            {segmentList}
            {transcriptControls}
          </div>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    if (activeTab === 'beautified') {
      let cancelled = false;
      setBeautifyLoading(true);
      beautifyNote(value || '', { specialty, payer })
        .then((b) => {
          if (!cancelled) setBeautified(b || '');
        })
        .catch(() => {})
        .finally(() => !cancelled && setBeautifyLoading(false));
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [activeTab, value, specialty, payer]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSuggestLoading(true);
      getSuggestions(value || '', { specialty, payer })
        .then((res) => setSuggestions(res))
        .catch(() => setSuggestions(null))
        .finally(() => setSuggestLoading(false));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [value, specialty, payer]);

  const handleUndo = () => {
    setHistoryIndex((idx) => {
      if (idx <= 0) return idx;
      const newIndex = idx - 1;
      onChange(history[newIndex]);
      return newIndex;
    });
  };

  const handleRedo = () => {
    setHistoryIndex((idx) => {
      if (idx >= history.length - 1) return idx;
      const newIndex = idx + 1;
      onChange(history[newIndex]);
      return newIndex;
    });
  };

  const handleExportEhr = async () => {
    setExporting(true);
    const res = await exportToEhr(
      value,
      codes,
      patientId,
      encounterId,
      [],
      [],
      true,
    );
    if (res.status === 'exported') {
      setEhrFeedback(t('clipboard.exported'));
    } else if (res.status === 'auth_error') {
      setEhrFeedback(t('ehrAuthFailed'));
    } else {
      setEhrFeedback(t('clipboard.exportFailed'));
    }
    setExporting(false);
    setTimeout(() => setEhrFeedback(''), 2000);
  };

  if (mode === 'beautified') {
    // existing beautified history view kept for backward compatibility
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('draft')}
              disabled={activeTab === 'draft'}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('beautified')}
              disabled={activeTab === 'beautified'}
              style={{ marginLeft: '0.5rem' }}
            >
              Beautified
            </button>
          </div>
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
          >
            {t('noteEditor.undo')}
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            style={{ marginLeft: '0.5rem' }}
          >
            {t('noteEditor.redo')}
          </button>
          <button
            type="button"
            onClick={handleExportEhr}
            disabled={exporting}
            style={{ marginLeft: '0.5rem' }}
          >
            {exporting ? '…' : t('ehrExport')}
          </button>
          {ehrFeedback && (
            <span style={{ marginLeft: '0.5rem' }}>{ehrFeedback}</span>
          )}
        </div>
        {activeTab === 'beautified' ? (
          <div className="beautified-view" style={{ whiteSpace: 'pre-wrap' }}>
            {beautifyLoading ? '…' : beautified || ''}
          </div>
        ) : (
          <div className="beautified-view" style={{ whiteSpace: 'pre-wrap' }}>
            {history[historyIndex] || ''}
          </div>
        )}
      </div>
    );
  }

  const handleQuillChange = (content /* , delta, source, editor */) => {
    // Keep parent state in sync when user types
    onChange(content);
  };

  if (ReactQuill) {
    return (
      <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
            <div>
              <button
                type="button"
                onClick={() => setActiveTab('draft')}
                disabled={activeTab === 'draft'}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('beautified')}
                disabled={activeTab === 'beautified'}
                style={{ marginLeft: '0.5rem' }}
              >
                Beautified
              </button>
            </div>
            {isNarrow && (
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                style={{ marginLeft: 'auto' }}
                aria-expanded={panelOpen}
                aria-controls="suggestion-panel"
              >
                {panelOpen ? t('app.hideSuggestions') || 'Hide Suggestions' : t('app.showSuggestions') || 'Show Suggestions'}
              </button>
            )}
          </div>
          {audioControls}
          {activeTab === 'draft' ? (
            <ReactQuill
              ref={quillRef}
              id={id}
              theme="snow"
              value={value}
              onChange={handleQuillChange}
              formats={quillFormats}
              style={{ flex: 1, width: '100%' }}
            />
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem', border: '1px solid #ccc' }}>
              {beautifyLoading ? 'Beautifying…' : beautified}
            </div>
          )}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
          )}
          {(recorderError || fetchError) && (
            <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
          )}
          {loadingTranscript && <p>{t('noteEditor.loadingTranscript')}</p>}
        </div>
        {/* Suggestion / template side area */}
        {(!isNarrow || panelOpen) && (
          <div
            id="suggestion-panel"
            style={{
              width: isNarrow ? '100%' : '250px',
              marginLeft: isNarrow ? 0 : '0.5rem',
              position: isNarrow ? 'absolute' : 'relative',
              right: isNarrow ? 0 : 'auto',
              top: isNarrow ? '3rem' : 'auto',
              bottom: isNarrow ? 0 : 'auto',
              background: isNarrow ? '#fff' : 'transparent',
              border: isNarrow ? '1px solid #ccc' : 'none',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {sidebar}
              {isNarrow && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  style={{ marginLeft: 'auto' }}
                  aria-label={t('app.hideSuggestions') || 'Hide Suggestions'}
                >
                  ×
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginTop: '0.5rem' }}>
              <SuggestionPanel
                suggestions={suggestions || { codes: [], compliance: [], publicHealth: [], differentials: [] }}
                loading={suggestLoading}
                settingsState={null}
                text={value}
                fetchSuggestions={(text) => getSuggestions(text, { specialty, payer }).then(setSuggestions)}
                onInsert={(text) => insertText(text + '\n')}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flex: 1 }}>
        {audioControls}
        <textarea
          ref={textAreaRef}
          id={id}
          value={localValue}
          onChange={handleTextAreaChange}
          style={{ width: '100%', height: '100%', padding: '0.5rem' }}
          placeholder={t('noteEditor.placeholder')}
        />
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            onTimeUpdate={handleTimeUpdate}
            style={{ width: '100%', marginTop: '0.5rem' }}
          />
        )}
        {(recorderError || fetchError) && (
          <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
        )}
        {loadingTranscript && <p>{t('noteEditor.loadingTranscript')}</p>}
      </div>
      {sidebar}
    </div>
  );
});

export default NoteEditor;
