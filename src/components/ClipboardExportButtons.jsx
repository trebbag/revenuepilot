import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../api.js';
import html2pdf from 'html2pdf.js';

function ClipboardExportButtons({
  beautified,
  summary,
  patientID,
  suggestions = {},
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');

  const copy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(
        type === 'beautified'
          ? t('clipboard.beautifiedCopied')
          : t('clipboard.summaryCopied'),
      );
      if (patientID) {
        logEvent('copy', {
          patientID,
          type,
          length: text.length,
          codes: suggestions.codes?.map((c) => c.code),
          revenue: calcRevenue(suggestions.codes),
          compliance: suggestions.compliance,
          publicHealth: suggestions.publicHealth?.length > 0,
        }).catch(() => {});
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
          codes: suggestions.codes?.map((c) => c.code),
          revenue: calcRevenue(suggestions.codes),
          compliance: suggestions.compliance,
          publicHealth: suggestions.publicHealth?.length > 0,
        }).catch(() => {});
      }
      setTimeout(() => setFeedback(''), 2000);
    } catch {
      setFeedback(t('clipboard.exportFailed'));
    }
  };

  const calcRevenue = (codes = []) => {
    const map = { 99212: 50, 99213: 75, 99214: 110, 99215: 160 };
    return (codes || []).reduce((sum, c) => sum + (map[c.code || c] || 0), 0);
  };

  const exportRtf = async () => {
    try {
      const ipcRenderer = window.require
        ? window.require('electron').ipcRenderer
        : null;
      if (!ipcRenderer) return;
      await ipcRenderer.invoke('export-rtf', { beautified, summary });
      setFeedback(t('clipboard.exported'));
      if (patientID) {
        logEvent('export-rtf', {
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

  const exportPdf = async () => {
    try {
      const element = document.createElement('div');
      element.innerHTML = beautified;
      const filename = patientID ? `note-${patientID}.pdf` : 'note.pdf';
      const options = { filename, margin: 10, html2canvas: { scale: 2 } };
      await html2pdf().set(options).from(element).save();
      setFeedback(t('clipboard.exported'));
      if (patientID) {
        logEvent('export-pdf', {
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
      <button
        disabled={!beautified}
        onClick={() => copy(beautified, 'beautified')}
      >
        {t('clipboard.copyBeautified')}
      </button>
      <button disabled={!summary} onClick={() => copy(summary, 'summary')}>
        {t('clipboard.copySummary')}
      </button>
      <button disabled={!beautified && !summary} onClick={exportNote}>
        {t('clipboard.export')}
      </button>
      <button disabled={!beautified && !summary} onClick={exportRtf}>
        {t('clipboard.exportRtf')}
      </button>
      <button disabled={!beautified} onClick={exportPdf}>
        {t('clipboard.exportPdf')}
      </button>
      {feedback && <span className="copy-feedback">{feedback}</span>}
    </>
  );
}

export default ClipboardExportButtons;
