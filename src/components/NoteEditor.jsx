// A rich text editor component for clinical notes.
// This component wraps the ReactQuill editor from the `react-quill` package.
// When the package is installed, it renders a full-featured editor; otherwise
// it falls back to a simple textarea. Audio recording is provided via the
// `useRecorder` hook.

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
} from '../api.js';
import useRecorder from '../hooks/useRecorder.js';

let ReactQuill;
try {
  // eslint-disable-next-line global-require
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
  'code-block',
];

const quillModules = {
  toolbar: [
    [{ header: [1, 2, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['code-block'],
  ],
};

function NoteEditor(
  {
    id,
    value,
    onChange,
    onTranscriptChange,
    mode = 'draft',
  },
  ref,
) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value || '');
  const [history, setHistory] = useState(value ? [value] : []);
  const [historyIndex, setHistoryIndex] = useState(value ? 0 : -1);
  const [templates, setTemplates] = useState([]);
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  const quillRef = useRef(null);
  const textAreaRef = useRef(null);

  const {
    startRecording,
    stopRecording,
    audioBlob,
    recording,
    error: recorderError,
  } = useRecorder();

  useEffect(() => {
    if (mode === 'draft') {
      setLocalValue(value || '');
    }
  }, [value, mode]);

  useEffect(() => {
    if (mode !== 'beautified') return;
    setHistory((prev) => {
      const current = historyIndex >= 0 ? prev[historyIndex] : undefined;
      if (current === value) return prev;
      const base = prev.slice(0, historyIndex + 1);
      const appended = [...base, value];
      const newHist = appended.slice(-5);
      setHistoryIndex(newHist.length - 1);
      return newHist;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode]);

  useEffect(() => {
    getTemplates()
      .then((tpls) => setTemplates(tpls))
      .catch(() => setTemplates([]));
  }, []);

  const loadTranscript = async () => {
    setLoadingTranscript(true);
    setFetchError('');
    try {
      const data = await fetchLastTranscript();
      setTranscript(data);
      if (onTranscriptChange) onTranscriptChange(data);
    } catch (e) {
      setFetchError('Failed to load transcript');
    } finally {
      setLoadingTranscript(false);
    }
  };

  useEffect(() => {
    if (mode === 'draft') {
      loadTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === 'draft' && !transcribing && audioBlob) {
      loadTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcribing, mode, audioBlob]);

  useEffect(() => {
    if (!audioBlob) return;
    let cancelled = false;
    (async () => {
      setTranscribing(true);
      try {
        const data = await transcribeAudio(audioBlob, true);
        if (!cancelled) {
          setTranscript(data);
          if (onTranscriptChange) onTranscriptChange(data);
        }
      } catch (e) {
        console.error('Transcription failed', e);
      } finally {
        if (!cancelled) setTranscribing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioBlob, onTranscriptChange]);

  const handleTextAreaChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    onChange(newVal);
  };

  const insertAtCursor = (text) => {
    if (ReactQuill && quillRef.current) {
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertText(index, text);
      try {
        quill.setSelection(index + text.length);
      } catch (e) {
        // jsdom does not implement selection bounds; ignore in tests
      }
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

  useImperativeHandle(ref, () => ({ insertAtCursor }));

  const handleTemplateSelect = (e) => {
    const tpl = templates.find((t) => String(t.id) === e.target.value);
    if (tpl) insertAtCursor(tpl.content);
    e.target.value = '';
  };

  const templateChooser =
    templates.length > 0 && (
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          {t('settings.templates')}
          <select aria-label="Templates" onChange={handleTemplateSelect} defaultValue="">
            <option value="" disabled>
              {t('settings.templates')}
            </option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );

  const onRecordClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const audioControls =
    mode === 'draft' && (
      <div style={{ marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={onRecordClick}
          aria-label={recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
        >
          {recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
        </button>
        {recording && <span style={{ marginLeft: '0.5rem' }}>Recording...</span>}
        {transcribing && <span style={{ marginLeft: '0.5rem' }}>Transcribing...</span>}
      </div>
    );

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

  if (mode === 'beautified') {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <button type="button" onClick={handleUndo} disabled={historyIndex <= 0}>
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
          modules={quillModules}
          formats={quillFormats}
          onChange={(content) => onChange(content)}
          style={{ height: '100%', width: '100%' }}
        />
        {(transcript.provider || transcript.patient) && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>{t('noteEditor.transcript')}</strong>
            {transcript.provider && (
              <p>
                <strong>Provider:</strong> {transcript.provider}
              </p>
            )}
            {transcript.patient && (
              <p>
                <strong>Patient:</strong> {transcript.patient}
              </p>
            )}
          </div>
        )}
        {(recorderError || fetchError) && (
          <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
        )}
        {loadingTranscript && <p>Loading transcript...</p>}
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
      {(transcript.provider || transcript.patient) && (
        <div style={{ marginTop: '0.5rem' }}>
          <strong>{t('noteEditor.transcript')}</strong>
          {transcript.provider && (
            <p>
              <strong>Provider:</strong> {transcript.provider}
            </p>
          )}
          {transcript.patient && (
            <p>
              <strong>Patient:</strong> {transcript.patient}
            </p>
          )}
        </div>
      )}
      {(recorderError || fetchError) && (
        <p style={{ color: 'red' }}>{recorderError || fetchError}</p>
      )}
      {loadingTranscript && <p>Loading transcript...</p>}
    </div>
  );
}

export default forwardRef(NoteEditor);
