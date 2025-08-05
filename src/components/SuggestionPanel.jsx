// Suggestion panel rendering four expandable cards.  Clicking a suggestion
// inserts it into the note editor via the onInsert callback.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

  function SuggestionPanel({
    suggestions,
    loading,
    className = '',
    onInsert,
  }) {
    const { t } = useTranslation();
    // suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [] }
    const cards = [
      { type: 'codes', key: 'codes', title: t('suggestion.codes'), items: suggestions?.codes || [] },
      { type: 'compliance', key: 'compliance', title: t('suggestion.compliance'), items: suggestions?.compliance || [] },
      { type: 'public-health', key: 'publicHealth', title: t('suggestion.publicHealth'), items: suggestions?.publicHealth || [] },
      { type: 'differentials', key: 'differentials', title: t('suggestion.differentials'), items: suggestions?.differentials || [] },
    ];

  const [openState, setOpenState] = useState({
    codes: true,
    compliance: true,
    publicHealth: true,
    differentials: true,
  });

  const toggleCard = (type) => {
    setOpenState((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const renderItems = (items) => {
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
      if (typeof item === 'object' && item !== null && 'code' in item) {
        const text = item.rationale
          ? `${item.code} — ${item.rationale}`
          : item.code;
        const tooltip = item.rationale || '';
        return (
          <li
            key={idx}
            title={tooltip}
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(text)}
          >
            <strong>{item.code}</strong>
            {item.rationale ? ` — ${item.rationale}` : ''}
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
          {openState[key] && <ul>{renderItems(items)}</ul>}
        </div>
      ))}
    </div>
  );
}

export default SuggestionPanel;
