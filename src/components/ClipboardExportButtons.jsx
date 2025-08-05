import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../api.js';

function ClipboardExportButtons({ beautified, summary, patientID }) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');

  const copy = async (text, type) => {
    try {
        await navigator.clipboard.writeText(text);
        setFeedback(
          type === 'beautified'
            ? t('clipboard.beautifiedCopied')
            : t('clipboard.summaryCopied')
        );
      if (patientID) {
        logEvent('copy', { patientID, type, length: text.length }).catch(() => {});
      }
      setTimeout(() => setFeedback(''), 2000);
    } catch {
        setFeedback(t('clipboard.copyFailed'));
    }
  };

  const exportNote = async () => {
    try {
      const ipcRenderer = window.require
        ? window.require('electron').ipcRenderer
        : null;
      if (!ipcRenderer) return;
        await ipcRenderer.invoke('export-note', { beautified, summary });
        setFeedback(t('clipboard.exported'));
      if (patientID) {
        logEvent('export', {
          patientID,
          beautifiedLength: beautified.length,
          summaryLength: summary.length,
        }).catch(() => {});
      }
      setTimeout(() => setFeedback(''), 2000);
    } catch {
        setFeedback(t('clipboard.exportFailed'));
    }
  };

  return (
    <>
        <button disabled={!beautified} onClick={() => copy(beautified, 'beautified')}>
          {t('clipboard.copyBeautified')}
        </button>
        <button disabled={!summary} onClick={() => copy(summary, 'summary')}>
          {t('clipboard.copySummary')}
        </button>
        <button disabled={!beautified && !summary} onClick={exportNote}>
          {t('clipboard.export')}
        </button>
      {feedback && <span className="copy-feedback">{feedback}</span>}
    </>
  );
}

export default ClipboardExportButtons;
