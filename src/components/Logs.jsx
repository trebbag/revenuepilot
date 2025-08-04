// Logs view component for RevenuePilot.
// This component fetches recent analytics events from the backend and
// displays them in a scrollable list.  It can be used to troubleshoot
// user actions and verify that events are being logged correctly.

import { useEffect, useState } from 'react';
import { getEvents } from '../api.js';

function formatTimestamp(ts) {
  try {
    const date = new Date(ts * 1000);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

export default function Logs() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch events when component mounts
    async function load() {
      setLoading(true);
      const data = await getEvents();
      setEvents(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="logs-page" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h2>Event Log</h2>
      <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
        This log shows recent actions captured by the app. Use it to verify
        that events such as note creation, beautification, suggestions,
        summaries, chart uploads and audio recordings are being logged and
        processed.
      </p>
      {loading ? (
        <p>Loading…</p>
      ) : events.length === 0 ? (
        <p>No events recorded yet.</p>
      ) : (
        <div style={{ border: '1px solid var(--disabled)', borderRadius: '4px', padding: '0.5rem', maxHeight: '60vh', overflowY: 'scroll' }}>
          {events.map((ev, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontWeight: 'bold' }}>{ev.eventType}</div>
              <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{formatTimestamp(ev.timestamp)}</div>
              {ev.details && Object.keys(ev.details).length > 0 && (
                <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(ev.details, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}