// Logs view component for RevenuePilot.
// This component fetches recent analytics events from the backend and
// displays them in a scrollable list.  It can be used to troubleshoot
// user actions and verify that events are being logged correctly.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch events when component mounts
    async function load() {
      setLoading(true);
      try {
        const data = await getEvents();
        setEvents(data);
      } catch (err) {
        if (err.message === 'Unauthorized' && typeof window !== 'undefined') {
          window.location.href = '/';
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
      <div className="logs-page" style={{ padding: '1rem', overflowY: 'auto' }}>
        <h2>{t('logs.title')}</h2>
        <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>{t('logs.intro')}</p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {loading ? (
          <p>{t('logs.loading')}</p>
        ) : events.length === 0 ? (
          <p>{t('logs.none')}</p>
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