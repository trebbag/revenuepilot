import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackendBaseUrl } from '../api.js';

function formatTimestamp(ts) {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return ts;
  }
}

export default function AuditLog({ token }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Centralized backend URL resolution
  const baseUrl = getBackendBaseUrl();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const resp = await fetch(`${baseUrl}/audit`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error(t('auditLog.fetchError'));
        const data = await resp.json();
        setEntries(data);
        setError(null);
      } catch (err) {
        setError(err.message || t('auditLog.fetchError'));
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token, baseUrl, t]);

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3>{t('auditLog.title')}</h3>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? (
        <p>{t('auditLog.loading')}</p>
      ) : entries.length === 0 ? (
        <p>{t('auditLog.none')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('auditLog.timestamp')}</th>
              <th>{t('auditLog.username')}</th>
              <th>{t('auditLog.action')}</th>
              <th>{t('auditLog.details')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, idx) => (
              <tr key={idx}>
                <td>{formatTimestamp(e.timestamp)}</td>
                <td>{e.username}</td>
                <td>{e.action}</td>
                <td>{e.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
