// Admin dashboard placeholder.  Displays key metrics for the pilot.
import { useState, useEffect } from 'react';
import { getMetrics } from '../api.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function Dashboard() {
  // Determine user role from JWT; only admins may view this component.
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  let role = null;
  if (token) {
    try {
      role = JSON.parse(atob(token.split('.')[1])).role;
    } catch {
      role = null;
    }
  }
  if (role !== 'admin') {
    return <p>Access denied</p>;
  }

  // Metrics returned from the API and filter state.
  const [metrics, setMetrics] = useState({});
  const [filters, setFilters] = useState({ start: '', end: '', clinician: '' });
  const [inputs, setInputs] = useState(filters);

  useEffect(() => {
    getMetrics(filters).then((data) => setMetrics(data));
  }, [filters]);

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
    {
      title: 'Revenue per Visit',
      baseline: 0,
      current: metrics.revenue_per_visit ? metrics.revenue_per_visit.toFixed(2) : 0,
      direction: 'higher',
    },
    {
      title: 'Average Time to Close Note (s)',
      baseline: 0,
      current: metrics.avg_close_time ? metrics.avg_close_time.toFixed(1) : 0,
      direction: 'lower',
    },
    {
      title: 'Denial Rate (%)',
      baseline: 0,
      current: metrics.denial_rate ? (metrics.denial_rate * 100).toFixed(1) : 0,
      direction: 'lower',
    },
    {
      title: 'Deficiency Rate (%)',
      baseline: 0,
      current: metrics.deficiency_rate ? (metrics.deficiency_rate * 100).toFixed(1) : 0,
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

  const dailyData = {
    labels: metrics.timeseries?.daily?.map((d) => d.date) || [],
    datasets: [
      {
        label: 'Events',
        data: metrics.timeseries?.daily?.map((d) => d.count) || [],
        borderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
      },
    ],
  };

  const weeklyData = {
    labels: metrics.timeseries?.weekly?.map((w) => w.week) || [],
    datasets: [
      {
        label: 'Events',
        data: metrics.timeseries?.weekly?.map((w) => w.count) || [],
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
      },
    ],
  };

  const codingData = {
    labels: Object.keys(metrics.coding_distribution || {}),
    datasets: [
      {
        data: Object.values(metrics.coding_distribution || {}),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
        ],
      },
    ],
  };

  const denialData = {
    labels: Object.keys(metrics.denial_rates || {}),
    datasets: [
      {
        label: 'Denial Rate (%)',
        data: Object.values(metrics.denial_rates || {}).map((r) => r * 100),
        backgroundColor: 'rgba(255, 159, 64, 0.6)',
      },
    ],
  };
  return (
    <div className="dashboard">
      <h2>Analytics Dashboard</h2>
      <div className="filters" style={{ marginBottom: '1rem' }}>
        <label>
          Start
          <input
            type="date"
            value={inputs.start}
            onChange={(e) => setInputs({ ...inputs, start: e.target.value })}
          />
        </label>
        <label style={{ marginLeft: '0.5rem' }}>
          End
          <input
            type="date"
            value={inputs.end}
            onChange={(e) => setInputs({ ...inputs, end: e.target.value })}
          />
        </label>
        <label style={{ marginLeft: '0.5rem' }}>
          Clinician
          <input
            type="text"
            value={inputs.clinician}
            onChange={(e) =>
              setInputs({ ...inputs, clinician: e.target.value })
            }
          />
        </label>
        <button
          style={{ marginLeft: '0.5rem' }}
          onClick={() => setFilters(inputs)}
        >
          Apply
        </button>
      </div>
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
      {metrics.timeseries && (
        <div className="timeseries" style={{ marginTop: '1rem' }}>
          <h3>Daily Events</h3>
          <Line data={dailyData} data-testid="daily-line" />
          <h3 style={{ marginTop: '1rem' }}>Weekly Events</h3>
          <Line data={weeklyData} data-testid="weekly-line" />
        </div>
      )}

      {metrics.coding_distribution &&
        Object.keys(metrics.coding_distribution).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3>Coding Distribution</h3>
            <Pie data={codingData} data-testid="codes-pie" />
          </div>
        )}

      {metrics.denial_rates &&
        Object.keys(metrics.denial_rates).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3>Denial Rates</h3>
            <Bar data={denialData} data-testid="denial-bar" />
          </div>
        )}
    </div>
  );
}

export default Dashboard;
