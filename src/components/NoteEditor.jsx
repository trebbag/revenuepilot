// A rich text editor component for clinical notes.
//
// This component wraps the ReactQuill editor from the `react-quill` package.
// When the package is installed (via `npm install react-quill`), it will
// render a full-featured WYSIWYG editor that produces HTML as its value.  If
// ReactQuill fails to import (e.g. before packages are installed), the
// component will gracefully fall back to a simple <textarea> so that
// development can proceed without breaking the UI.

import { useEffect, useRef, useState } from 'react';
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

function NoteEditor({ id, value, onChange }) {
  // Maintain a local state for the editor's HTML value when using the
  // fallback <textarea>.  This allows the component to behave as a
  // controlled input in both modes.
  const [localValue, setLocalValue] = useState(value || '');

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

  // Render the rich text editor if available; otherwise render a textarea.
  if (ReactQuill) {
    return (
      <ReactQuill
        id={id}
        theme="snow"
        value={value}
        // ReactQuill's onChange passes the new HTML string as the first
        // argument.  We ignore the other args (delta, source, editor) and
        // forward the HTML string to the parent onChange.
        onChange={(content) => onChange(content)}
        style={{ height: '100%', width: '100%' }}
      />
    );
  }
  return (
    <textarea
      id={id}
      value={localValue}
      onChange={handleTextAreaChange}
      style={{ width: '100%', height: '100%', padding: '0.5rem' }}
      placeholder="Type your clinical note here..."
    />
  );
}

export default NoteEditor;