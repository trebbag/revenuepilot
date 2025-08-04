// Admin dashboard placeholder.  Displays key metrics for the pilot.
import { useState, useEffect } from 'react';
import { getMetrics } from '../api.js';

function Dashboard() {
  // Initialise metrics as an empty object so that property accesses
  // return undefined rather than throwing.  Missing values will
  // default to zero in the card definitions below.
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    // Fetch metrics from the backend on mount
    getMetrics().then((data) => setMetrics(data));
  }, []);

  // Define display cards using the fetched metrics.  Missing values will
  // default to zero.  When numeric metrics are present, format them to
  // one decimal place; otherwise show zero.
  const cards = [
    {
      title: 'Total Notes Created',
      baseline: 0,
      current: metrics.total_notes || 0,
      direction: 'higher',
    },
    {
      title: 'Beautified Notes',
      baseline: 0,
      current: metrics.total_beautify || 0,
      direction: 'higher',
    },
    {
      title: 'Suggestions Requested',
      baseline: 0,
      current: metrics.total_suggest || 0,
      direction: 'higher',
    },
    {
      title: 'Summaries Generated',
      baseline: 0,
      current: metrics.total_summary || 0,
      direction: 'higher',
    },
    {
      title: 'Chart Uploads',
      baseline: 0,
      current: metrics.total_chart_upload || 0,
      direction: 'higher',
    },
    {
      title: 'Audio Recordings',
      baseline: 0,
      current: metrics.total_audio || 0,
      direction: 'higher',
    },
    {
      title: 'Average Note Length (chars)',
      baseline: 0,
      current: metrics.avg_note_length ? metrics.avg_note_length.toFixed(1) : 0,
      direction: 'higher',
    },
    {
      title: 'Average Beautify Time (s)',
      baseline: 0,
      current: metrics.avg_beautify_time ? metrics.avg_beautify_time.toFixed(1) : 0,
      direction: 'lower',
    },
  ];

  /**
   * Try to parse a numeric value from strings like "$150", "12%", "48h" or "3.0".
   * Returns NaN if parsing fails. Strips common symbols like $,% and h.
   */
  const parseNumeric = (value) => {
    // Convert the value to a string first; this prevents errors when
    // numbers are passed in (e.g., 0) which do not have a replace method.
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    return parseFloat(cleaned);
  };

  /**
   * Determine improvement or decline for a metric.  Returns an object with
   * direction ('up' or 'down' or null) and magnitude (absolute difference).
   */
  const computeChange = (metric) => {
    if (metric.direction === 'none') return { dir: null, diff: null };
    const baseVal = parseNumeric(metric.baseline);
    const curVal = parseNumeric(metric.current);
    if (isNaN(baseVal) || isNaN(curVal)) return { dir: null, diff: null };
    const diff = curVal - baseVal;
    // For metrics where lower is better, invert the sign
    const effectiveDiff = metric.direction === 'lower' ? -diff : diff;
    return {
      dir: effectiveDiff > 0 ? 'up' : effectiveDiff < 0 ? 'down' : null,
      diff: Math.abs(diff),
    };
  };
  return (
    <div className="dashboard">
      <h2>Analytics Dashboard</h2>
      <div className="metrics-grid">
        {cards.map((m) => {
          const change = computeChange(m);
          const arrow = change.dir === 'up' ? '↑' : change.dir === 'down' ? '↓' : '';
          const colour = change.dir === 'up' ? '#2E7D32' : change.dir === 'down' ? '#E57373' : 'inherit';
          const diffLabel = change.diff != null ? `${arrow} ${change.diff}` : '';
          let ratio = null;
          if (change.diff != null && change.dir) {
            const baseVal = parseNumeric(m.baseline.toString());
            const curVal = parseNumeric(m.current.toString());
            if (!isNaN(baseVal) && !isNaN(curVal) && baseVal !== 0) {
              if (m.direction === 'higher') {
                ratio = Math.min(Math.abs(curVal - baseVal) / (baseVal || 1), 1);
              } else if (m.direction === 'lower') {
                ratio = Math.min(Math.abs(baseVal - curVal) / (baseVal || 1), 1);
              }
            }
          }
          return (
            <div key={m.title} className="metric-card">
              <h3>{m.title}</h3>
              <p><strong>Baseline:</strong> {m.baseline}</p>
              <p><strong>Current:</strong> {m.current}</p>
              {arrow && (
                <p style={{ color: colour, fontWeight: 'bold' }}>{diffLabel}</p>
              )}
              {ratio !== null && (
                <div className="improvement-bar" style={{ marginTop: '0.3rem', height: '0.4rem', background: '#E5E7EB', borderRadius: '2px' }}>
                  <div
                    style={{
                      width: `${ratio * 100}%`,
                      height: '100%',
                      background: colour,
                      borderRadius: '2px',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;