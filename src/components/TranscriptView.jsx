import React from 'react';
import { useTranslation } from 'react-i18next';

function formatTime(sec) {
  const d = new Date(sec * 1000);
  return d.toISOString().substr(14, 5);
}

export default function TranscriptView({ transcript, onAdd, onIgnore }) {
  const { t } = useTranslation();
  const segments = transcript?.segments || [];
  if (!segments.length) return null;
  return (
    <div className="transcript-view card">
      {segments.map((seg, idx) => (
        <div key={idx} className="segment">
          <strong>{seg.speaker}</strong> [{formatTime(seg.start)}-{formatTime(seg.end)}]:{' '}
          <span>{seg.text}</span>
          <button onClick={() => onAdd(idx)}>{t('transcript.add')}</button>
          <button onClick={() => onIgnore(idx)}>{t('transcript.ignore')}</button>
        </div>
      ))}
    </div>
  );
}
