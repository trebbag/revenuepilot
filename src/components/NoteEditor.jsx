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
  const [transcript, setTranscript] = useState({ provider: '', patient: '' });
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const quillRef = useRef(null);
  const textAreaRef = useRef(null);

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

  // Debounced suggestion fetching.  When the note value or template context
  // changes, wait a short period before calling the /suggest endpoint.  This
  // avoids firing a request on every keystroke.
  useEffect(() => {
    const plain = stripHtml(value);
    if (!plain.trim()) {
      onSuggestions(emptySuggestions);
      return;
    }
    onSuggestionsLoading(true);
    const timer = setTimeout(() => {
      getSuggestions(plain, { ...suggestionContext, template: templateContext })
        .then((data) => {
          onSuggestions(data);
        })
        .catch(() => {
          // Swallow errors; logging handled upstream
        })
        .finally(() => {
          onSuggestionsLoading(false);
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [value, templateContext, suggestionContext, onSuggestions, onSuggestionsLoading]);

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
    const toolbarId = `${id || 'editor'}-toolbar`;
    const modules = { toolbar: { container: `#${toolbarId}` } };
    return (
      <div style={{ height: '100%', width: '100%' }}>
        {audioControls}
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
      {(error || fetchError) && (
        <p style={{ color: 'red' }}>{error || fetchError}</p>
      )}
      {loadingTranscript && <p>Loading transcript...</p>}
    </div>
  );
});

export default NoteEditor;
