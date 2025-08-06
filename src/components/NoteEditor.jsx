// A rich text editor component for clinical notes.
//
// This component wraps the ReactQuill editor from the `react-quill` package.
// When the package is installed (via `npm install react-quill`), it will
// render a full-featured WYSIWYG editor that produces HTML as its value.  If
// ReactQuill fails to import (e.g. before packages are installed), the
// component will gracefully fall back to a simple <textarea> so that
// development can proceed without breaking the UI.

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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

// Formats allowed in the editor.  These correspond to the buttons rendered in
// ``QuillToolbar`` below.
const quillFormats = ['header', 'bold', 'italic', 'underline', 'list', 'bullet'];

// Custom toolbar markup so we can provide accessible labels for the icons.
// Quill will hook into this container via the ``modules.toolbar`` option.
function QuillToolbar({ toolbarId }) {
  return (
    <div id={toolbarId} className="ql-toolbar ql-snow">
      <span className="ql-formats">
        <select className="ql-header" defaultValue="" aria-label="Heading">
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="">Normal</option>
        </select>
        <button className="ql-bold" aria-label="Bold" />
        <button className="ql-italic" aria-label="Italic" />
        <button className="ql-underline" aria-label="Underline" />
        <button className="ql-list" value="ordered" aria-label="Ordered List" />
        <button className="ql-list" value="bullet" aria-label="Bullet List" />
      </span>
    </div>
  );
}

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
  onTranscriptChange,
}) {
  const { t } = useTranslation();
  // Maintain a local state for the editor's HTML value when using the
  // fallback <textarea>.  This allows the component to behave as a
  // controlled input in both modes.
  const [localValue, setLocalValue] = useState(value || '');
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const {
    recording,
    transcribing,
    error: recorderError,
    toggleRecording,
  } = useAudioRecorder((data) => {
    setTranscript(data);
    if (onTranscriptChange) {
      onTranscriptChange(data);
    }
  });

  // Keep the internal state in sync with the parent value.  When using
  // ReactQuill the parent `value` prop is passed directly, so this
  // effect only runs for the fallback <textarea> case.
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

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
    loadTranscript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioControls = (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        onClick={toggleRecording}
        aria-label={recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
      >
        {recording ? t('noteEditor.stopRecording') : t('noteEditor.recordAudio')}
      </button>
      {recording && <span style={{ marginLeft: '0.5rem' }}>Recording...</span>}
      {transcribing && <span style={{ marginLeft: '0.5rem' }}>Transcribing...</span>}
    </div>
  );

  // Render the rich text editor if available; otherwise render a textarea.
  if (ReactQuill) {
    const toolbarId = `${id || 'editor'}-toolbar`;
    const modules = { toolbar: { container: `#${toolbarId}` } };
    return (
      <div style={{ height: '100%', width: '100%' }}>
        {audioControls}
        <QuillToolbar toolbarId={toolbarId} />
        <ReactQuill
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
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%' }}>
      {audioControls}
      <textarea
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

export default NoteEditor;
