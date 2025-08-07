import React from 'react';

function formatTime(sec) {
  const d = new Date(sec * 1000);
  return d.toISOString().substr(14, 5);
}

export default function TranscriptView({ transcript, onAdd, onIgnore }) {
  const segments = transcript?.segments || [];
  if (!segments.length) return null;
  return (
    <div className="transcript-view card">
      {segments.map((seg, idx) => (
        <div key={idx} className="segment">
          <strong>{seg.speaker}</strong> [{formatTime(seg.start)}-{formatTime(seg.end)}]:{' '}
          <span>{seg.text}</span>
          <button onClick={() => onAdd(idx)}>Add</button>
          <button onClick={() => onIgnore(idx)}>Ignore</button>
        </div>
      ))}
    </div>
  );
}
