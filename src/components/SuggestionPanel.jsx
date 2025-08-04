// Placeholder suggestion panel with four cards.  Each card would
// eventually display suggestions from the AI agents.
function SuggestionPanel({ suggestions, loading, className = '' }) {
  // suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [] }
  const cards = [
    { type: 'codes', title: 'Codes & Rationale', items: suggestions?.codes || [] },
    { type: 'compliance', title: 'Compliance Alerts', items: suggestions?.compliance || [] },
    { type: 'public-health', title: 'Public Health', items: suggestions?.publicHealth || [] },
    { type: 'differentials', title: 'Differentials', items: suggestions?.differentials || [] },
  ];
  return (
    <div className={`suggestion-panel ${className}`}>
      {cards.map(({ type, title, items }) => (
        <div key={type} className={`card ${type}`}>
          <strong>{title}</strong>
          <ul>
            {loading ? (
              <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>Loading suggestions...</li>
            ) : items.length === 0 ? (
              <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>No suggestions yet</li>
            ) : (
              // Render codes differently if they include rationale objects
              items.map((item, idx) => {
                if (typeof item === 'object' && item !== null && 'code' in item) {
                  const tooltip = item.rationale || '';
                  return (
                    <li key={idx} title={tooltip}>
                      <strong>{item.code}</strong>
                      {item.rationale ? ` — ${item.rationale}` : ''}
                    </li>
                  );
                }
                // For string items (compliance, public health, differentials), reuse
                // the text itself as the tooltip.  In a future iteration these
                // could include richer descriptions or citations.
                return (
                  <li key={idx} title={item}>
                    {item}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default SuggestionPanel;