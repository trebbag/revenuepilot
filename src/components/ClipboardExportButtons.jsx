import { useState } from 'react';
import { logEvent } from '../api.js';

function ClipboardExportButtons({ beautified, summary, patientID }) {
  const [feedback, setFeedback] = useState('');

  const copy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${type === 'beautified' ? 'Beautified' : 'Summary'} copied`);
      if (patientID) {
        logEvent('copy', { patientID, type, length: text.length }).catch(() => {});
      }
      setTimeout(() => setFeedback(''), 2000);
    } catch {
      setFeedback('Copy failed');
    }
  };

  const exportNote = async () => {
    try {
      const ipcRenderer = window.require
        ? window.require('electron').ipcRenderer
        : null;
      if (!ipcRenderer) return;
      await ipcRenderer.invoke('export-note', { beautified, summary });
      setFeedback('Exported');
      if (patientID) {
        logEvent('export', {
          patientID,
          beautifiedLength: beautified.length,
          summaryLength: summary.length,
        }).catch(() => {});
      }
      setTimeout(() => setFeedback(''), 2000);
    } catch {
      setFeedback('Export failed');
    }
  };

  return (
    <>
      <button disabled={!beautified} onClick={() => copy(beautified, 'beautified')}>
        Copy Beautified
      </button>
      <button disabled={!summary} onClick={() => copy(summary, 'summary')}>
        Copy Summary
      </button>
      <button disabled={!beautified && !summary} onClick={exportNote}>
        Export
      </button>
      {feedback && <span className="copy-feedback">{feedback}</span>}
    </>
  );
}

export default ClipboardExportButtons;
