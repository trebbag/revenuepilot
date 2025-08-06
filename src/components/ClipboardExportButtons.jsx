import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../api.js';
import SatisfactionSurvey from './SatisfactionSurvey.jsx';

function ClipboardExportButtons({ beautified, summary, patientID, suggestions = {} }) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');
  const [showSurvey, setShowSurvey] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      setShowSurvey(true);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const copy = async (text, type) => {
    try {
        await navigator.clipboard.writeText(text);
        setFeedback(
          type === 'beautified'
            ? t('clipboard.beautifiedCopied')
            : t('clipboard.summaryCopied')
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
      setShowSurvey(true);
      setTimeout(() => setFeedback(''), 2000);
    } catch {
        setFeedback(t('clipboard.exportFailed'));
    }
  };



  const calcRevenue = (codes = []) => {
    const map = { '99212': 50, '99213': 75, '99214': 110, '99215': 160 };
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
        <button disabled={!beautified && !summary} onClick={exportRtf}>
          {t('clipboard.exportRtf')}
        </button>
      {feedback && <span className="copy-feedback">{feedback}</span>}
      <SatisfactionSurvey open={showSurvey} onClose={() => setShowSurvey(false)} />
    </>
  );
}

export default ClipboardExportButtons;
