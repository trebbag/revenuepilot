// Suggestion panel rendering four expandable cards.  Clicking a suggestion
// inserts it into the note editor via the onInsert callback.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function SuggestionPanel({
  suggestions,
  settingsState,
  loading,
  className = '',
  onInsert,
}) {
  const { t } = useTranslation();
  // suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [], followUp: {interval, ics}|string }
  const cards = [];
  if (!settingsState || settingsState.enableCodes) {
    cards.push({
      type: 'codes',
      key: 'codes',
      title: t('suggestion.codes'),
      items: suggestions?.codes || [],
    });
  }
  if (!settingsState || settingsState.enableCompliance) {
    cards.push({
      type: 'compliance',
      key: 'compliance',
      title: t('suggestion.compliance'),
      items: suggestions?.compliance || [],
    });
  }
  if (!settingsState || settingsState.enablePublicHealth) {
    cards.push({
      type: 'public-health',
      key: 'publicHealth',
      title: t('suggestion.publicHealth'),
      items: suggestions?.publicHealth || [],
    });
  }
  if (!settingsState || settingsState.enableDifferentials) {
    cards.push({
      type: 'differentials',
      key: 'differentials',
      title: t('suggestion.differentials'),
      items: suggestions?.differentials || [],
    });
  }
  if (!settingsState || settingsState.enableFollowUp !== false) {
    cards.push({
      type: 'follow-up',
      key: 'followUp',
      title: t('suggestion.followUp'),
      items: suggestions?.followUp ? [suggestions.followUp] : [],
    });
  }

  const [openState, setOpenState] = useState({
    codes: true,
    compliance: true,
    publicHealth: true,
    differentials: true,
    followUp: true,
  });

  const toggleCard = (type) => {
    setOpenState((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const renderItems = (items, type) => {
    if (loading) {
      return (
        <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>
          {t('suggestion.loading')}
        </li>
      );
    }
    if (!items || items.length === 0) {
      return (
        <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>
          {t('suggestion.none')}
        </li>
      );
    }
    return items.map((item, idx) => {
      if (type === 'codes' && typeof item === 'object' && item !== null) {
        const text = item.rationale
          ? `${item.code} — ${item.rationale}`
          : item.code;
        return (
          <li
            key={idx}
            title={item.rationale || ''}
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(text)}
          >
            <strong>{item.code}</strong>
            {item.rationale ? ` — ${item.rationale}` : ''}
            {item.upgrade_to && (
              <span
                style={{
                  marginLeft: '0.5em',
                  fontSize: '0.85em',
                  color: '#555',
                }}
              >
                {t('suggestion.upgradeTo')} {item.upgrade_to}
              </span>
            )}
            {item.upgradePath && (
              <span
                style={{
                  marginLeft: '0.5em',
                  fontSize: '0.85em',
                  color: '#555',
                }}
              >
                {t('suggestion.upgradePath')} {item.upgradePath}
              </span>
            )}
          </li>
        );
      }
      if (
        type === 'public-health' &&
        typeof item === 'object' &&
        item !== null
      ) {
        return (
          <li
            key={idx}
            title={item.reason || ''}
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(item.recommendation)}
          >
            {item.recommendation}
            {item.reason && (
              <div style={{ fontStyle: 'italic', color: '#555' }}>
                {item.reason}
              </div>
            )}
          </li>
        );
      }
      if (
        type === 'differentials' &&
        typeof item === 'object' &&
        item !== null
      ) {
        const isValidScore =
          typeof item.score === 'number' &&
          !Number.isNaN(item.score) &&
          item.score >= 0 &&
          item.score <= 1;
        const pct = isValidScore ? Math.round(item.score * 100) : null;
        const scoreText = pct !== null ? ` — ${pct}%` : '';
        return (
          <li
            key={idx}
            title={
              pct !== null ? `${item.diagnosis} — ${pct}%` : item.diagnosis
            }
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(item.diagnosis)}
          >
            {item.diagnosis}
            {scoreText}
          </li>
        );
      }
      if (type === 'follow-up') {
        const interval = typeof item === 'object' && item !== null ? item.interval : item;
        const icsText = typeof item === 'object' && item !== null ? item.ics : null;
        const ics =
          icsText
            ? `data:text/calendar;charset=utf8,${encodeURIComponent(icsText)}`
            : generateIcs(interval);
        return (
          <li key={idx}>
            {interval}
            {ics && (
              <a
                href={ics}
                download="follow-up.ics"
                style={{ marginLeft: '0.5em' }}
              >
                {t('suggestion.addToCalendar')}
              </a>
            )}
          </li>
        );
      }
      return (
        <li
          key={idx}
          title={item}
          style={{ cursor: 'pointer' }}
          onClick={() => onInsert && onInsert(item)}
        >
          {item}
        </li>
      );
    });
  };

  const generateIcs = (interval) => {
    const match = interval?.match(/(\d+)\s*(day|week|month|year)/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const start = new Date();
    const date = new Date(start);
    if (unit.startsWith('day')) date.setDate(start.getDate() + value);
    else if (unit.startsWith('week')) date.setDate(start.getDate() + 7 * value);
    else if (unit.startsWith('month')) date.setMonth(start.getMonth() + value);
    else if (unit.startsWith('year'))
      date.setFullYear(start.getFullYear() + value);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dt = fmt(date);
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Follow-up appointment\nDTSTART:${dt}\nDTEND:${dt}\nEND:VEVENT\nEND:VCALENDAR`;
    return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
  };

  return (
    <div className={`suggestion-panel ${className}`}>
      {cards.map(({ type, key, title, items }) => (
        <div key={type} className={`card ${type}`}>
          <div
            className="card-header"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleCard(key)}
          >
            <strong>{title}</strong>
            <span style={{ float: 'right' }}>
              {openState[key] ? '\u25BC' : '\u25B2'}
            </span>
          </div>
          {openState[key] && <ul>{renderItems(items, type)}</ul>}
        </div>
      ))}
    </div>
  );
}

export default SuggestionPanel;
