import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleFollowUp } from '../api.js';

function FollowUpScheduler({ note, codes = [] }) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState('');
  const [ics, setIcs] = useState(null);
  const [loading, setLoading] = useState(false);

  const recommend = async () => {
    setLoading(true);
    try {
      const data = await scheduleFollowUp(note, codes);
      setInterval(data.interval || '');
      setIcs(data.ics || null);
    } catch (err) {
      console.error('schedule error', err);
    } finally {
      setLoading(false);
    }
  };

  const generateIcs = (ivl) => {
    const m = ivl?.match(/(\d+)\s*(day|week|month|year)/i);
    if (!m) return null;
    const value = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const start = new Date();
    const date = new Date(start);
    if (unit.startsWith('day')) date.setDate(start.getDate() + value);
    else if (unit.startsWith('week')) date.setDate(start.getDate() + 7 * value);
    else if (unit.startsWith('month')) date.setMonth(start.getMonth() + value);
    else if (unit.startsWith('year'))
      date.setFullYear(start.getFullYear() + value);
    const dt = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const icsText = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${t('suggestion.followUpAppointment')}\nDTSTART:${dt}\nDTEND:${dt}\nEND:VEVENT\nEND:VCALENDAR`;
    return `data:text/calendar;charset=utf8,${encodeURIComponent(icsText)}`;
  };

  const href = ics
    ? `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`
    : generateIcs(interval);

  return (
    <div className="follow-up-scheduler">
      <button onClick={recommend} disabled={loading}>
        {t('followUp.recommend')}
      </button>
      <input
        value={interval}
        onChange={(e) => setInterval(e.target.value)}
        placeholder={t('followUp.placeholder')}
        style={{ marginLeft: '0.5em' }}
      />
      {href && (
        <a href={href} download="follow-up.ics" style={{ marginLeft: '0.5em' }}>
          {t('suggestion.addToCalendar')}
        </a>
      )}
    </div>
  );
}

export default FollowUpScheduler;
