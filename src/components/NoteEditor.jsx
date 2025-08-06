// A rich text editor component for clinical notes.
//
// This component wraps the ReactQuill editor from the `react-quill` package.
// When the package is installed (via `npm install react-quill`), it will
// render a full-featured WYSIWYG editor that produces HTML as its value.  If
// ReactQuill fails to import (e.g. before packages are installed), the
// component will gracefully fall back to a simple <textarea> so that
// development can proceed without breaking the UI.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLastTranscript } from '../api.js';
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

function NoteEditor({
  id,
  value,
  onChange,
  onRecord,
  recording = false,
  transcribing = false,
  onTranscriptChange,
  error = '',
}) {
  const { t } = useTranslation();
  // Maintain a local state for the editor's HTML value when using the
  // fallback <textarea>.  This allows the component to behave as a
  // controlled input in both modes.
  const [localValue, setLocalValue] = useState(value || '');
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');

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

  useEffect(() => {
    if (!transcribing) {
      loadTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcribing]);

  const audioControls = (
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

  // Render the rich text editor if available; otherwise render a textarea.
  if (ReactQuill) {
    return (
      <>
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {audioControls}
          <ReactQuill
            id={id}
            theme="snow"
            value={value}
            modules={quillModules}
            formats={quillFormats}
            // ReactQuill's onChange passes the new HTML string as the first
            // argument.  We ignore the other args (delta, source, editor) and
            // forward the HTML string to the parent onChange.
            onChange={(content) => onChange(content)}
            style={{ flex: 1 }}
          />
        </div>
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
        {(error || fetchError) && (
          <p style={{ color: 'red' }}>{error || fetchError}</p>
        )}
        {loadingTranscript && <p>Loading transcript...</p>}
      </>
    );
  }
  return (
    <>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {audioControls}
        <textarea
          id={id}
          value={localValue}
          onChange={handleTextAreaChange}
          style={{ width: '100%', flex: 1, padding: '0.5rem' }}
          placeholder={t('noteEditor.placeholder')}
        />
      </div>
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
      {(error || fetchError) && (
        <p style={{ color: 'red' }}>{error || fetchError}</p>
      )}
      {loadingTranscript && <p>Loading transcript...</p>}
    </>
  );
}

export default NoteEditor;
