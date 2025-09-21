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
  startVisitSession,
  updateVisitSession,
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
// In test environment (vitest) disable real Quill to avoid delta/state race issues
if (typeof globalThis !== 'undefined' && globalThis.vi) {
  ReactQuill = null; // force fallback deterministic editor
}
if (
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV === 'test'
) {
  ReactQuill = null; // additional safeguard for test envs
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

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      seconds,
    ).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

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
    onPatientIdChange,
    onEncounterIdChange,
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
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [activeTab, setActiveTab] = useState('draft'); // 'draft' | 'beautified'
  const [beautified, setBeautified] = useState('');
  const [beautifyLoading, setBeautifyLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true); // responsive suggestion panel
  const [isNarrow, setIsNarrow] = useState(false);
  const [patientInput, setPatientInput] = useState(patientId || '');
  const [encounterInput, setEncounterInput] = useState(encounterId || '');
  const [visitSession, rawSetVisitSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const debounceRef = useRef(null); // ensure present after modifications
  const sessionStateRef = useRef(null);
  const sessionKeyRef = useRef('');
  const sessionTimerRef = useRef(null);
  const setSessionState = (valueOrUpdater) => {
    rawSetVisitSession((prev) => {
      const next =
        typeof valueOrUpdater === 'function'
          ? valueOrUpdater(prev)
          : valueOrUpdater;
      sessionStateRef.current = next;
      return next;
    });
  };
  sessionStateRef.current = visitSession;
  const classifiedCounts = (() => {
    const counts = {
      Condition: 0,
      Procedure: 0,
      Observation: 0,
      MedicationStatement: 0,
    };
    (selectedCodes.length
      ? selectedCodes
      : (codes || []).map((c) => (typeof c === 'string' ? c : c.code))
    ).forEach((c) => {
      const cu = (c || '').toUpperCase();
      if (/^\d{5}$/.test(cu) || /^[A-Z]\d{4}$/.test(cu)) counts.Procedure++;
      else if (/^[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/.test(cu))
        counts.Condition++;
      else if (
        /^\d{1,5}-\d{1,4}$/.test(cu) ||
        cu.startsWith('OBS') ||
        ['BP', 'HR', 'TEMP'].some((p) => cu.startsWith(p))
      )
        counts.Observation++;
      else if (cu.startsWith('MED') || cu.startsWith('RX'))
        counts.MedicationStatement++;
      else counts.Condition++;
    });
    return counts;
  })();

  const quillRef = useRef(null);
  const textAreaRef = useRef(null);
  const audioRef = useRef(null);
  const sanitizedId = id || 'note';
  const patientFieldId = `${sanitizedId}-patient-id`;
  const encounterFieldId = `${sanitizedId}-encounter-id`;

  const handlePatientInputChange = (e) => {
    const val = e.target.value;
    setPatientInput(val);
    if (onPatientIdChange) onPatientIdChange(val);
  };

  const handleEncounterInputChange = (e) => {
    const val = e.target.value;
    setEncounterInput(val);
    if (onEncounterIdChange) onEncounterIdChange(val);
  };

  useEffect(() => {
    if (mode === 'draft') setLocalValue(value || '');
  }, [value, mode]);

  useEffect(() => {
    setPatientInput(patientId || '');
  }, [patientId]);

  useEffect(() => {
    setEncounterInput(encounterId || '');
  }, [encounterId]);

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
      const inst = quillRef.current.getEditor
        ? quillRef.current.getEditor()
        : null;
      if (!inst) {
        const newVal = (value || '') + text;
        onChange(newVal);
        return;
      }
      let index;
      try {
        const range = inst.getSelection && inst.getSelection();
        if (range && typeof range.index === 'number') index = range.index;
      } catch (e) {
        index = undefined;
      }
      if (typeof index !== 'number') index = inst.getLength();
      inst.insertText(index, text);
      try {
        inst.setSelection(index + text.length);
      } catch (e) {
        /* ignore in jsdom */
      }
      setTimeout(() => {
        try {
          onChange(inst.root.innerHTML);
        } catch (e) {
          onChange((value || '') + text);
        }
      }, 0);
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
    // After inserting a template, surface transcript panel for quick merge
    if (transcript.provider || transcript.patient) setSideTab('transcript');
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

  const pauseVisitSession = async (reason = 'exit', options = {}) => {
    const session = sessionStateRef.current;
    if (!session?.sessionId || session.status === 'complete') return;
    try {
      const res = await updateVisitSession({
        sessionId: session.sessionId,
        action: 'pause',
      });
      if (!options.skipStateUpdate) {
        setSessionState((prev) => (prev ? { ...prev, ...res } : prev));
      }
      logEvent('visit_session_pause', {
        sessionId: session.sessionId,
        reason,
        patientId: session.patientId,
        encounterId: session.encounterId,
      }).catch(() => {});
    } catch (err) {
      if (!options.skipStateUpdate) {
        setSessionError(
          t('noteEditor.visitSessionError') ||
            'Failed to update visit session',
        );
      }
    }
  };

  const completeVisitSession = async (reason = 'finalize') => {
    const session = sessionStateRef.current;
    if (!session?.sessionId || session.status === 'complete') return;
    try {
      const res = await updateVisitSession({
        sessionId: session.sessionId,
        action: 'complete',
      });
      setSessionState((prev) => (prev ? { ...prev, ...res } : prev));
      sessionKeyRef.current = '';
      logEvent('visit_session_complete', {
        sessionId: session.sessionId,
        reason,
        patientId: session.patientId,
        encounterId: session.encounterId,
        endTime: res.endTime,
      }).catch(() => {});
    } catch (err) {
      setSessionError(
        t('noteEditor.visitSessionError') || 'Failed to update visit session',
      );
    }
  };

  useEffect(() => {
    if (mode !== 'draft') return undefined;
    const hasIds = (patientInput || '').trim() && (encounterInput || '').trim();
    if (!hasIds) {
      if (
        sessionStateRef.current?.sessionId &&
        sessionStateRef.current.status === 'started'
      ) {
        pauseVisitSession('missing_details');
      }
      sessionKeyRef.current = '';
      return undefined;
    }
    const encounterNumeric = Number.parseInt(encounterInput, 10);
    if (!Number.isFinite(encounterNumeric)) {
      return undefined;
    }
    const key = `${patientInput}::${encounterNumeric}`;
    const current = sessionStateRef.current;
    if (
      sessionKeyRef.current &&
      sessionKeyRef.current !== key &&
      current?.sessionId &&
      current.status === 'started'
    ) {
      pauseVisitSession('switch_patient');
    }
    if (sessionKeyRef.current === key && current?.sessionId) {
      return undefined;
    }
    let cancelled = false;
    sessionKeyRef.current = key;
    setSessionError('');
    startVisitSession({ encounterId: encounterNumeric })
      .then((res) => {
        if (cancelled) return;
        const info = {
          sessionId: res.sessionId,
          status: res.status || 'started',
          startTime: res.startTime,
          endTime: res.endTime || null,
          patientId: patientInput,
          encounterId: encounterNumeric,
        };
        setSessionState(info);
        logEvent('visit_session_start', {
          sessionId: info.sessionId,
          patientId: info.patientId,
          encounterId: info.encounterId,
          startTime: info.startTime,
        }).catch(() => {});
      })
      .catch(() => {
        if (cancelled) return;
        setSessionError(
          t('noteEditor.visitSessionError') ||
            'Failed to start visit session',
        );
        sessionKeyRef.current = '';
      });
    return () => {
      cancelled = true;
    };
  }, [patientInput, encounterInput, mode, t]);

  useEffect(() => {
    const session = visitSession;
    if (!session?.startTime) {
      setSessionElapsedSeconds(0);
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      return () => {};
    }
    const startTs = Date.parse(session.startTime);
    if (!Number.isFinite(startTs)) return () => {};
    const updateElapsed = () => {
      const endTs = session.endTime ? Date.parse(session.endTime) : Date.now();
      if (!Number.isFinite(endTs)) return;
      const seconds = Math.max(0, Math.floor((endTs - startTs) / 1000));
      setSessionElapsedSeconds(seconds);
    };
    updateElapsed();
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    if (!session.endTime && session.status !== 'complete') {
      sessionTimerRef.current = setInterval(updateElapsed, 1000);
    } else {
      sessionTimerRef.current = null;
    }
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [visitSession, setSessionElapsedSeconds]);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      pauseVisitSession('exit', { skipStateUpdate: true });
    };
  }, []);

  const handleTimeUpdate = () => {
    if (!segments.length || !audioRef.current) return;
    const t = audioRef.current.currentTime;
    const seg = segments.find((s) => t >= s.start && t <= s.end);
    if (seg) setCurrentSpeaker(seg.speaker);
  };

  // Moved up: transcript controls (was previously below templateList causing ReferenceError when referenced early)
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

  const templateList = templates.length ? (
    <div>
      <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
        {templates.map((tpl) => (
          <li key={tpl.id} style={{ marginBottom: '0.25rem' }}>
            <button
              type="button"
              onClick={() => {
                handleTemplateClick(tpl);
                setShowTemplateDropdown(false);
              }}
            >
              {tpl.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div style={{ padding: '0.5rem' }}>
      <p>{t('settings.noTemplates')}</p>
    </div>
  );

  const hasVisitSession = Boolean(visitSession?.sessionId);
  const formattedSessionDuration = formatDuration(sessionElapsedSeconds);
  const sessionStatusLabel = visitSession?.status
    ? visitSession.status === 'complete'
      ? t('noteEditor.visitSessionComplete')
      : visitSession.status === 'pause'
        ? t('noteEditor.visitSessionPaused')
        : t('noteEditor.visitSessionActive')
    : '';

  const visitSessionControls = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: '0.75rem',
      }}
    >
      <label htmlFor={patientFieldId} style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{t('noteEditor.patientIdLabel')}</span>
        <input
          id={patientFieldId}
          value={patientInput}
          onChange={handlePatientInputChange}
          style={{ minWidth: '8rem' }}
        />
      </label>
      <label
        htmlFor={encounterFieldId}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <span style={{ fontWeight: 600 }}>{t('noteEditor.encounterIdLabel')}</span>
        <input
          id={encounterFieldId}
          value={encounterInput}
          onChange={handleEncounterInputChange}
          style={{ minWidth: '8rem' }}
        />
      </label>
      {hasVisitSession ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>
            {t('noteEditor.visitDuration')}: {formattedSessionDuration}
          </span>
          {sessionStatusLabel ? (
            <span style={{ color: '#555', fontSize: '0.875rem' }}>
              {sessionStatusLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {sessionError ? (
        <span style={{ color: 'red' }}>{sessionError}</span>
      ) : null}
    </div>
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

  // Restored segment list (was lost during refactor)
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

  // Templates dropdown visibility state (rendered above the editor)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  useEffect(() => {
    if (activeTab === 'beautified') {
      let cancelled = false;
      setBeautifyLoading(true);
      const contentForBeautify = /<p[ >]/i.test(value || '')
        ? value || ''
        : `<p>${value || ''}</p>`;
      beautifyNote(contentForBeautify, { specialty, payer })
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
    const codeValues = selectedCodes.length
      ? selectedCodes
      : (codes || []).map((c) => (typeof c === 'string' ? c : c.code));
    const res = await exportToEhr(
      value,
      codeValues,
      patientInput, // use live input
      encounterInput, // use live input
      [],
      [],
      true,
    );
    if (res.status === 'exported') {
      setEhrFeedback(t('clipboard.exported'));
      await completeVisitSession('export_to_ehr');
    } else if (res.status === 'bundle') {
      setEhrFeedback(t('clipboard.exported'));
      await completeVisitSession('export_to_ehr');
      // Offer a download of the bundle JSON
      try {
        const blob = new Blob([JSON.stringify(res.bundle, null, 2)], {
          type: 'application/fhir+json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fhir_bundle.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        /* ignore */
      }
    } else if (res.status === 'auth_error') {
      setEhrFeedback(t('ehrAuthFailed'));
    } else {
      setEhrFeedback(t('clipboard.exportFailed'));
    }
    setExporting(false);
    setTimeout(() => setEhrFeedback(''), 2500);
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
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          position: 'relative',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {visitSessionControls}
          <div
            style={{
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
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
            {/* New: export button available in draft/beautified toggle bar */}
            <button
              type="button"
              onClick={handleExportEhr}
              disabled={exporting}
              style={{ marginLeft: '0.75rem', position: 'relative' }}
            >
              {exporting ? '…' : t('ehrExport')}
              <span
                style={{
                  background: '#0366d6',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '0 6px',
                  marginLeft: '0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                {selectedCodes.length || (codes || []).length}
              </span>
            </button>
            {ehrFeedback && (
              <span style={{ marginLeft: '0.5rem' }}>{ehrFeedback}</span>
            )}
            {isNarrow && (
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                style={{ marginLeft: 'auto' }}
                aria-expanded={panelOpen}
                aria-controls="suggestion-panel"
              >
                {panelOpen
                  ? t('app.hideSuggestions') || 'Hide Suggestions'
                  : t('app.showSuggestions') || 'Show Suggestions'}
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
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '0.5rem',
                border: '1px solid #ccc',
              }}
            >
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
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {/* Bundle audio controls and transcript controls above the editor */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {audioControls}
                {transcriptControls}
              </div>

              {/* Templates dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTemplateDropdown((s) => !s)}
                >
                  Templates ▾
                </button>
                {showTemplateDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: 'var(--panel-bg)',
                      border: '1px solid var(--disabled)',
                      boxShadow: '0 6px 12px rgba(0,0,0,0.08)',
                      borderRadius: '6px',
                      zIndex: 30,
                      minWidth: '220px',
                      padding: '0.5rem',
                    }}
                  >
                    {templateList}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginTop: '0.5rem' }}>
              <SuggestionPanel
                suggestions={
                  suggestions || {
                    codes: [],
                    compliance: [],
                    publicHealth: [],
                    differentials: [],
                  }
                }
                loading={suggestLoading}
                settingsState={null}
                text={value}
                fetchSuggestions={(text) =>
                  getSuggestions(text, { specialty, payer }).then(
                    setSuggestions,
                  )
                }
                onInsert={(text) => {
                  const match = text.match(/^([A-Z0-9.]+)/i);
                  const codeOnly = match ? match[1] : text;
                  if (quillRef.current && quillRef.current.getEditor) {
                    try {
                      const inst = quillRef.current.getEditor();
                      const len = Math.max(0, inst.getLength() - 1); // ignore trailing newline
                      const needsSpace = /\S$/.test(inst.getText(0, len));
                      inst.insertText(len, (needsSpace ? ' ' : '') + codeOnly);
                      try {
                        inst.setSelection(inst.getLength() - 1);
                      } catch (_) {
                        /* ignore */
                      }
                      const html = inst.root?.innerHTML || value || '';
                      onChange(html);
                      // Flush after microtask in case Quill batches
                      setTimeout(() => {
                        try {
                          onChange(inst.root?.innerHTML || html);
                        } catch (e) {
                          /* ignore */
                        }
                      }, 0);
                      return;
                    } catch (e) {
                      /* fall through to fallback */
                    }
                  }
                  // Fallback (no Quill loaded): wrap/append inside a paragraph
                  const current = value || '';
                  let inner = current;
                  if (/^<p[ >]/i.test(inner))
                    inner = inner
                      .replace(/^<p[^>]*>/i, '')
                      .replace(/<\/p>$/i, '');
                  const needsSpace = /\S$/.test(inner);
                  const html = `<p>${inner}${inner ? (needsSpace ? ' ' : ' ') : ''}${codeOnly}</p>`;
                  onChange(html);
                }}
              />
              {/* Code selection UI */}
              {suggestions?.codes?.length ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <strong>
                    {t('suggestion.codes')} – {t('export') || 'Export'}
                  </strong>
                  <ul
                    style={{
                      listStyle: 'none',
                      paddingLeft: 0,
                      marginTop: '0.25rem',
                    }}
                  >
                    {suggestions.codes.map((c, idx) => {
                      const code = typeof c === 'string' ? c : c.code;
                      return (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}>
                          <label style={{ cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedCodes.includes(code)}
                              onChange={(e) => {
                                setSelectedCodes((prev) =>
                                  e.target.checked
                                    ? [...prev, code]
                                    : prev.filter((x) => x !== code),
                                );
                              }}
                              style={{ marginRight: '0.4rem' }}
                            />
                            {code}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <small style={{ color: '#555' }}>
                    {t('ehrExport')} – {selectedCodes.length || 0}{' '}
                    {t('suggestion.codes')}
                  </small>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback lightweight editor (also used during tests). Provide a .ql-editor div so tests can query it.
  const htmlMirror = /<p[ >]/i.test(value || '')
    ? value || ''
    : `<p>${value || ''}</p>`;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {visitSessionControls}
        <div
          style={{
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div>
            <button
              type="button"
              disabled={activeTab === 'draft'}
              onClick={() => setActiveTab('draft')}
            >
              Draft
            </button>
            <button
              type="button"
              style={{ marginLeft: '0.5rem' }}
              disabled={activeTab === 'beautified'}
              onClick={() => setActiveTab('beautified')}
            >
              Beautified
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportEhr}
            disabled={exporting}
            style={{ marginLeft: '0.75rem', position: 'relative' }}
          >
            {exporting ? '…' : t('ehrExport')}
            <span
              style={{
                background: '#0366d6',
                color: '#fff',
                borderRadius: '8px',
                padding: '0 6px',
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {selectedCodes.length || (codes || []).length}
            </span>
          </button>
          {ehrFeedback && (
            <span style={{ marginLeft: '0.5rem' }}>{ehrFeedback}</span>
          )}
        </div>
        {activeTab === 'draft' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {audioControls}
                {transcriptControls}
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowTemplateDropdown((s) => !s)}
                >
                  Templates ▾
                </button>
                {showTemplateDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: 'var(--panel-bg)',
                      border: '1px solid var(--disabled)',
                      boxShadow: '0 6px 12px rgba(0,0,0,0.08)',
                      borderRadius: '6px',
                      zIndex: 30,
                      minWidth: '220px',
                      padding: '0.5rem',
                    }}
                  >
                    {templateList}
                  </div>
                )}
              </div>
            </div>
            <textarea
              ref={textAreaRef}
              id={id}
              value={localValue}
              onChange={handleTextAreaChange}
              style={{ width: '100%', height: '40%', padding: '0.5rem' }}
              placeholder={t('noteEditor.placeholder')}
            />
            <div
              className="ql-editor"
              style={{
                flex: 1,
                border: '1px solid #ccc',
                padding: '0.5rem',
                minHeight: '150px',
                overflow: 'auto',
              }}
              dangerouslySetInnerHTML={{ __html: htmlMirror }}
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
          </>
        )}
        {activeTab === 'beautified' && (
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '0.5rem',
              border: '1px solid #ccc',
              whiteSpace: 'pre-wrap',
            }}
          >
            {beautifyLoading ? 'Beautifying…' : beautified}
          </div>
        )}
      </div>
      {/* Suggestion panel rendered to the right for suggestions */}
      <div style={{ width: '250px', marginLeft: '0.5rem' }}>
        <SuggestionPanel
          suggestions={
            suggestions || {
              codes: [],
              compliance: [],
              publicHealth: [],
              differentials: [],
            }
          }
          loading={suggestLoading}
          settingsState={null}
          /* Provide text so internal debounce logic may run if needed */
          text={localValue}
          fetchSuggestions={(text) =>
            getSuggestions(text, { specialty, payer }).then(setSuggestions)
          }
          onInsert={(text) => {
            const match = text.match(/^([A-Z0-9.]+)/i);
            const codeOnly = match ? match[1] : text;
            // Insert at cursor in textarea if possible
            if (textAreaRef.current) {
              const el = textAreaRef.current;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const needsSpace =
                start > 0 && /\S$/.test(localValue.slice(0, start));
              const insertion = (needsSpace ? ' ' : '') + codeOnly;
              const newPlain = `${localValue.slice(0, start)}${insertion}${localValue.slice(end)}`;
              setLocalValue(newPlain);
              // Mirror keeps paragraphs; wrap plain text in <p>
              const htmlVal = /<p[ >]/i.test(newPlain)
                ? newPlain
                : `<p>${newPlain}</p>`;
              onChange(htmlVal);
              setTimeout(() => {
                try {
                  el.focus();
                  const pos = start + insertion.length;
                  el.selectionStart = el.selectionEnd = pos;
                } catch (_) {
                  /* ignore */
                }
              }, 0);
              return;
            }
            const newPlain =
              localValue +
              (localValue && !/\s$/.test(localValue) ? ' ' : '') +
              codeOnly;
            setLocalValue(newPlain);
            const htmlVal = /<p[ >]/i.test(newPlain)
              ? newPlain
              : `<p>${newPlain}</p>`;
            onChange(htmlVal);
          }}
        />
      </div>
    </div>
  );
});

export default NoteEditor;
