// Admin dashboard placeholder.  Displays key metrics for the pilot.
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
    if (typeof window !== 'undefined') {
      alert(t('dashboard.accessDenied'));
      window.location.href = '/';
    }
    return null;
  }

  // Metrics returned from the API and filter state.
  const [metrics, setMetrics] = useState({});
  const [filters, setFilters] = useState({ start: '', end: '', clinician: '' });
  const [inputs, setInputs] = useState({ ...filters, range: '' });
  const [error, setError] = useState(null);

  const applyFilters = () => {
    let { start, end, clinician, range } = inputs;
    if (range) {
      const now = new Date();
      end = now.toISOString().slice(0, 10);
      const s = new Date();
      s.setDate(now.getDate() - parseInt(range, 10));
      start = s.toISOString().slice(0, 10);
    }
    setFilters({ start, end, clinician });
  };

  useEffect(() => {
    getMetrics(filters)
      .then((data) => setMetrics(data))
      .catch((err) => {
        if (err.message === 'Unauthorized' && typeof window !== 'undefined') {
          alert(t('dashboard.accessDenied'));
          localStorage.removeItem('token');
          window.location.href = '/';
        } else {
          setError(err.message);
        }
      });
  }, [filters]);

  // Define display cards using the fetched metrics.  Missing values will
  // default to zero.  When numeric metrics are present, format them to
  // one decimal place; otherwise show zero.
  const cards = [
    {
      key: 'total_notes',
      title: t('dashboard.cards.totalNotes'),
      baseline: metrics.baseline?.total_notes || 0,
      current: metrics.current?.total_notes || 0,
      improvement: metrics.improvement?.total_notes,
      direction: 'higher',
    },
    {
      key: 'total_beautify',
      title: t('dashboard.cards.beautifiedNotes'),
      baseline: metrics.baseline?.total_beautify || 0,
      current: metrics.current?.total_beautify || 0,
      improvement: metrics.improvement?.total_beautify,
      direction: 'higher',
    },
    {
      key: 'total_suggest',
      title: t('dashboard.cards.suggestionsRequested'),
      baseline: metrics.baseline?.total_suggest || 0,
      current: metrics.current?.total_suggest || 0,
      improvement: metrics.improvement?.total_suggest,
      direction: 'higher',
    },
    {
      key: 'total_summary',
      title: t('dashboard.cards.summariesGenerated'),
      baseline: metrics.baseline?.total_summary || 0,
      current: metrics.current?.total_summary || 0,
      improvement: metrics.improvement?.total_summary,
      direction: 'higher',
    },
    {
      key: 'total_chart_upload',
      title: t('dashboard.cards.chartUploads'),
      baseline: metrics.baseline?.total_chart_upload || 0,
      current: metrics.current?.total_chart_upload || 0,
      improvement: metrics.improvement?.total_chart_upload,
      direction: 'higher',
    },
    {
      key: 'total_audio',
      title: t('dashboard.cards.audioRecordings'),
      baseline: metrics.baseline?.total_audio || 0,
      current: metrics.current?.total_audio || 0,
      improvement: metrics.improvement?.total_audio,
      direction: 'higher',
    },
    {
      key: 'avg_note_length',
      title: t('dashboard.cards.avgNoteLength'),
      baseline: metrics.baseline?.avg_note_length ? metrics.baseline.avg_note_length.toFixed(1) : 0,
      current: metrics.current?.avg_note_length ? metrics.current.avg_note_length.toFixed(1) : 0,
      improvement: metrics.improvement?.avg_note_length,
      direction: 'higher',
    },
    {
      key: 'avg_beautify_time',
      title: t('dashboard.cards.avgBeautifyTime'),
      baseline: metrics.baseline?.avg_beautify_time ? metrics.baseline.avg_beautify_time.toFixed(1) : 0,
      current: metrics.current?.avg_beautify_time ? metrics.current.avg_beautify_time.toFixed(1) : 0,
      improvement: metrics.improvement?.avg_beautify_time,
      direction: 'lower',
    },
    {
      key: 'revenue_per_visit',
      title: t('dashboard.cards.revenuePerVisit'),
      baseline: metrics.baseline?.revenue_per_visit ? metrics.baseline.revenue_per_visit.toFixed(2) : 0,
      current: metrics.current?.revenue_per_visit ? metrics.current.revenue_per_visit.toFixed(2) : 0,
      improvement: metrics.improvement?.revenue_per_visit,
      direction: 'higher',
    },
    {
      key: 'avg_close_time',
      title: t('dashboard.cards.avgCloseTime'),
      baseline: metrics.baseline?.avg_close_time ? metrics.baseline.avg_close_time.toFixed(1) : 0,
      current: metrics.current?.avg_close_time ? metrics.current.avg_close_time.toFixed(1) : 0,
      improvement: metrics.improvement?.avg_close_time,
      direction: 'lower',
    },
    {
      key: 'denial_rate',
      title: t('dashboard.cards.denialRate'),
      baseline: metrics.baseline?.denial_rate ? (metrics.baseline.denial_rate * 100).toFixed(1) : 0,
      current: metrics.current?.denial_rate ? (metrics.current.denial_rate * 100).toFixed(1) : 0,
      improvement: metrics.improvement?.denial_rate,
      direction: 'lower',
    },
    {
      key: 'deficiency_rate',
      title: t('dashboard.cards.deficiencyRate'),
      baseline: metrics.baseline?.deficiency_rate ? (metrics.baseline.deficiency_rate * 100).toFixed(1) : 0,
      current: metrics.current?.deficiency_rate ? (metrics.current.deficiency_rate * 100).toFixed(1) : 0,
      improvement: metrics.improvement?.deficiency_rate,
      direction: 'lower',
    },
  ];


  const exportCSV = () => {
    const rows = [];
    const topLevel = [
      'total_notes',
      'total_beautify',
      'total_suggest',
      'total_summary',
      'total_chart_upload',
      'total_audio',
      'avg_note_length',
      'avg_beautify_time',
      'avg_close_time',
      'revenue_per_visit',
      'denial_rate',
      'deficiency_rate',
    ];
    topLevel.forEach((k) => {
      if (metrics.current && k in metrics.current) rows.push([k, metrics.current[k]]);
    });
    const daily = metrics.timeseries?.daily || [];
    rows.push([]);
    rows.push(['daily']);
    if (daily.length) {
      const headers = Object.keys(daily[0]);
      rows.push(headers);
      daily.forEach((d) => rows.push(headers.map((h) => d[h] ?? '')));
    }
    const weekly = metrics.timeseries?.weekly || [];
    rows.push([]);
    rows.push(['weekly']);
    if (weekly.length) {
      const headers = Object.keys(weekly[0]);
      rows.push(headers);
      weekly.forEach((w) => rows.push(headers.map((h) => w[h] ?? '')));
    }
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metrics.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const dailyLabels = metrics.timeseries?.daily?.map((d) => d.date) || [];
  const dailyData = {
    labels: dailyLabels,
    datasets: [
      {
        label: t('dashboard.cards.totalNotes'),
        data: metrics.timeseries?.daily?.map((d) => d.notes || 0) || [],
        borderColor: 'rgba(54,162,235,1)',
        backgroundColor: 'rgba(54,162,235,0.2)',
      },
      {
        label: t('dashboard.cards.beautifiedNotes'),
        data: metrics.timeseries?.daily?.map((d) => d.beautify || 0) || [],
        borderColor: 'rgba(255,99,132,1)',
        backgroundColor: 'rgba(255,99,132,0.2)',
      },
      {
        label: t('dashboard.cards.suggestionsRequested'),
        data: metrics.timeseries?.daily?.map((d) => d.suggest || 0) || [],
        borderColor: 'rgba(75,192,192,1)',
        backgroundColor: 'rgba(75,192,192,0.2)',
      },
      {
        label: t('dashboard.cards.summariesGenerated'),
        data: metrics.timeseries?.daily?.map((d) => d.summary || 0) || [],
        borderColor: 'rgba(153,102,255,1)',
        backgroundColor: 'rgba(153,102,255,0.2)',
      },
      {
        label: t('dashboard.cards.chartUploads'),
        data: metrics.timeseries?.daily?.map((d) => d.chart_upload || 0) || [],
        borderColor: 'rgba(255,159,64,1)',
        backgroundColor: 'rgba(255,159,64,0.2)',
      },
      {
        label: t('dashboard.cards.audioRecordings'),
        data: metrics.timeseries?.daily?.map((d) => d.audio || 0) || [],
        borderColor: 'rgba(0,0,0,1)',
        backgroundColor: 'rgba(0,0,0,0.2)',
      },
      {
        label: t('dashboard.cards.avgNoteLength'),
        data: metrics.timeseries?.daily?.map((d) => d.avg_note_length || 0) || [],
        borderColor: 'rgba(99,255,132,1)',
        backgroundColor: 'rgba(99,255,132,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgBeautifyTime'),
        data: metrics.timeseries?.daily?.map((d) => d.avg_beautify_time || 0) || [],
        borderColor: 'rgba(255,205,86,1)',
        backgroundColor: 'rgba(255,205,86,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.revenuePerVisit'),
        data: metrics.timeseries?.daily?.map((d) => d.revenue_per_visit || 0) || [],
        borderColor: 'rgba(201,90,90,1)',
        backgroundColor: 'rgba(201,90,90,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgCloseTime'),
        data: metrics.timeseries?.daily?.map((d) => d.avg_close_time || 0) || [],
        borderColor: 'rgba(100,100,255,1)',
        backgroundColor: 'rgba(100,100,255,0.2)',
        yAxisID: 'y1',
      },
    ],
  };

  const dailyOptions = {
    scales: {
      y: { beginAtZero: true },
      y1: {
        beginAtZero: true,
        position: 'right',
        grid: { drawOnChartArea: false },
      },
    },
  };

  const weeklyLabels = metrics.timeseries?.weekly?.map((w) => w.week) || [];
  const weeklyData = {
    labels: weeklyLabels,
    datasets: [
      {
        label: t('dashboard.cards.totalNotes'),
        data: metrics.timeseries?.weekly?.map((w) => w.notes || 0) || [],
        borderColor: 'rgba(54,162,235,1)',
        backgroundColor: 'rgba(54,162,235,0.2)',
      },
      {
        label: t('dashboard.cards.beautifiedNotes'),
        data: metrics.timeseries?.weekly?.map((w) => w.beautify || 0) || [],
        borderColor: 'rgba(255,99,132,1)',
        backgroundColor: 'rgba(255,99,132,0.2)',
      },
      {
        label: t('dashboard.cards.suggestionsRequested'),
        data: metrics.timeseries?.weekly?.map((w) => w.suggest || 0) || [],
        borderColor: 'rgba(75,192,192,1)',
        backgroundColor: 'rgba(75,192,192,0.2)',
      },
      {
        label: t('dashboard.cards.summariesGenerated'),
        data: metrics.timeseries?.weekly?.map((w) => w.summary || 0) || [],
        borderColor: 'rgba(153,102,255,1)',
        backgroundColor: 'rgba(153,102,255,0.2)',
      },
      {
        label: t('dashboard.cards.chartUploads'),
        data: metrics.timeseries?.weekly?.map((w) => w.chart_upload || 0) || [],
        borderColor: 'rgba(255,159,64,1)',
        backgroundColor: 'rgba(255,159,64,0.2)',
      },
      {
        label: t('dashboard.cards.audioRecordings'),
        data: metrics.timeseries?.weekly?.map((w) => w.audio || 0) || [],
        borderColor: 'rgba(0,0,0,1)',
        backgroundColor: 'rgba(0,0,0,0.2)',
      },
      {
        label: t('dashboard.cards.avgNoteLength'),
        data: metrics.timeseries?.weekly?.map((w) => w.avg_note_length || 0) || [],
        borderColor: 'rgba(99,255,132,1)',
        backgroundColor: 'rgba(99,255,132,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgBeautifyTime'),
        data: metrics.timeseries?.weekly?.map((w) => w.avg_beautify_time || 0) || [],
        borderColor: 'rgba(255,205,86,1)',
        backgroundColor: 'rgba(255,205,86,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.revenuePerVisit'),
        data: metrics.timeseries?.weekly?.map((w) => w.revenue_per_visit || 0) || [],
        borderColor: 'rgba(201,90,90,1)',
        backgroundColor: 'rgba(201,90,90,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgCloseTime'),
        data: metrics.timeseries?.weekly?.map((w) => w.avg_close_time || 0) || [],
        borderColor: 'rgba(100,100,255,1)',
        backgroundColor: 'rgba(100,100,255,0.2)',
        yAxisID: 'y1',
      },
    ],
  };

  const weeklyOptions = {
    scales: {
      y: { beginAtZero: true },
      y1: {
        beginAtZero: true,
        position: 'right',
        grid: { drawOnChartArea: false },
      },
    },
  };

  const revenueLineData = {
    labels: dailyLabels,
    datasets: [
      {
        label: t('dashboard.cards.revenuePerVisit'),
        data:
          metrics.timeseries?.daily?.map((d) => d.revenue_per_visit || 0) || [],
        borderColor: 'rgba(201,90,90,1)',
        backgroundColor: 'rgba(201,90,90,0.2)',
      },
    ],
  };

  const emCodes = ['99212', '99213', '99214', '99215'];
  const totalCodes = emCodes.reduce(
    (sum, c) => sum + (metrics.coding_distribution?.[c] || 0),
    0
  );
  const codeBarData = {
    labels: ['E/M'],
    datasets: emCodes.map((c, idx) => ({
      label: c,
      data: [
        totalCodes
          ? ((metrics.coding_distribution?.[c] || 0) / totalCodes) * 100
          : 0,
      ],
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'][idx],
    })),
  };
  const codeBarOptions = {
    scales: { x: { stacked: true, max: 100 }, y: { stacked: true, beginAtZero: true } },
  };
  const denialDefData = {
    labels: [t('dashboard.cards.denialRate'), t('dashboard.cards.deficiencyRate')],
    datasets: [
      {
        label: t('dashboard.rate'),
        data: [
          metrics.current?.denial_rate ? metrics.current.denial_rate * 100 : 0,
          metrics.current?.deficiency_rate ? metrics.current.deficiency_rate * 100 : 0,
        ],
        backgroundColor: ['rgba(255,159,64,0.6)', 'rgba(75, 192, 192, 0.6)'],
      },
    ],
  };
  const rateOptions = { scales: { y: { beginAtZero: true, max: 100 } } };

  const denialData = {
    labels: Object.keys(metrics.denial_rates || {}),
    datasets: [
      {
        label: t('dashboard.denialRateLabel'),
        data: Object.values(metrics.denial_rates || {}).map((r) => r * 100),
        backgroundColor: 'rgba(255, 159, 64, 0.6)',
      },
    ],
  };
  return (
      <div className="dashboard">
        <h2>{t('dashboard.title')}</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div className="filters" style={{ marginBottom: '1rem' }}>
          <label>
            {t('dashboard.range')}
            <select
              value={inputs.range}
              onChange={(e) => setInputs({ ...inputs, range: e.target.value })}
            >
              <option value="">{t('dashboard.customRange')}</option>
              <option value="7">7 {t('dashboard.days')}</option>
              <option value="30">30 {t('dashboard.days')}</option>
            </select>
          </label>
          <label style={{ marginLeft: '0.5rem' }}>
            {t('dashboard.start')}
            <input
              type="date"
              value={inputs.start}
              onChange={(e) => setInputs({ ...inputs, start: e.target.value })}
            />
          </label>
          <label style={{ marginLeft: '0.5rem' }}>
            {t('dashboard.end')}
            <input
              type="date"
              value={inputs.end}
              onChange={(e) => setInputs({ ...inputs, end: e.target.value })}
            />
          </label>
          <label style={{ marginLeft: '0.5rem' }}>
            {t('dashboard.clinician')}
            <select
              value={inputs.clinician}
              onChange={(e) =>
                setInputs({ ...inputs, clinician: e.target.value })
              }
            >
              <option value="">{t('dashboard.allClinicians')}</option>
              {(metrics.clinicians || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            style={{ marginLeft: '0.5rem' }}
            onClick={applyFilters}
          >
            {t('dashboard.apply')}
          </button>
          <button style={{ marginLeft: '0.5rem' }} onClick={exportCSV}>
            {t('export')}
          </button>
        </div>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>{t('dashboard.metric')}</th>
            <th>{t('dashboard.baseline')}</th>
            <th>{t('dashboard.current')}</th>
            <th>{t('dashboard.change')}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((m) => {
            const pct = m.improvement;
            const effective =
              pct != null ? (m.direction === 'lower' ? -pct : pct) : null;
            const arrow =
              effective > 0 ? '↑' : effective < 0 ? '↓' : '';
            const colour =
              effective > 0 ? '#2E7D32' : effective < 0 ? '#E57373' : 'inherit';
            const diffLabel =
              effective != null ? `${arrow} ${Math.abs(effective).toFixed(1)}%` : '';
            return (
              <tr key={m.title}>
                <td>{m.title}</td>
                <td>{m.baseline}</td>
                <td>{m.current}</td>
                <td style={{ color: colour }}>{diffLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {metrics.timeseries && (
        <div className="timeseries" style={{ marginTop: '1rem' }}>
            <h3>{t('dashboard.dailyEvents')}</h3>
            <Line data={dailyData} options={dailyOptions} data-testid="daily-line" />
            <h3 style={{ marginTop: '1rem' }}>{t('dashboard.weeklyEvents')}</h3>
            <Line data={weeklyData} options={weeklyOptions} data-testid="weekly-line" />
        </div>
      )}

      {metrics.timeseries && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.revenueOverTime')}</h3>
          <Line
            data={revenueLineData}
            options={{ scales: { y: { beginAtZero: true } } }}
            data-testid="revenue-line"
          />
        </div>
      )}

      {metrics.current &&
        typeof metrics.current.denial_rate === 'number' &&
        typeof metrics.current.deficiency_rate === 'number' && (
          <div style={{ marginTop: '1rem' }}>
            <h3>{t('dashboard.denialDefRates')}</h3>
            <Bar
              data={denialDefData}
              options={rateOptions}
              data-testid="denial-def-bar"
            />
          </div>
        )}

      {metrics.coding_distribution &&
        Object.keys(metrics.coding_distribution).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3>{t('dashboard.codeDistribution')}</h3>
            <Bar
              data={codeBarData}
              options={codeBarOptions}
              data-testid="codes-bar"
            />
          </div>
        )}

      {metrics.denial_rates &&
        Object.keys(metrics.denial_rates).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
              <h3>{t('dashboard.denialRates')}</h3>
              <Bar data={denialData} data-testid="denial-bar" />
          </div>
        )}
    </div>
  );
}

export default Dashboard;
