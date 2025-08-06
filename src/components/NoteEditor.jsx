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
        {(error || fetchError) && (
          <p style={{ color: 'red' }}>{error || fetchError}</p>
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
      {(error || fetchError) && (
        <p style={{ color: 'red' }}>{error || fetchError}</p>
      )}
      {loadingTranscript && <p>Loading transcript...</p>}
    </div>
  );
}

export default NoteEditor;
