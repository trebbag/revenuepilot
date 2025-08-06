// A rich text editor component for clinical notes.
//
// This component wraps the ReactQuill editor from the `react-quill` package.
// When the package is installed (via `npm install react-quill`), it will
// render a full-featured WYSIWYG editor that produces HTML as its value.  If
// ReactQuill fails to import (e.g. before packages are installed), the
// component will gracefully fall back to a simple <textarea> so that
// development can proceed without breaking the UI.


import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLastTranscript, getSuggestions } from '../api.js';

import { useEffect, useState, useRef } from 'react';
import { fetchLastTranscript, getTemplates } from '../api.js';
import { fetchLastTranscript, transcribeAudio } from '../api.js';


let ReactQuill;
try {
  // Dynamically require ReactQuill to avoid breaking when the package is
  // missing in this environment.  When running locally after installing
  // dependencies, this will succeed and load the rich text editor.
  // eslint-disable-next-line global-require
  ReactQuill = require('react-quill');
  // Import the default Quill snow theme styles.  Without this import the
  // editor will render without styling.  The CSS file is only loaded
  // when ReactQuill is available.
  require('react-quill/dist/quill.snow.css');
} catch (err) {
  ReactQuill = null;
}

// Formats and modules allowed in the editor. The toolbar provides headings,
// basic formatting, lists and code blocks.
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

function useAudioRecorder(onTranscribed) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setError('Audio recording not supported');
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
          if (onTranscribed) {
            onTranscribed(data);
          }
        } catch (err) {
          console.error('Transcription failed', err);
          setError('Transcription failed');
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Error accessing microphone', err);
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return { recording, transcribing, error, toggleRecording };
}


function NoteEditor({
  id,
  value,
  onChange,
  onRecord,
  recording = false,
  transcribing = false,
  onTranscriptChange,
  error = '',
  mode = 'draft',
}) {


// Naive HTML stripping to extract plain text for the suggestions API.
function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, '') : '';
}

const emptySuggestions = {
  codes: [],
  compliance: [],
  publicHealth: [],
  differentials: [],
  followUp: null,
};

const NoteEditor = forwardRef(function NoteEditor(
  {
    id,
    value,
    onChange,
    onRecord,
    recording = false,
    transcribing = false,
    onTranscriptChange,
    error = '',
    templateContext = '',
    suggestionContext = {},
    onSuggestions = () => {},
    onSuggestionsLoading = () => {},
  },
  ref,
) {


  const { t } = useTranslation();
  // Maintain a local state for the editor's HTML value when using the
  // fallback <textarea>.  This allows the component to behave as a
  // controlled input in both modes.
  const [localValue, setLocalValue] = useState(value || '');
  // History stack for beautified notes (up to 5 entries).
  const [history, setHistory] = useState(value ? [value] : []);
  const [historyIndex, setHistoryIndex] = useState(value ? 0 : -1);
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const quillRef = useRef(null);
  const textAreaRef = useRef(null);


  // Keep the internal state in sync with the parent value.  When using
  // ReactQuill the parent `value` prop is passed directly, so this
  // effect only runs for the fallback <textarea> case.
  useEffect(() => {
    if (mode === 'draft') {
      setLocalValue(value || '');
    }
  }, [value, mode]);

  // Track beautified history when in beautified mode.
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

  // Fetch user-defined templates on mount.
  useEffect(() => {
    let mounted = true;
    getTemplates()
      .then((tpls) => {
        if (mounted) setTemplates(tpls);
      })
      .catch(() => {
        if (mounted) setTemplates([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Handler for changes from the fallback <textarea>.
  const handleTextAreaChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    onChange(newVal);
  };

  const loadTranscript = async () => {
    setLoadingTranscript(true);
    setFetchError('');
    try {
      const data = await fetchLastTranscript();
      setTranscript(data);
      if (onTranscriptChange) {
        onTranscriptChange(data);
      }
    } catch (err) {
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
    if (mode === 'draft' && !transcribing) {
      loadTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [transcribing, mode]);

  const audioControls =
    mode === 'draft' && (
      <div style={{ marginBottom: '0.5rem' }}>
        {onRecord && (
          <button
            type="button"
            onClick={onRecord}
            aria-label={recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
          >
            {recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
          </button>
        )}
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


  // Expose an imperative method so the parent component can insert text at the
  // current cursor position when a suggestion is chosen.
  useImperativeHandle(ref, () => ({
    insertAtCursor: (text) => {
      if (ReactQuill && quillRef.current) {
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        const index = range ? range.index : quill.getLength();
        quill.insertText(index, text);
        quill.setSelection(index + text.length);
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
    },
  }));

  // Render the rich text editor if available; otherwise render a textarea.
  if (ReactQuill) {
    return (

      <div style={{ height: '100%', width: '100%' }}>
        {audioControls}
        {templateChooser}
        <QuillToolbar toolbarId={toolbarId} />
        <ReactQuill
          ref={quillRef}
          id={id}
          theme="snow"
          value={value}
          modules={modules}
          formats={quillFormats}
          // ReactQuill's onChange passes the new HTML string as the first
          // argument.  We ignore the other args (delta, source, editor) and
          // forward the HTML string to the parent onChange.
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
      </>
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
    </>
  );
});

export default NoteEditor;
