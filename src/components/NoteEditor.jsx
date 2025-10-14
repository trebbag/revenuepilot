import {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchLastTranscript,
  getTemplates,
  transcribeAudio,
  exportToEhr,
  logEvent,
  searchPatients,
  validateEncounter,
  startVisitSession,
  updateVisitSession,
  connectTranscriptionStream,
  connectComplianceStream,
  connectCodesStream,
  connectCollaborationStream,
  gateNoteSuggestions,
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

function describePatient(patient) {
  if (!patient || typeof patient !== 'object') return '';
  const parts = [];
  if (patient.name) parts.push(patient.name);
  const extras = [];
  if (patient.mrn) extras.push(`MRN ${patient.mrn}`);
  if (patient.dob) extras.push(patient.dob);
  if (!parts.length && patient.patientId) parts.push(`ID ${patient.patientId}`);
  const base = parts.join(' · ');
  const extra = extras.join(' · ');
  if (base && extra) return `${base} · ${extra}`;
  return base || extra || (patient.patientId ? String(patient.patientId) : '');
}

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
    onSpecialtyChange = () => {},
    onPayerChange = () => {},
    defaultTemplateId,
    onTemplateChange,
    codes = [],
    patientId = '',
    encounterId = '',
    onPatientIdChange = () => {},
    onEncounterChange = () => {},
    role = '',
    settingsState = null,
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
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [patientLookupStatus, setPatientLookupStatus] = useState('idle');
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);
  const [encounterInput, setEncounterInput] = useState(encounterId || '');
  const [encounterStatus, setEncounterStatus] = useState({
    state: 'idle',
    message: '',
    details: null,
  });
  const [validatedEncounter, setValidatedEncounter] = useState(null);
  const patientSuggestionHideRef = useRef(null);
  const patientFocusedRef = useRef(false);
  const selectingPatientRef = useRef(false);
  const onPatientIdChangeRef = useRef(onPatientIdChange);
  const onEncounterChangeRef = useRef(onEncounterChange);
  const onSpecialtyChangeRef = useRef(onSpecialtyChange);
  const onPayerChangeRef = useRef(onPayerChange);
  const emittedEncounterRef = useRef('');
  const prevEncounterPropRef = useRef(encounterId);
  const [visitSession, rawSetVisitSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const suggestionDebounceRef = useRef(null);
  const sessionStateRef = useRef(null);
  const sessionKeyRef = useRef('');
  const sessionTimerRef = useRef(null);

  const mergeSuggestionPayload = useCallback((previous, incoming) => {
    if (!incoming) return previous || null;
    if (!previous) return incoming;
    const merged = { ...previous, ...incoming };
    const arrayKeys = ['codes', 'compliance', 'publicHealth', 'differentials'];
    arrayKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        const value = incoming[key];
        if (Array.isArray(value)) {
          merged[key] = [...value];
        } else if (value == null) {
          merged[key] = [];
        } else {
          merged[key] = value;
        }
      }
    });
    if (Object.prototype.hasOwnProperty.call(incoming, 'followUp')) {
      merged.followUp = incoming.followUp ?? null;
    }
    return merged;
  }, []);
  const buildSuggestionContext = () => {
    const sessionContext = sessionStateRef.current || visitSession;
    const encounterSource =
      sessionContext?.encounterId ??
      emittedEncounterRef.current ??
      encounterInput ??
      encounterId ??
      '';
    const encounterValue =
      encounterSource !== undefined && encounterSource !== null
        ? String(encounterSource).trim()
        : '';
    const sessionValue =
      sessionContext?.sessionId !== undefined && sessionContext?.sessionId !== null
        ? String(sessionContext.sessionId).trim()
        : '';
    const noteValue =
      sessionContext?.noteId !== undefined && sessionContext?.noteId !== null
        ? String(sessionContext.noteId).trim()
        : '';
    return {
      specialty,
      payer,
      encounterId: encounterValue || undefined,
      sessionId: sessionValue || undefined,
      noteId: noteValue || undefined,
    };
  };

  const runSuggestionFetch = (noteText, extra = {}) => {
    const baseContext = buildSuggestionContext();
    const requestContext = {
      ...baseContext,
      specialty,
      payer,
      ...(extra || {}),
    };
    const intentRaw =
      (extra?.intent || requestContext.intent || '').toString().toLowerCase();
    return getSuggestions(typeof noteText === 'string' ? noteText : '', requestContext).then(
      (result) => {
        if (!result?.blocked) {
          let finalResult = result;
          if (intentRaw === 'manual') {
            setSuggestions((prev) => {
              const merged = mergeSuggestionPayload(prev, result);
              finalResult = merged;
              return merged;
            });
          } else {
            setSuggestions(result);
          }
          return finalResult;
        }
        return result;
      },
    );
  };

  const runSuggestionGate = (noteText, extra = {}) => {
    const baseContext = buildSuggestionContext();
    const requestContext = {
      ...baseContext,
      specialty,
      payer,
      ...(extra || {}),
    };
    const intentRaw = (extra?.intent || requestContext.intent || 'auto').toString().toLowerCase();
    const requestType = intentRaw === 'manual' ? 'manual_mini' : 'auto';
    const noteIdentifier =
      requestContext.noteId ||
      requestContext.sessionId ||
      requestContext.encounterId ||
      'suggestion-draft';
    return gateNoteSuggestions({
      noteId: noteIdentifier,
      noteContent: typeof noteText === 'string' ? noteText : '',
      requestType,
      transcriptCursor: requestContext.transcriptCursor,
      acceptedJson: requestContext.acceptedJson,
      force: Boolean(requestContext.force || extra?.force),
      inputTimestamp: requestContext.inputTimestamp,
    });
  };
  const resetStreamSessions = () => {
    streamSessionsRef.current = {
      transcription: { sessionId: '', lastEventId: null },
      compliance: { sessionId: '', lastEventId: null },
      codes: { sessionId: '', lastEventId: null },
      collaboration: { sessionId: '', lastEventId: null },
    };
  };
  const cleanupActiveStreams = () => {
    const subscriptions = activeStreamsRef.current?.subscriptions;
    if (subscriptions) {
      Object.values(subscriptions).forEach((sub) => {
        try {
          sub?.close?.();
        } catch (err) {
          /* ignore */
        }
      });
    }
    activeStreamsRef.current = { sessionKey: null, subscriptions: {} };
    resetStreamSessions();
  };
  const touchStreamMetadata = (name, payload) => {
    const target = streamSessionsRef.current?.[name];
    if (!target) return;
    if (payload?.event === 'connected') {
      if (payload.sessionId) target.sessionId = String(payload.sessionId);
      else if (payload.session_id)
        target.sessionId = String(payload.session_id);
    }
    if (typeof payload?.eventId === 'number')
      target.lastEventId = payload.eventId;
    else if (typeof payload?.event_id === 'number')
      target.lastEventId = payload.event_id;
  };
  const formatSpeakerLabel = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (!normalized) return 'Provider';
    if (normalized.includes('patient')) return 'Patient';
    if (normalized.includes('scribe')) return 'Scribe';
    if (normalized.includes('nurse')) return 'Nurse';
    if (normalized.includes('assistant')) return 'Assistant';
    return 'Provider';
  };
  const resolveSpeakerKey = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (normalized.includes('patient')) return 'patient';
    return 'provider';
  };
  const normaliseCollaborator = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      return { id: trimmed, name: trimmed };
    }
    if (typeof entry !== 'object') return null;
    const idValue =
      entry.userId ||
      entry.id ||
      entry.user ||
      entry.email ||
      entry.handle ||
      entry.name;
    if (!idValue) return null;
    const nameValue =
      entry.displayName ||
      entry.name ||
      entry.fullName ||
      entry.userId ||
      String(idValue);
    const colour = entry.color || entry.colour || entry.presenceColor || '';
    return {
      id: String(idValue),
      name: String(nameValue),
      role: entry.role || entry.title || '',
      color: colour ? String(colour) : '',
    };
  };
  const [streamingCodes, setStreamingCodes] = useState([]);
  const [streamingCompliance, setStreamingCompliance] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [collaborationConflicts, setCollaborationConflicts] = useState([]);
  const [collaborationStatus, setCollaborationStatus] = useState('');
  const streamSessionsRef = useRef({
    transcription: { sessionId: '', lastEventId: null },
    compliance: { sessionId: '', lastEventId: null },
    codes: { sessionId: '', lastEventId: null },
    collaboration: { sessionId: '', lastEventId: null },
  });
  const activeStreamsRef = useRef({ sessionKey: null, subscriptions: {} });
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
  const combinedSuggestions = useMemo(() => {
    const base = suggestions || {};
    const arrayOrEmpty = (value) => (Array.isArray(value) ? value : []);
    const uniqueBy = (primary, secondary, keyFn) => {
      const map = new Map();
      primary.forEach((item) => {
        const key = keyFn(item);
        if (!key) return;
        map.set(key, item);
      });
      secondary.forEach((item) => {
        const key = keyFn(item);
        if (!key || map.has(key)) return;
        map.set(key, item);
      });
      return Array.from(map.values());
    };
    const codeKey = (item) => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      if (typeof item === 'object') {
        return (
          item.id ||
          item.code ||
          item.text ||
          item.rationale ||
          item.message ||
          JSON.stringify(item)
        );
      }
      return String(item);
    };
    const complianceKey = (item) => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      if (typeof item === 'object') {
        return (
          item.id ||
          item.text ||
          item.message ||
          item.summary ||
          item.description ||
          JSON.stringify(item)
        );
      }
      return String(item);
    };
    const mergedCodes = uniqueBy(
      streamingCodes,
      arrayOrEmpty(base.codes),
      codeKey,
    );
    const mergedCompliance = uniqueBy(
      streamingCompliance,
      arrayOrEmpty(base.compliance),
      complianceKey,
    );
    return {
      ...base,
      codes: mergedCodes,
      compliance: mergedCompliance,
    };
  }, [suggestions, streamingCodes, streamingCompliance]);

  const quillRef = useRef(null);
  const textAreaRef = useRef(null);
  const audioRef = useRef(null);
  const sanitizedId = id || 'note';
  const patientFieldId = `${sanitizedId}-patient-id`;
  const encounterFieldId = `${sanitizedId}-encounter-id`;

  const handleEncounterInputChange = (event) => {
    setEncounterInput(event.target.value);
  };

  useEffect(() => {
    onPatientIdChangeRef.current = onPatientIdChange;
  }, [onPatientIdChange]);
  useEffect(() => {
    onEncounterChangeRef.current = onEncounterChange;
  }, [onEncounterChange]);
  useEffect(() => {
    onSpecialtyChangeRef.current = onSpecialtyChange;
  }, [onSpecialtyChange]);
  useEffect(() => {
    onPayerChangeRef.current = onPayerChange;
  }, [onPayerChange]);

  useEffect(
    () => () => {
      if (patientSuggestionHideRef.current) {
        clearTimeout(patientSuggestionHideRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (mode === 'draft') setLocalValue(value || '');
  }, [value, mode]);

  useEffect(() => {
    const normalized = patientId ? String(patientId) : '';
    if (normalized === selectedPatientId) return;
    setSelectedPatient(null);
    setSelectedPatientId(normalized);
    setPatientInput(normalized);
    setEncounterInput('');
    setValidatedEncounter(null);
    setEncounterStatus({ state: 'idle', message: '', details: null });
    emittedEncounterRef.current = '';
  }, [patientId, selectedPatientId]);

  useEffect(() => {
    const normalized = encounterId ? String(encounterId) : '';
    const prevNormalized = prevEncounterPropRef.current
      ? String(prevEncounterPropRef.current)
      : '';
    if (normalized === prevNormalized) return;
    prevEncounterPropRef.current = normalized;
    setEncounterInput(normalized);
    setValidatedEncounter(null);
    setEncounterStatus({ state: 'idle', message: '', details: null });
    if (!normalized) emittedEncounterRef.current = '';
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
      const hydratedSegments = Array.isArray(data.segments)
        ? data.segments.map((seg) => {
            const speakerRaw =
              seg?.speaker ||
              seg?.speakerLabel ||
              seg?.role ||
              seg?.participant ||
              '';
            const text = seg?.text || seg?.transcript || '';
            return {
              ...seg,
              speaker: formatSpeakerLabel(speakerRaw),
              speakerKey: resolveSpeakerKey(speakerRaw),
              text,
              isInterim: Boolean(seg?.isInterim),
            };
          })
        : [];
      setSegments(hydratedSegments);
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

  useEffect(() => {
    const term = (patientInput || '').trim();
    if (selectingPatientRef.current) {
      selectingPatientRef.current = false;
      setPatientLookupStatus('idle');
      setPatientSuggestions([]);
      setShowPatientSuggestions(false);
      return;
    }
    if (!term) {
      setPatientSuggestions([]);
      setPatientLookupStatus('idle');
      if (!patientFocusedRef.current) setShowPatientSuggestions(false);
      return;
    }
    if (term.length < 2) {
      setPatientSuggestions([]);
      setPatientLookupStatus('short');
      if (patientFocusedRef.current) setShowPatientSuggestions(true);
      return;
    }
    let active = true;
    setPatientLookupStatus('loading');
    if (patientFocusedRef.current) setShowPatientSuggestions(true);
    searchPatients(term, { limit: 10 })
      .then((data) => {
        if (!active) return;
        const combined = [
          ...(Array.isArray(data?.patients) ? data.patients : []),
          ...(Array.isArray(data?.externalPatients)
            ? data.externalPatients
            : []),
        ];
        setPatientSuggestions(combined);
        setPatientLookupStatus(combined.length ? 'done' : 'empty');
        if (!patientFocusedRef.current && !combined.length)
          setShowPatientSuggestions(false);
        else if (patientFocusedRef.current) setShowPatientSuggestions(true);
      })
      .catch(() => {
        if (!active) return;
        setPatientSuggestions([]);
        setPatientLookupStatus('error');
        if (patientFocusedRef.current) setShowPatientSuggestions(true);
      });
    return () => {
      active = false;
    };
  }, [patientInput]);

  useEffect(() => {
    const encounterCb = onEncounterChangeRef.current;
    const term = (encounterInput || '').trim();
    if (!term) {
      setEncounterStatus({ state: 'idle', message: '', details: null });
      setValidatedEncounter(null);
      if (encounterCb && emittedEncounterRef.current !== '') {
        emittedEncounterRef.current = '';
        encounterCb('');
      }
      return;
    }
    let active = true;
    setEncounterStatus({ state: 'loading', message: '', details: null });
    validateEncounter(term, selectedPatientId || patientId || '', {
      debounceMs: 160,
    })
      .then((result) => {
        if (!active) return;
        const valid = Boolean(result?.valid);
        const message = valid
          ? t('noteEditor.encounterValid')
          : result?.errors && result.errors.length
            ? result.errors[0]
            : t('noteEditor.encounterInvalid');
        setEncounterStatus({
          state: valid ? 'valid' : 'invalid',
          message,
          details: result,
        });
        setValidatedEncounter(result);
        if (encounterCb) {
          const emittedId = valid ? String(result?.encounterId ?? term) : '';
          if (emittedEncounterRef.current !== emittedId) {
            emittedEncounterRef.current = emittedId;
            encounterCb(emittedId, result);
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setValidatedEncounter(null);
        const message =
          err?.name === 'AbortError'
            ? t('noteEditor.encounterError')
            : err?.message || t('noteEditor.encounterError');
        setEncounterStatus({ state: 'error', message, details: null });
        if (encounterCb && emittedEncounterRef.current !== '') {
          emittedEncounterRef.current = '';
          encounterCb('', undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [encounterInput, patientId, selectedPatientId, t]);

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

  const handlePatientFocus = () => {
    patientFocusedRef.current = true;
    if (patientSuggestionHideRef.current) {
      clearTimeout(patientSuggestionHideRef.current);
      patientSuggestionHideRef.current = null;
    }
    if ((patientInput || '').trim()) setShowPatientSuggestions(true);
  };

  const handlePatientBlur = () => {
    if (patientSuggestionHideRef.current) {
      clearTimeout(patientSuggestionHideRef.current);
    }
    patientSuggestionHideRef.current = setTimeout(() => {
      patientFocusedRef.current = false;
      setShowPatientSuggestions(false);
    }, 120);
  };

  const handlePatientInputChange = (event) => {
    const next = event.target.value;
    if (patientSuggestionHideRef.current) {
      clearTimeout(patientSuggestionHideRef.current);
      patientSuggestionHideRef.current = null;
    }
    if (!patientFocusedRef.current) patientFocusedRef.current = true;
    if (selectedPatientId) {
      const label = selectedPatient
        ? describePatient(selectedPatient)
        : selectedPatientId;
      if (next.trim() !== label.trim()) {
        const hadSelection = Boolean(selectedPatientId);
        setSelectedPatient(null);
        setSelectedPatientId('');
        setValidatedEncounter(null);
        setEncounterStatus({ state: 'idle', message: '', details: null });
        if (hadSelection) {
          setEncounterInput('');
          const patientCb = onPatientIdChangeRef.current;
          if (patientCb) patientCb('');
          if (emittedEncounterRef.current !== '') {
            emittedEncounterRef.current = '';
            const encounterCb = onEncounterChangeRef.current;
            if (encounterCb) encounterCb('');
          }
        }
      }
    }
    setPatientInput(next);
    if (next.trim()) {
      setShowPatientSuggestions(true);
    } else {
      setShowPatientSuggestions(false);
      setPatientLookupStatus('idle');
      setPatientSuggestions([]);
    }
  };

  const handlePatientSelect = (patient) => {
    selectingPatientRef.current = true;
    if (patientSuggestionHideRef.current) {
      clearTimeout(patientSuggestionHideRef.current);
      patientSuggestionHideRef.current = null;
    }
    const idValue = patient?.patientId ? String(patient.patientId) : '';
    setSelectedPatient(patient || null);
    setSelectedPatientId(idValue);
    setPatientInput(describePatient(patient) || idValue);
    setPatientSuggestions([]);
    setPatientLookupStatus('idle');
    setShowPatientSuggestions(false);
    const patientCb = onPatientIdChangeRef.current;
    if (patientCb) patientCb(idValue);
    setEncounterInput('');
    setValidatedEncounter(null);
    setEncounterStatus({ state: 'idle', message: '', details: null });
    if (emittedEncounterRef.current !== '') {
      emittedEncounterRef.current = '';
      const encounterCb = onEncounterChangeRef.current;
      if (encounterCb) encounterCb('');
    }
  };

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
    if (!session?.sessionId || session.status === 'completed') return;
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
          t('noteEditor.visitSessionError') || 'Failed to update visit session',
        );
      }
    }
  };

  const completeVisitSession = async (reason = 'finalize') => {
    const session = sessionStateRef.current;
    if (!session?.sessionId || session.status === 'completed') return;
    try {
      const res = await updateVisitSession({
        sessionId: session.sessionId,
        action: 'stop',
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
        sessionStateRef.current.status === 'active'
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
      current.status === 'active'
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
          status: res.status || 'active',
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
          t('noteEditor.visitSessionError') || 'Failed to start visit session',
        );
        sessionKeyRef.current = '';
      });
    return () => {
      cancelled = true;
    };
  }, [patientInput, encounterInput, mode, t]);

  useEffect(() => {
    const sessionId = visitSession?.sessionId
      ? String(visitSession.sessionId)
      : '';
    if (!sessionId) {
      cleanupActiveStreams();
      setStreamingCodes([]);
      setStreamingCompliance([]);
      setCollaborators([]);
      setCollaborationConflicts([]);
      setCollaborationStatus('');
      return () => {};
    }
    if (activeStreamsRef.current.sessionKey === sessionId) {
      return () => {};
    }
    cleanupActiveStreams();
    setStreamingCodes([]);
    setStreamingCompliance([]);
    setCollaborators([]);
    setCollaborationConflicts([]);
    setCollaborationStatus('');
    activeStreamsRef.current.sessionKey = sessionId;
    const baseParams = {
      visit_session_id: sessionId,
      encounter_id: visitSession?.encounterId || '',
      patient_id:
        visitSession?.patientId ||
        selectedPatientId ||
        patientInput ||
        patientId ||
        '',
    };
    const subscriptions = {};
    const dynamicParamsFor = (key) => () => {
      const meta = streamSessionsRef.current?.[key];
      if (!meta) return {};
      const result = {};
      if (meta.sessionId) result.session_id = meta.sessionId;
      if (meta.lastEventId) result.last_event_id = meta.lastEventId;
      return result;
    };
    const handleTranscription = (payload) => {
      if (!payload) return;
      touchStreamMetadata('transcription', payload);
      if (payload.event === 'connected') return;
      const text =
        payload.transcript ||
        payload.text ||
        payload.message ||
        payload.partial ||
        '';
      if (!text) return;
      const speakerRaw =
        payload.speakerLabel ||
        payload.speaker ||
        payload.role ||
        payload.participant ||
        '';
      const speakerKey = resolveSpeakerKey(speakerRaw);
      const speakerLabel = formatSpeakerLabel(speakerRaw);
      setCurrentSpeaker(speakerKey);
      setSegments((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        if (payload.isInterim) {
          const idx = list.findIndex(
            (item) =>
              item?.isInterim &&
              (item.speakerKey === speakerKey ||
                (item.speaker || '').toLowerCase() ===
                  speakerLabel.toLowerCase()),
          );
          const interimEntry = {
            speaker: speakerLabel,
            speakerKey,
            text,
            isInterim: true,
            timestamp: payload.timestamp || Date.now(),
            eventId: payload.eventId,
          };
          if (idx >= 0) list[idx] = interimEntry;
          else list.push(interimEntry);
          return list.slice(-50);
        }
        const filtered = list.filter(
          (item) =>
            !(
              item?.isInterim &&
              (item.speakerKey === speakerKey ||
                (item.speaker || '').toLowerCase() ===
                  speakerLabel.toLowerCase())
            ),
        );
        filtered.push({
          speaker: speakerLabel,
          speakerKey,
          text,
          isInterim: false,
          timestamp: payload.timestamp || Date.now(),
          eventId: payload.eventId,
        });
        return filtered.slice(-50);
      });
      if (!payload.isInterim) {
        setTranscript((prev) => {
          const key = speakerKey === 'patient' ? 'patient' : 'provider';
          const existing = prev?.[key] ? String(prev[key]) : '';
          const trimmed = existing.trim();
          const joined = trimmed ? `${trimmed}\n${text}` : text;
          return { ...prev, [key]: joined };
        });
      }
    };
    const pushComplianceItems = (items) => {
      if (!Array.isArray(items) || !items.length) return;
      setStreamingCompliance((prev) => {
        const map = new Map(
          (Array.isArray(prev) ? prev : []).map((entry) => [
            entry.id || entry.text,
            entry,
          ]),
        );
        items.forEach((entry) => {
          if (!entry) return;
          map.set(entry.id || entry.text, entry);
        });
        return Array.from(map.values()).slice(-50);
      });
    };
    const handleCompliance = (payload) => {
      if (!payload) return;
      touchStreamMetadata('compliance', payload);
      if (payload.event === 'connected') return;
      const timestamp = payload.timestamp || Date.now();
      if (Array.isArray(payload.alerts) && payload.alerts.length) {
        const alerts = payload.alerts
          .map((alert, index) => {
            if (!alert) return null;
            if (typeof alert === 'string') {
              const trimmed = alert.trim();
              if (!trimmed) return null;
              return {
                id: `${payload.eventId ?? payload.timestamp ?? 'alert'}-${index}`,
                text: trimmed,
                severity: (payload.severity || 'info').toString().toLowerCase(),
                live: true,
                timestamp,
              };
            }
            const text =
              alert.text || alert.message || alert.reasoning || alert.summary || '';
            const trimmed = text ? String(text).trim() : '';
            if (!trimmed) return null;
            const severitySource =
              alert.priority || alert.severity || alert.category || payload.severity || 'info';
            return {
              id: `${payload.eventId ?? payload.timestamp ?? 'alert'}-${index}`,
              text: trimmed,
              severity: String(severitySource || 'info').toLowerCase(),
              reasoning: alert.reasoning,
              live: true,
              timestamp,
            };
          })
          .filter(Boolean);
        pushComplianceItems(alerts);
        return;
      }
      if (Array.isArray(payload.messages) && payload.messages.length) {
        const suggestions = payload.messages
          .map((message, index) => {
            const text =
              typeof message === 'string' ? message : String(message ?? '').trim();
            const trimmed = text.trim();
            if (!trimmed) return null;
            return {
              id: `${payload.eventId ?? payload.timestamp ?? 'compliance'}-${index}`,
              text: trimmed,
              severity: String(payload.severity || 'info').toLowerCase(),
              live: true,
              timestamp,
            };
          })
          .filter(Boolean);
        pushComplianceItems(suggestions);
        return;
      }
      const items = [];
      if (Array.isArray(payload.issues) && payload.issues.length) {
        payload.issues.forEach((issue, index) => {
          if (!issue) return;
          const message =
            typeof issue === 'string'
              ? issue
              : issue.message ||
                issue.summary ||
                issue.description ||
                issue.code;
          if (!message) return;
          items.push({
            id: `${
              payload.eventId ??
              payload.analysisId ??
              payload.timestamp ??
              'issue'
            }-${index}`,
            text: message,
            severity: issue.severity || payload.severity || 'info',
            live: true,
            timestamp,
          });
        });
      } else {
        const message = payload.message || payload.description || '';
        if (message) {
          items.push({
            id: String(
              payload.eventId ??
                payload.analysisId ??
                payload.timestamp ??
                message,
            ),
            text: message,
            severity: payload.severity || 'info',
            live: true,
            timestamp,
          });
        }
      }
      pushComplianceItems(items);
    };
    const pushCodeItems = (items) => {
      if (!Array.isArray(items) || !items.length) return;
      setStreamingCodes((prev) => {
        const map = new Map(
          (Array.isArray(prev) ? prev : []).map((item) => [
            item.id || item.code || item.rationale,
            item,
          ]),
        );
        items.forEach((entry) => {
          if (!entry) return;
          map.set(entry.id || entry.code || entry.rationale, entry);
        });
        return Array.from(map.values()).slice(-50);
      });
    };
    const handleCodes = (payload) => {
      if (!payload) return;
      touchStreamMetadata('codes', payload);
      if (payload.event === 'connected') return;
      if (Array.isArray(payload.codes) && payload.codes.length) {
        const timestamp = payload.timestamp || Date.now();
        const aggregated = payload.codes
          .map((entry, index) => {
            if (!entry) return null;
            const codeValue = entry.code || entry.Code || entry.codeValue;
            const rationaleValue =
              entry.rationale || entry.reason || entry.description || '';
            if (!codeValue && !rationaleValue) return null;
            const confidenceValue =
              typeof entry.confidence === 'number'
                ? entry.confidence
                : typeof entry.score === 'number'
                  ? entry.score
                  : undefined;
            return {
              id: `${payload.eventId ?? payload.timestamp ?? 'codes'}-${index}`,
              code: codeValue ? String(codeValue) : '',
              rationale: rationaleValue ? String(rationaleValue) : '',
              type: payload.type || 'suggestions',
              confidence: confidenceValue,
              live: true,
              timestamp,
            };
          })
          .filter(Boolean);
        pushCodeItems(aggregated);
        return;
      }
      const codeValue =
        payload.code ||
        payload.codeValue ||
        payload.code_id ||
        payload.icd ||
        payload.cpt ||
        '';
      const rationale =
        payload.rationale ||
        payload.description ||
        payload.details ||
        payload.message ||
        '';
      if (!codeValue && !rationale) return;
      const entry = {
        id: String(payload.eventId ?? codeValue ?? rationale ?? Date.now()),
        code: codeValue ? String(codeValue) : '',
        rationale: rationale ? String(rationale) : '',
        type: payload.type || '',
        confidence: payload.confidence,
        live: true,
        timestamp: payload.timestamp || Date.now(),
      };
      pushCodeItems([entry]);
    };
    const handleCollaboration = (payload) => {
      if (!payload) return;
      touchStreamMetadata('collaboration', payload);
      if (payload.event === 'connected') return;
      if (
        payload.event === 'collaboration_clear' ||
        payload.presence === 'clear'
      ) {
        setCollaborators([]);
      }
      const participants =
        payload.participants || payload.users || payload.presence;
      if (Array.isArray(participants)) {
        const normalised = participants
          .map((entry) => normaliseCollaborator(entry))
          .filter(Boolean);
        if (normalised.length) {
          setCollaborators(normalised);
        }
      } else if (payload.userId || payload.user || payload.name) {
        const participant = normaliseCollaborator(payload);
        if (participant) {
          setCollaborators((prev) => {
            const map = new Map((prev || []).map((item) => [item.id, item]));
            map.set(participant.id, participant);
            return Array.from(map.values());
          });
        }
      }
      if (
        payload.event === 'collaboration_left' &&
        (payload.userId || payload.user)
      ) {
        const departing = String(payload.userId || payload.user);
        setCollaborators((prev) =>
          prev.filter((person) => person.id !== departing),
        );
      }
      if (payload.conflicts !== undefined) {
        const list = Array.isArray(payload.conflicts)
          ? payload.conflicts
          : payload.conflicts
            ? [payload.conflicts]
            : [];
        setCollaborationConflicts(list.filter(Boolean));
      } else if (
        payload.event === 'collaboration_resolved' ||
        payload.event === 'collaboration_sync'
      ) {
        setCollaborationConflicts([]);
      }
      if (payload.status) {
        setCollaborationStatus(String(payload.status));
      }
    };
    subscriptions.transcription = connectTranscriptionStream({
      params: baseParams,
      getParams: dynamicParamsFor('transcription'),
      onEvent: handleTranscription,
    });
    subscriptions.compliance = connectComplianceStream({
      params: baseParams,
      getParams: dynamicParamsFor('compliance'),
      onEvent: handleCompliance,
    });
    subscriptions.codes = connectCodesStream({
      params: baseParams,
      getParams: dynamicParamsFor('codes'),
      onEvent: handleCodes,
    });
    subscriptions.collaboration = connectCollaborationStream({
      params: baseParams,
      noteId: id || '',
      getParams: dynamicParamsFor('collaboration'),
      onEvent: handleCollaboration,
    });
    activeStreamsRef.current.subscriptions = subscriptions;
    return () => {
      Object.values(subscriptions).forEach((sub) => {
        try {
          sub?.close?.();
        } catch (err) {
          /* ignore */
        }
      });
      resetStreamSessions();
      activeStreamsRef.current = { sessionKey: null, subscriptions: {} };
    };
  }, [
    visitSession?.sessionId,
    visitSession?.encounterId,
    visitSession?.patientId,
    patientInput,
    selectedPatientId,
    patientId,
    id,
  ]);

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
    if (!session.endTime && session.status !== 'completed') {
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
      cleanupActiveStreams();
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
    ? visitSession.status === 'completed'
      ? t('noteEditor.visitSessionComplete')
      : visitSession.status === 'pause'
        ? t('noteEditor.visitSessionPaused')
        : t('noteEditor.visitSessionActive')
    : '';

  const collaboratorPresence =
    collaborators.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {t('noteEditor.collaborators', 'Collaborators')}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {collaborators.map((person) => {
            const initials = person.name
              ? person.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              : '?';
            return (
              <span
                key={person.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '999px',
                  backgroundColor: '#eef2ff',
                  color: '#1f2937',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '999px',
                    backgroundColor: person.color || '#4f46e5',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                  }}
                >
                  {initials}
                </span>
                <span>{person.name}</span>
                {person.role ? (
                  <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                    {person.role}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        {collaborationStatus ? (
          <span
            style={{
              marginLeft: 'auto',
              color: '#4b5563',
              fontSize: '0.85rem',
            }}
          >
            {t('noteEditor.collaborationStatus', {
              defaultValue: 'Status: {{status}}',
              status: collaborationStatus,
            })}
          </span>
        ) : null}
      </div>
    ) : null;

  const collaborationConflictBanner =
    collaborationConflicts.length > 0 ? (
      <div
        role="status"
        style={{
          background: '#fff3cd',
          border: '1px solid #ffeeba',
          borderRadius: '4px',
          padding: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <strong>
          {t('noteEditor.collaborationConflict', 'Collaboration conflict')}
        </strong>
        <ul
          style={{
            marginTop: '0.5rem',
            marginBottom: 0,
            paddingLeft: '1.25rem',
          }}
        >
          {collaborationConflicts.map((conflict, idx) => {
            const text =
              typeof conflict === 'string'
                ? conflict
                : conflict?.message || conflict?.text || conflict?.description;
            return (
              <li key={idx}>
                {text ||
                  t('noteEditor.collaborationUnknown', 'An issue occurred')}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

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
      <label
        htmlFor={patientFieldId}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <span style={{ fontWeight: 600 }}>
          {t('noteEditor.patientIdLabel')}
        </span>
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
        <span style={{ fontWeight: 600 }}>
          {t('noteEditor.encounterIdLabel')}
        </span>
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
                  currentSpeaker &&
                  (s.speakerKey ? currentSpeaker === s.speakerKey : false)
                    ? '#fff3cd'
                    : undefined,
                fontStyle: s.isInterim ? 'italic' : 'normal',
              }}
            >
              <strong>{s.speaker}:</strong> {s.text}
              {s.isInterim ? (
                <span style={{ marginLeft: '0.5rem', color: '#555' }}>
                  {t('noteEditor.liveInterim', 'live')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  // Templates dropdown visibility state (rendered above the editor)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const patientSuggestionListId =
    (id ? `${id}-patient-suggestions` : 'note-patient-suggestions') + '-menu';
  const encounterStatusColor =
    encounterStatus.state === 'valid'
      ? '#2f6b2f'
      : encounterStatus.state === 'loading'
        ? '#555'
        : encounterStatus.state === 'idle'
          ? '#555'
          : '#b03030';

  const metadataBar = (
    <div
      style={{
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ position: 'relative' }}>
        <label
          htmlFor={`${id || 'note'}-patient-field`}
          style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}
        >
          {t('noteEditor.patientLabel')}
        </label>
        <input
          id={`${id || 'note'}-patient-field`}
          type="text"
          value={patientInput}
          onChange={handlePatientInputChange}
          onFocus={handlePatientFocus}
          onBlur={handlePatientBlur}
          placeholder={t('noteEditor.patientSearchPlaceholder')}
          aria-autocomplete="list"
          aria-controls={patientSuggestionListId}
          aria-expanded={showPatientSuggestions}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <small
          style={{ display: 'block', marginTop: '0.25rem', color: '#555' }}
        >
          {t('noteEditor.patientLookupHint')}
        </small>
        {selectedPatientId && (
          <small
            style={{ display: 'block', marginTop: '0.25rem', color: '#2f6b2f' }}
          >
            {t('noteEditor.patientSelected', {
              name: selectedPatient?.name || selectedPatientId,
              id: selectedPatientId,
            })}
          </small>
        )}
        {showPatientSuggestions && (
          <div
            id={patientSuggestionListId}
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: '220px',
              overflowY: 'auto',
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 8px 18px rgba(0,0,0,0.12)',
              zIndex: 40,
            }}
          >
            {patientLookupStatus === 'loading' && (
              <div style={{ padding: '0.5rem', color: '#555' }}>
                {t('noteEditor.patientLookupLoading')}
              </div>
            )}
            {patientLookupStatus === 'short' && (
              <div style={{ padding: '0.5rem', color: '#555' }}>
                {t('noteEditor.patientLookupShort')}
              </div>
            )}
            {patientLookupStatus === 'error' && (
              <div style={{ padding: '0.5rem', color: '#b03030' }}>
                {t('noteEditor.patientLookupError')}
              </div>
            )}
            {patientLookupStatus === 'empty' && (
              <div style={{ padding: '0.5rem', color: '#555' }}>
                {t('noteEditor.patientLookupEmpty')}
              </div>
            )}
            {patientLookupStatus === 'done' &&
              patientSuggestions.map((patient, idx) => {
                const key = `${patient?.patientId || 'ext'}-${idx}`;
                const primary = describePatient(patient);
                const secondaryParts = [];
                if (patient?.dob) secondaryParts.push(patient.dob);
                if (patient?.insurance) secondaryParts.push(patient.insurance);
                const secondary = secondaryParts.join(' · ');
                return (
                  <button
                    type="button"
                    key={key}
                    role="option"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => handlePatientSelect(patient)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{primary}</div>
                    {secondary && (
                      <div style={{ fontSize: '0.75rem', color: '#555' }}>
                        {secondary}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>
      <div>
        <label
          htmlFor={`${id || 'note'}-encounter-field`}
          style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}
        >
          {t('noteEditor.encounterLabel')}
        </label>
        <input
          id={`${id || 'note'}-encounter-field`}
          type="text"
          value={encounterInput}
          onChange={(e) => {
            const val = e.target.value;
            setEncounterInput(val);
            if (!val.trim()) {
              setEncounterStatus({ state: 'idle', message: '', details: null });
              setValidatedEncounter(null);
              if (emittedEncounterRef.current !== '') {
                emittedEncounterRef.current = '';
                const encounterCb = onEncounterChangeRef.current;
                if (encounterCb) encounterCb('');
              }
            }
          }}
          placeholder={t('noteEditor.encounterPlaceholder')}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <small
          style={{ display: 'block', marginTop: '0.25rem', color: '#555' }}
        >
          {t('noteEditor.encounterHint')}
        </small>
        {encounterStatus.message && (
          <small
            style={{
              display: 'block',
              marginTop: '0.25rem',
              color: encounterStatusColor,
            }}
          >
            {encounterStatus.state === 'loading'
              ? t('noteEditor.encounterChecking')
              : encounterStatus.message}
          </small>
        )}
      </div>
      <div>
        <label
          htmlFor={`${id || 'note'}-specialty-field`}
          style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}
        >
          {t('settings.specialty')}
        </label>
        <input
          id={`${id || 'note'}-specialty-field`}
          type="text"
          value={specialty || ''}
          onChange={(e) => {
            if (onSpecialtyChangeRef.current) {
              onSpecialtyChangeRef.current(e.target.value);
            }
          }}
          placeholder={t('noteEditor.specialtyPlaceholder')}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
      </div>
      <div>
        <label
          htmlFor={`${id || 'note'}-payer-field`}
          style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}
        >
          {t('settings.payer')}
        </label>
        <input
          id={`${id || 'note'}-payer-field`}
          type="text"
          value={payer || ''}
          onChange={(e) => {
            if (onPayerChangeRef.current) {
              onPayerChangeRef.current(e.target.value);
            }
          }}
          placeholder={t('noteEditor.payerPlaceholder')}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <small
          style={{ display: 'block', marginTop: '0.25rem', color: '#555' }}
        >
          {t('noteEditor.payerHint')}
        </small>
      </div>
    </div>
  );

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
    if (suggestionDebounceRef.current)
      clearTimeout(suggestionDebounceRef.current);
    suggestionDebounceRef.current = setTimeout(() => {
      setSuggestLoading(true);
      getSuggestions(value || '', buildSuggestionContext())
        .then((res) => setSuggestions(res))
        .catch(() => setSuggestions(null))
        .finally(() => setSuggestLoading(false));
    }, 400);
    return () => clearTimeout(suggestionDebounceRef.current);
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
    const exportPatientId =
      selectedPatientId || patientId || patientInput || '';
    const exportEncounterId = (() => {
      if (validatedEncounter?.encounterId || validatedEncounter?.encounter_id)
        return String(
          validatedEncounter.encounterId ?? validatedEncounter.encounter_id,
        );
      if (encounterInput) return encounterInput;
      if (encounterId) return String(encounterId);
      return '';
    })();
    const res = await exportToEhr(
      value,
      codeValues,
      exportPatientId,
      exportEncounterId,
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
          {metadataBar}
          {visitSessionControls}
          {collaboratorPresence}
          {collaborationConflictBanner}

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
                  combinedSuggestions || {
                    codes: [],
                    compliance: [],
                    publicHealth: [],
                    differentials: [],
                  }
                }
                loading={
                  suggestLoading &&
                  !streamingCodes.length &&
                  !streamingCompliance.length
                }
                settingsState={settingsState}
                text={value}
                fetchSuggestions={runSuggestionFetch}
                gateSuggestions={runSuggestionGate}
                onSpecialtyChange={onSpecialtyChange}
                onPayerChange={onPayerChange}
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
        {metadataBar}
        {visitSessionControls}
        {collaboratorPresence}
        {collaborationConflictBanner}
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
          settingsState={settingsState}
          /* Provide text so internal debounce logic may run if needed */
          text={localValue}
          fetchSuggestions={runSuggestionFetch}
          gateSuggestions={runSuggestionGate}
          onSpecialtyChange={onSpecialtyChange}
          onPayerChange={onPayerChange}
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
