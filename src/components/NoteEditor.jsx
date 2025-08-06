import {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLastTranscript, getTemplates, transcribeAudio, exportToEhr } from '../api.js';

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
    codes = [],
    patientId = '',
    encounterId = '',
    role = '',
  },
  ref,
) {
  const { t } = useTranslation();
  const isAdmin = role === 'admin';
  const [localValue, setLocalValue] = useState(value || '');
  const [history, setHistory] = useState(value ? [value] : []);
  const [historyIndex, setHistoryIndex] = useState(value ? 0 : -1);
  const [templates, setTemplates] = useState([]);
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [segments, setSegments] = useState([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [ehrFeedback, setEhrFeedback] = useState('');

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

  let mounted = true;
  useEffect(() => {
    getTemplates()
      .then((tpls) => mounted && setTemplates(tpls))
      .catch(() => mounted && setTemplates([]));
    return () => {
      mounted = false;
    };
  }, []);

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
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertText(index, text);
      try {
        quill.setSelection(index + text.length);
      } catch (e) {
        // Ignore selection errors in test environments
      }
      onChange(quill.root.innerHTML);
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

  const handleTemplateSelect = (e) => {
    const tpl = templates.find((t) => String(t.id) === e.target.value);
    if (tpl) insertText(tpl.content);
    e.target.value = '';
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

  const groupedTemplates = templates.reduce((acc, tpl) => {
    const key = tpl.specialty || 'General';
    (acc[key] ||= []).push(tpl);
    return acc;
  }, {});

  const templateChooser = templates.length ? (
    <select
      aria-label={t('app.templates')}
      defaultValue=""
      onChange={handleTemplateSelect}
      style={{ marginBottom: '0.5rem' }}
    >
      <option value="">{t('app.templates')}</option>
      {Object.entries(groupedTemplates).map(([spec, tpls]) => (
        <optgroup key={spec} label={spec}>
          {tpls.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  ) : (
    <select
      aria-label={t('app.templates')}
      disabled
      style={{ marginBottom: '0.5rem' }}
    >
      <option>{t('settings.noTemplates')}</option>
    </select>
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
              // eslint-disable-next-line react/no-array-index-key
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
    try {
      const res = await exportToEhr(
        value,
        codes,
        patientId,
        encounterId,
        true,
      );
      if (res.status === 'exported') {
        setEhrFeedback(t('clipboard.exported'));
      } else if (res.status === 'auth_error') {
        setEhrFeedback(t('ehrAuthFailed'));
      } else {
        setEhrFeedback(t('clipboard.exportFailed'));
      }
    } catch (e) {
      setEhrFeedback(t('clipboard.exportFailed'));
    }
    setTimeout(() => setEhrFeedback(''), 2000);
  };

  if (mode === 'beautified') {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <div style={{ marginBottom: '0.5rem' }}>
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
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleExportEhr}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {t('ehrExport')}
                </button>
                {ehrFeedback && (
                  <span style={{ marginLeft: '0.5rem' }}>{ehrFeedback}</span>
                )}
              </>
            )}
          </div>
        <div className="beautified-view" style={{ whiteSpace: 'pre-wrap' }}>
          {history[historyIndex] || ''}
        </div>
      </div>
    );
  }

  if (ReactQuill) {
    return (
      <div style={{ height: '100%', width: '100%' }}>
        {audioControls}
        {templateChooser}
        <ReactQuill
          ref={quillRef}
          id={id}
          theme="snow"
          value={value}
          formats={quillFormats}
          style={{ height: '100%', width: '100%' }}
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
        {segmentList}
        {transcriptControls}
        {(recorderError || fetchError) && (
          <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
        )}
        {loadingTranscript && <p>{t('noteEditor.loadingTranscript')}</p>}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {audioControls}
      {templateChooser}
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
      {segmentList}
      {transcriptControls}
      {(recorderError || fetchError) && (
        <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
      )}
      {loadingTranscript && <p>{t('noteEditor.loadingTranscript')}</p>}
    </div>
  );
});

export default NoteEditor;
