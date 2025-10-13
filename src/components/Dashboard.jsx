// Admin dashboard placeholder.  Displays key metrics for the pilot.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMetrics, getAlertSummary, getObservabilityStatus } from '../api.js';
import { Line, Bar } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  Title,
  Tooltip,
  Legend,
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
  const [alerts, setAlerts] = useState(null);
  const [alertError, setAlertError] = useState(null);
  const [observability, setObservability] = useState(null);
  const [observabilityError, setObservabilityError] = useState(null);
  const [observabilityFilters, setObservabilityFilters] = useState({
    hours: 24,
    route: '',
    limit: 20,
  });
  const [observabilityInputs, setObservabilityInputs] = useState({
    hours: '24',
    route: '',
    limit: '20',
  });
  const revenueBarRef = useRef(null);
  const denialRateRef = useRef(null);

  const handleUnauthorized = useCallback(() => {
    if (typeof window !== 'undefined') {
      alert(t('dashboard.accessDenied'));
      localStorage.removeItem('token');
      window.location.href = '/';
    }
  }, [t]);

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

  const applyObservabilityFilters = () => {
    const hours = Math.min(
      168,
      Math.max(1, parseInt(observabilityInputs.hours, 10) || 24),
    );
    const limit = Math.min(
      200,
      Math.max(1, parseInt(observabilityInputs.limit, 10) || 20),
    );
    const route = observabilityInputs.route || '';
    setObservabilityFilters({ hours, route, limit });
  };

  const resetObservabilityFilters = () => {
    setObservabilityInputs({ hours: '24', route: '', limit: '20' });
    setObservabilityFilters({ hours: 24, route: '', limit: 20 });
  };

  const formatTimestamp = (value) => {
    if (!value) return '–';
    try {
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return value;
      return dt.toLocaleString();
    } catch {
      return value || '–';
    }
  };

  const formatNumber = (value, digits = 0) => {
    if (value === null || value === undefined) return '–';
    const num = Number(value);
    if (Number.isNaN(num)) return '–';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const formatCurrency = (value, digits = 4) => {
    if (value === null || value === undefined) return '–';
    const num = Number(value);
    if (Number.isNaN(num)) return '–';
    return num.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const formatPercent = (value, digits = 1) => {
    if (value === null || value === undefined) return '–';
    const num = Number(value);
    if (Number.isNaN(num)) return '–';
    return `${num.toFixed(digits)}%`;
  };

  const formatStateSummary = (states) => {
    if (!states) return '–';
    const entries = Object.entries(states).filter(
      ([, count]) => typeof count === 'number' && !Number.isNaN(count),
    );
    if (!entries.length) return '–';
    return entries
      .map(([state, count]) => `${state}: ${count}`)
      .join(', ');
  };

  const summarizeBreakdown = (mapping) => {
    if (!mapping) return null;
    const entries = Object.entries(mapping).filter(
      ([, count]) => typeof count === 'number' && count > 0,
    );
    if (!entries.length) return null;
    return entries.map(([key, count]) => `${key}: ${count}`).join(', ');
  };

  const workflowSummary = alerts?.workflow || {};
  const exportSummary = alerts?.exports || {};
  const aiSummary = alerts?.ai || {};
  const alertsUpdated = alerts?.updatedAt
    ? formatTimestamp(alerts.updatedAt)
    : null;

  const workflowLast = workflowSummary.lastCompletion;
  const workflowLastText = workflowLast
    ? t('dashboard.alerts.workflowLast', {
        defaultValue: '{{dest}} • {{ts}}',
        dest:
          workflowLast.destination ||
          t('dashboard.alerts.unknownDestination', { defaultValue: 'unknown' }),
        ts: formatTimestamp(workflowLast.timestamp),
      })
    : t('dashboard.alerts.workflowNone', {
        defaultValue: 'No completions recorded',
      });

  const exportLast = exportSummary.lastFailure;
  const exportLastText = exportLast
    ? t('dashboard.alerts.exportLast', {
        defaultValue: '{{ehr}} • {{ts}}',
        ehr:
          exportLast.ehrSystem ||
          t('dashboard.alerts.unknownDestination', { defaultValue: 'unknown' }),
        ts: formatTimestamp(exportLast.timestamp),
      })
    : t('dashboard.alerts.exportNone', {
        defaultValue: 'No export issues detected',
      });
  const exportDetail = exportLast?.detail
    ? t('dashboard.alerts.lastDetail', {
        defaultValue: 'Detail: {{detail}}',
        detail: exportLast.detail,
      })
    : null;

  const aiLast = aiSummary.lastError;
  const aiLastText = aiLast
    ? t('dashboard.alerts.aiLast', {
        defaultValue: '{{route}} • {{ts}}',
        route:
          aiLast.route ||
          t('dashboard.alerts.unknownRoute', { defaultValue: 'unknown route' }),
        ts: formatTimestamp(aiLast.timestamp),
      })
    : t('dashboard.alerts.aiNone', {
        defaultValue: 'No AI failures recorded',
      });
  const aiDetail = aiLast?.detail
    ? t('dashboard.alerts.lastDetail', {
        defaultValue: 'Detail: {{detail}}',
        detail: aiLast.detail,
      })
    : null;

  const alertCards = alerts
    ? [
        {
          key: 'workflow',
          title: t('dashboard.alerts.workflowTitle', {
            defaultValue: 'Workflow completions',
          }),
          count: workflowSummary.total || 0,
          last: workflowLastText,
          breakdown: summarizeBreakdown(workflowSummary.byDestination),
        },
        {
          key: 'exports',
          title: t('dashboard.alerts.exportTitle', {
            defaultValue: 'Export failures',
          }),
          count: exportSummary.failures || 0,
          last: exportLastText,
          breakdown: summarizeBreakdown(exportSummary.bySystem),
          detail: exportDetail,
        },
        {
          key: 'ai',
          title: t('dashboard.alerts.aiTitle', {
            defaultValue: 'AI route errors',
          }),
          count: aiSummary.errors || 0,
          last: aiLastText,
          breakdown: summarizeBreakdown(aiSummary.byRoute),
          detail: aiDetail,
        },
      ]
    : [];

  const observabilityRoutes = observability?.routes || [];
  const availableRouteOptions = observability?.availableRoutes || [];
  const activeHoursWindow = observabilityFilters.hours || 24;
  const activeTrendRoute =
    observabilityFilters.route ||
    (observabilityRoutes.length ? observabilityRoutes[0].route : '');
  const trendPoints =
    activeTrendRoute && observability?.trends
      ? observability.trends[activeTrendRoute] || []
      : [];
  const trendLabels = trendPoints.map((pt) => formatTimestamp(pt.bucket));
  const trendChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: t('dashboard.observability.trendRuns', {
          defaultValue: 'Runs',
        }),
        data: trendPoints.map((pt) => pt.runs || 0),
        borderColor: 'rgba(37,99,235,1)',
        backgroundColor: 'rgba(37,99,235,0.2)',
        yAxisID: 'y',
        tension: 0.3,
        fill: false,
      },
      {
        label: t('dashboard.observability.trendErrors', {
          defaultValue: 'Errors',
        }),
        data: trendPoints.map((pt) => pt.errors || 0),
        borderColor: 'rgba(220,38,38,1)',
        backgroundColor: 'rgba(220,38,38,0.15)',
        borderDash: [6, 4],
        yAxisID: 'y',
        tension: 0.3,
        fill: false,
      },
      {
        label: t('dashboard.observability.trendLatency', {
          defaultValue: 'P95 latency (ms)',
        }),
        data: trendPoints.map((pt) => pt.p95_latency_ms || 0),
        borderColor: 'rgba(16,185,129,1)',
        backgroundColor: 'rgba(16,185,129,0.1)',
        yAxisID: 'y1',
        tension: 0.3,
        fill: false,
      },
    ],
  };
  const trendChartOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: t('dashboard.observability.trendCountAxis', {
            defaultValue: 'Runs/errors',
          }),
        },
      },
      y1: {
        beginAtZero: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        title: {
          display: true,
          text: t('dashboard.observability.trendLatencyAxis', {
            defaultValue: 'Latency (ms)',
          }),
        },
      },
    },
  };
  const queueStages = observability?.queue?.stages || [];
  const recentFailures = observability?.recentFailures || [];
  const gateMetrics = observability?.gate || {};
  const gateCounts = gateMetrics.counts || {};
  const totalGateDecisions =
    typeof gateCounts.total === 'number'
      ? gateCounts.total
      : (gateCounts.allowed || 0) + (gateCounts.blocked || 0);
  const gateAllowed = gateCounts.allowed || 0;
  const gateBlocked = gateCounts.blocked || 0;
  const gateAllowedPct =
    totalGateDecisions > 0 ? (gateAllowed / totalGateDecisions) * 100 : null;
  const gateBlockedPct =
    totalGateDecisions > 0 ? (gateBlocked / totalGateDecisions) * 100 : null;
  const gateAvgEdits =
    typeof gateMetrics.avgEditsPerAllowed === 'number'
      ? gateMetrics.avgEditsPerAllowed
      : 0;
  const gateAllowedReasons = gateMetrics.allowedReasons || [];
  const gateBlockedReasons = gateMetrics.blockedReasons || [];
  const gateCostByRouteModel = gateMetrics.costByRouteModel || [];
  const totalBlockedReasons = gateBlockedReasons.reduce(
    (acc, item) => acc + (item?.count || 0),
    0,
  );
  const totalAllowedReasons = gateAllowedReasons.reduce(
    (acc, item) => acc + (item?.count || 0),
    0,
  );
  const backendBaseUrl =
    import.meta?.env?.VITE_API_URL ||
    (typeof window !== 'undefined' && window.__BACKEND_URL__) ||
    (typeof window !== 'undefined' && window.location
      ? window.location.origin
      : '');
  const observabilityWindowStart = observability?.window?.start
    ? formatTimestamp(observability.window.start)
    : null;
  const observabilityWindowEnd = observability?.window?.end
    ? formatTimestamp(observability.window.end)
    : null;
  const observabilityGeneratedAt = observability?.generatedAt
    ? formatTimestamp(observability.generatedAt)
    : null;
  const observabilityDescription = t('dashboard.observability.description', {
    hours: activeHoursWindow,
    defaultValue: 'Performance for the last {{hours}} hours.',
  });
  const observabilityWindowText =
    observabilityWindowStart && observabilityWindowEnd
      ? t('dashboard.observability.window', {
          defaultValue: 'Window: {{start}} → {{end}}',
          start: observabilityWindowStart,
          end: observabilityWindowEnd,
        })
      : null;
  const observabilityGeneratedText = observabilityGeneratedAt
    ? t('dashboard.observability.generatedAt', {
        defaultValue: 'Generated at {{ts}}',
        ts: observabilityGeneratedAt,
      })
    : null;

  useEffect(() => {
    let active = true;

    getMetrics(filters)
      .then((data) => {
        if (!active) return;
        setMetrics(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err.message === 'Unauthorized') {
          handleUnauthorized();
        } else {
          setError(err.message);
        }
      });

    getAlertSummary()
      .then((data) => {
        if (!active) return;
        setAlerts(data);
        setAlertError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err.message === 'Unauthorized') {
          handleUnauthorized();
        } else {
          setAlertError(err.message);
        }
      });

    return () => {
      active = false;
    };
  }, [filters, handleUnauthorized]);

  useEffect(() => {
    let active = true;

    getObservabilityStatus(observabilityFilters)
      .then((data) => {
        if (!active) return;
        setObservability(data);
        setObservabilityError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err.message === 'Unauthorized') {
          handleUnauthorized();
        } else {
          setObservabilityError(err.message);
        }
      });

    return () => {
      active = false;
    };
  }, [observabilityFilters, handleUnauthorized]);

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
      baseline: metrics.baseline?.avg_note_length
        ? metrics.baseline.avg_note_length.toFixed(1)
        : 0,
      current: metrics.current?.avg_note_length
        ? metrics.current.avg_note_length.toFixed(1)
        : 0,
      improvement: metrics.improvement?.avg_note_length,
      direction: 'higher',
    },
    {
      key: 'avg_beautify_time',
      title: t('dashboard.cards.avgBeautifyTime'),
      baseline: metrics.baseline?.avg_beautify_time
        ? metrics.baseline.avg_beautify_time.toFixed(1)
        : 0,
      current: metrics.current?.avg_beautify_time
        ? metrics.current.avg_beautify_time.toFixed(1)
        : 0,
      improvement: metrics.improvement?.avg_beautify_time,
      direction: 'lower',
    },
    {
      key: 'revenue_per_visit',
      title: t('dashboard.cards.revenuePerVisit'),
      baseline: metrics.baseline?.revenue_per_visit
        ? metrics.baseline.revenue_per_visit.toFixed(2)
        : 0,
      current: metrics.current?.revenue_per_visit
        ? metrics.current.revenue_per_visit.toFixed(2)
        : 0,
      improvement: metrics.improvement?.revenue_per_visit,
      direction: 'higher',
    },
    {
      key: 'revenue_projection',
      title: t('dashboard.cards.revenueProjection', {
        defaultValue: 'Revenue Projection',
      }),
      baseline: metrics.baseline?.revenue_projection
        ? metrics.baseline.revenue_projection.toFixed(2)
        : 0,
      current: metrics.current?.revenue_projection
        ? metrics.current.revenue_projection.toFixed(2)
        : 0,
      improvement: metrics.improvement?.revenue_projection,
      direction: 'higher',
    },
    {
      key: 'avg_time_to_close',
      title: t('dashboard.cards.avgCloseTime'),
      baseline: metrics.baseline?.avg_time_to_close
        ? metrics.baseline.avg_time_to_close.toFixed(1)
        : 0,
      current: metrics.current?.avg_time_to_close
        ? metrics.current.avg_time_to_close.toFixed(1)
        : 0,
      improvement: metrics.improvement?.avg_time_to_close,
      direction: 'lower',
    },
    {
      key: 'denial_rate',
      title: t('dashboard.cards.denialRate'),
      baseline: metrics.baseline?.denial_rate
        ? (metrics.baseline.denial_rate * 100).toFixed(1)
        : 0,
      current: metrics.current?.denial_rate
        ? (metrics.current.denial_rate * 100).toFixed(1)
        : 0,
      improvement: metrics.improvement?.denial_rate,
      direction: 'lower',
    },
    {
      key: 'deficiency_rate',
      title: t('dashboard.cards.deficiencyRate'),
      baseline: metrics.baseline?.deficiency_rate
        ? (metrics.baseline.deficiency_rate * 100).toFixed(1)
        : 0,
      current: metrics.current?.deficiency_rate
        ? (metrics.current.deficiency_rate * 100).toFixed(1)
        : 0,
      improvement: metrics.improvement?.deficiency_rate,
      direction: 'lower',
    },
    {
      title: t('dashboard.cards.avgSatisfaction'),
      baseline: 0,
      current: metrics.avg_satisfaction
        ? metrics.avg_satisfaction.toFixed(1)
        : 0,
      direction: 'higher',
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
      'avg_time_to_close',
      'revenue_projection',
      'revenue_per_visit',
      'denial_rate',
      'avg_satisfaction',
      'deficiency_rate',
    ];
    topLevel.forEach((k) => {
      if (metrics.current && k in metrics.current)
        rows.push([k, metrics.current[k]]);
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

  const exportPDF = () => {
    const doc = new jsPDF();
    let y = 10;
    cards.forEach((c) => {
      doc.text(`${c.title}: ${c.current}`, 10, y);
      y += 10;
    });
    doc.save('metrics.pdf');
  };

  const exportChartPNG = (ref, filename) => {
    if (!ref.current) return;
    const url = ref.current.toBase64Image();
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const exportChartCSV = (data, filename) => {
    const rows = [['date', ...data.labels]];
    data.datasets.forEach((ds) => {
      rows.push([ds.label, ...ds.data]);
    });
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
        label: t('dashboard.denials'),
        data: metrics.timeseries?.daily?.map((d) => d.denials || 0) || [],
        borderColor: 'rgba(255,0,0,1)',
        backgroundColor: 'rgba(255,0,0,0.2)',
      },
      {
        label: t('dashboard.deficiencies'),
        data: metrics.timeseries?.daily?.map((d) => d.deficiencies || 0) || [],
        borderColor: 'rgba(0,128,0,1)',
        backgroundColor: 'rgba(0,128,0,0.2)',
      },
      {
        label: t('dashboard.cards.avgNoteLength'),
        data:
          metrics.timeseries?.daily?.map((d) => d.avg_note_length || 0) || [],
        borderColor: 'rgba(99,255,132,1)',
        backgroundColor: 'rgba(99,255,132,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgBeautifyTime'),
        data:
          metrics.timeseries?.daily?.map((d) => d.avg_beautify_time || 0) || [],
        borderColor: 'rgba(255,205,86,1)',
        backgroundColor: 'rgba(255,205,86,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.revenuePerVisit'),
        data:
          metrics.timeseries?.daily?.map((d) => d.revenue_per_visit || 0) || [],
        borderColor: 'rgba(201,90,90,1)',
        backgroundColor: 'rgba(201,90,90,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgCloseTime'),
        data:
          metrics.timeseries?.daily?.map((d) => d.avg_time_to_close || 0) || [],
        borderColor: 'rgba(100,100,255,1)',
        backgroundColor: 'rgba(100,100,255,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.denialRate'),
        data:
          metrics.timeseries?.daily?.map((d) => (d.denial_rate || 0) * 100) ||
          [],
        borderColor: 'rgba(255,99,71,1)',
        backgroundColor: 'rgba(255,99,71,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.deficiencyRate'),
        data:
          metrics.timeseries?.daily?.map(
            (d) => (d.deficiency_rate || 0) * 100,
          ) || [],
        borderColor: 'rgba(0,128,128,1)',
        backgroundColor: 'rgba(0,128,128,0.2)',
        yAxisID: 'y1',
      },
    ],
  };

  const dailyOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
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
        label: t('dashboard.denials'),
        data: metrics.timeseries?.weekly?.map((w) => w.denials || 0) || [],
        borderColor: 'rgba(255,0,0,1)',
        backgroundColor: 'rgba(255,0,0,0.2)',
      },
      {
        label: t('dashboard.deficiencies'),
        data: metrics.timeseries?.weekly?.map((w) => w.deficiencies || 0) || [],
        borderColor: 'rgba(0,128,0,1)',
        backgroundColor: 'rgba(0,128,0,0.2)',
      },
      {
        label: t('dashboard.cards.avgNoteLength'),
        data:
          metrics.timeseries?.weekly?.map((w) => w.avg_note_length || 0) || [],
        borderColor: 'rgba(99,255,132,1)',
        backgroundColor: 'rgba(99,255,132,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgBeautifyTime'),
        data:
          metrics.timeseries?.weekly?.map((w) => w.avg_beautify_time || 0) ||
          [],
        borderColor: 'rgba(255,205,86,1)',
        backgroundColor: 'rgba(255,205,86,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.revenuePerVisit'),
        data:
          metrics.timeseries?.weekly?.map((w) => w.revenue_per_visit || 0) ||
          [],
        borderColor: 'rgba(201,90,90,1)',
        backgroundColor: 'rgba(201,90,90,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.avgCloseTime'),
        data:
          metrics.timeseries?.weekly?.map((w) => w.avg_time_to_close || 0) ||
          [],
        borderColor: 'rgba(100,100,255,1)',
        backgroundColor: 'rgba(100,100,255,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.denialRate'),
        data:
          metrics.timeseries?.weekly?.map((w) => (w.denial_rate || 0) * 100) ||
          [],
        borderColor: 'rgba(255,99,71,1)',
        backgroundColor: 'rgba(255,99,71,0.2)',
        yAxisID: 'y1',
      },
      {
        label: t('dashboard.cards.deficiencyRate'),
        data:
          metrics.timeseries?.weekly?.map(
            (w) => (w.deficiency_rate || 0) * 100,
          ) || [],
        borderColor: 'rgba(0,128,128,1)',
        backgroundColor: 'rgba(0,128,128,0.2)',
        yAxisID: 'y1',
      },
    ],
  };

  const weeklyOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: {
      y: { beginAtZero: true },
      y1: {
        beginAtZero: true,
        position: 'right',
        grid: { drawOnChartArea: false },
      },
    },
  };

  const hasDaily = (metrics.timeseries?.daily?.length || 0) > 0;
  const hasWeekly = (metrics.timeseries?.weekly?.length || 0) > 0;
  const noDataLabel = t('dashboard.noData', { defaultValue: 'No data' });

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
  const revenueLineOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: { y: { beginAtZero: true } },
  };

  const last30 = (metrics.timeseries?.daily || []).slice(-30);
  const revenueProjectionData = {
    labels: last30.map((d) => d.date),
    datasets: [
      {
        label: t('dashboard.cards.revenueProjection', {
          defaultValue: 'Revenue Projection',
        }),
        data: last30.map((d) => d.revenue_projection || 0),
        backgroundColor: 'rgba(0,123,255,0.5)',
        borderColor: 'rgba(0,123,255,1)',
      },
    ],
  };
  const revenueProjectionOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: { y: { beginAtZero: true } },
  };

  const denialRateLineData = {
    labels: last30.map((d) => d.date),
    datasets: [
      {
        label: t('dashboard.cards.denialRate'),
        data: last30.map((d) => (d.denial_rate || 0) * 100),
        borderColor: 'rgba(255,99,71,1)',
        backgroundColor: 'rgba(255,99,71,0.2)',
      },
    ],
  };
  const denialRateOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: { y: { beginAtZero: true, max: 100 } },
  };

  const emCodes = ['99212', '99213', '99214', '99215'];
  const codeBarData = {
    labels: emCodes,
    datasets: [
      {
        label: t('dashboard.codeDistribution'),
        data: emCodes.map((c) => metrics.coding_distribution?.[c] || 0),
        backgroundColor: 'rgba(54,162,235,0.6)',
      },
    ],
  };
  const codeBarOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };
  const denialDefData = {
    labels: [
      t('dashboard.cards.denialRate'),
      t('dashboard.cards.deficiencyRate'),
    ],
    datasets: [
      {
        label: t('dashboard.rate'),
        data: [
          metrics.current?.denial_rate ? metrics.current.denial_rate * 100 : 0,
          metrics.current?.deficiency_rate
            ? metrics.current.deficiency_rate * 100
            : 0,
        ],
        backgroundColor: ['rgba(255,159,64,0.6)', 'rgba(75, 192, 192, 0.6)'],
      },
    ],
  };
  const rateOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: { y: { beginAtZero: true, max: 100 } },
  };

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

  const gapEntries = metrics.top_compliance
    ? metrics.top_compliance
    : Object.entries(metrics.compliance_counts || {})
        .map(([gap, count]) => ({ gap, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
  const gapData = {
    labels: gapEntries.map((g) => g.gap),
    datasets: [
      {
        label: t('dashboard.gapCountLabel'),
        data: gapEntries.map((g) => g.count),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
      },
    ],
  };

  const denialOptions = {
    plugins: { tooltip: { enabled: true }, legend: { display: true } },
    scales: { y: { beginAtZero: true, max: 100 } },
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
        <button style={{ marginLeft: '0.5rem' }} onClick={applyFilters}>
          {t('dashboard.apply')}
        </button>
        <button style={{ marginLeft: '0.5rem' }} onClick={exportCSV}>
          {t('export')}
        </button>
        <button style={{ marginLeft: '0.5rem' }} onClick={exportPDF}>
          {t('clipboard.exportPdf')}
        </button>
      </div>
      {alertError && <p style={{ color: '#dc2626' }}>{alertError}</p>}
      {alerts && (
        <section
          className="dashboard-alerts"
          style={{ marginBottom: '1.5rem' }}
        >
          <h3>
            {t('dashboard.alerts.title', {
              defaultValue: 'Operational alerts',
            })}
          </h3>
          {alertsUpdated && (
            <p style={{ marginTop: 0 }}>
              {t('dashboard.alerts.lastUpdated', {
                defaultValue: 'Last updated: {{ts}}',
                ts: alertsUpdated,
              })}
            </p>
          )}
          <div
            className="dashboard-alerts-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {alertCards.map((card) => (
              <div
                key={card.key}
                className="dashboard-alert-card"
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  background: '#fff',
                }}
              >
                <h4 style={{ marginTop: 0 }}>{card.title}</h4>
                <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                  {card.count}
                </p>
                <p style={{ margin: '0.25rem 0' }}>{card.last}</p>
                {card.detail && (
                  <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                    {card.detail}
                  </p>
                )}
                {card.breakdown && (
                  <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                    {t('dashboard.alerts.breakdown', {
                      defaultValue: 'Breakdown: {{details}}',
                      details: card.breakdown,
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {observabilityError && (
        <p style={{ color: '#dc2626' }}>{observabilityError}</p>
      )}
      <section
        className="dashboard-observability"
        style={{
          marginBottom: '1.5rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          padding: '1rem',
          background: '#fff',
        }}
      >
        <h3>
          {t('dashboard.observability.title', {
            defaultValue: 'AI observability',
          })}
        </h3>
        <p style={{ marginTop: 0 }}>{observabilityDescription}</p>
        {observabilityGeneratedText && (
          <p style={{ margin: 0 }}>{observabilityGeneratedText}</p>
        )}
        {observabilityWindowText && (
          <p style={{ marginTop: '0.25rem' }}>{observabilityWindowText}</p>
        )}
        <div
          className="dashboard-observability-filters"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginTop: '1rem',
            marginBottom: '1rem',
          }}
        >
          <label>
            {t('dashboard.observability.filters.hours', {
              defaultValue: 'Window (hours)',
            })}
            <input
              type="number"
              min="1"
              max="168"
              value={observabilityInputs.hours}
              onChange={(e) =>
                setObservabilityInputs({
                  ...observabilityInputs,
                  hours: e.target.value,
                })
              }
              style={{ marginLeft: '0.35rem', width: '5.5rem' }}
            />
          </label>
          <label>
            {t('dashboard.observability.filters.route', {
              defaultValue: 'Route',
            })}
            <select
              value={observabilityInputs.route}
              onChange={(e) =>
                setObservabilityInputs({
                  ...observabilityInputs,
                  route: e.target.value,
                })
              }
              style={{ marginLeft: '0.35rem' }}
            >
              <option value="">
                {t('dashboard.allRoutes', { defaultValue: 'All routes' })}
              </option>
              {availableRouteOptions.map((routeOption) => (
                <option key={routeOption} value={routeOption}>
                  {routeOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('dashboard.observability.filters.limit', {
              defaultValue: 'Failure limit',
            })}
            <input
              type="number"
              min="1"
              max="200"
              value={observabilityInputs.limit}
              onChange={(e) =>
                setObservabilityInputs({
                  ...observabilityInputs,
                  limit: e.target.value,
                })
              }
              style={{ marginLeft: '0.35rem', width: '5.5rem' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" onClick={applyObservabilityFilters}>
              {t('dashboard.observability.filters.apply', {
                defaultValue: 'Apply observability filters',
              })}
            </button>
            <button type="button" onClick={resetObservabilityFilters}>
              {t('dashboard.observability.filters.reset', {
                defaultValue: 'Reset',
              })}
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {observabilityRoutes.length ? (
            <table
              className="observability-table"
              style={{ width: '100%', borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.route', {
                      defaultValue: 'Route',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.runs', {
                      defaultValue: 'Runs',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.successes', {
                      defaultValue: 'Successes',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.errors', {
                      defaultValue: 'Errors',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.successRate', {
                      defaultValue: 'Success rate',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.p50', {
                      defaultValue: 'P50 latency (ms)',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.p95', {
                      defaultValue: 'P95 latency (ms)',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.avgTokens', {
                      defaultValue: 'Avg tokens',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.totalTokens', {
                      defaultValue: 'Total tokens',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.cacheWarm', {
                      defaultValue: 'Warm hits',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.cacheCold', {
                      defaultValue: 'Cold hits',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.cacheOther', {
                      defaultValue: 'Other hits',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.totalCost', {
                      defaultValue: 'Total cost (USD)',
                    })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.observability.routes.costPerNote', {
                      defaultValue: 'Cost per note (USD)',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {observabilityRoutes.map((routeRow, index) => {
                  const successRate =
                    routeRow.runs > 0
                      ? (routeRow.successes / routeRow.runs) * 100
                      : null;
                  return (
                    <tr
                      key={`${routeRow.route || 'route'}-${index}`}
                      style={{ borderTop: '1px solid #e5e7eb' }}
                    >
                      <td style={{ padding: '0.5rem' }}>{routeRow.route}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.runs)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.successes)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.errors)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {successRate !== null
                          ? `${formatNumber(successRate, 1)}%`
                          : '–'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.latency?.p50_ms, 1)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.latency?.p95_ms, 1)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.tokens?.avg_total, 2)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.tokens?.total)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.cache?.warm)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.cache?.cold)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(routeRow.cache?.other)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatCurrency(routeRow.cost?.total_usd, 4)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatCurrency(routeRow.cost?.per_note_usd, 4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p>
              {t('dashboard.observability.noRoutes', {
                defaultValue: 'No AI route activity recorded in this window.',
              })}
            </p>
          )}
        </div>
        {activeTrendRoute && trendPoints.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h4>
              {t('dashboard.observability.trendTitle', {
                defaultValue: 'Route trend',
              })}
            </h4>
            <p style={{ marginTop: 0 }}>
              {t('dashboard.observability.trendDescription', {
                defaultValue: 'Hourly performance for {{route}}',
                route: activeTrendRoute,
              })}
            </p>
            <Line data={trendChartData} options={trendChartOptions} />
          </div>
        )}
        <div style={{ marginTop: '1.5rem' }}>
          <h4>
            {t('dashboard.observability.queueTitle', {
              defaultValue: 'Ingestion queue health',
            })}
          </h4>
          {queueStages.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                      {t('dashboard.observability.queueStage', {
                        defaultValue: 'Stage',
                      })}
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                      {t('dashboard.observability.queueStates', {
                        defaultValue: 'States',
                      })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.observability.queueWait', {
                        defaultValue: 'P95 wait (ms)',
                      })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.observability.queueRun', {
                        defaultValue: 'P95 run (ms)',
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queueStages.map((stage) => (
                    <tr key={stage.stage} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem' }}>{stage.stage}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {formatStateSummary(stage.states)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(stage.latency?.p95_wait_ms, 1)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatNumber(stage.latency?.p95_run_ms, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {t('dashboard.observability.queueEmpty', {
                defaultValue: 'No queue activity during this window.',
              })}
            </p>
          )}
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <h4>
            {t('dashboard.observability.recentFailures', {
              defaultValue: 'Recent failures',
            })}
          </h4>
          {recentFailures.length ? (
            <ul style={{ paddingLeft: '1.25rem' }}>
              {recentFailures.map((failure, index) => {
                const traceLink =
                  failure.traceUrl && backendBaseUrl
                    ? `${backendBaseUrl}${failure.traceUrl}`
                    : null;
                return (
                  <li
                    key={`${failure.traceId || failure.route || 'failure'}-${index}`}
                    style={{ marginBottom: '0.75rem' }}
                  >
                    <div>
                      <strong>
                        {failure.route ||
                          t('dashboard.observability.routes.route', {
                            defaultValue: 'Route',
                          })}
                      </strong>
                    </div>
                    {failure.occurredAt && (
                      <div>{formatTimestamp(failure.occurredAt)}</div>
                    )}
                    <div>
                      {t('dashboard.observability.errorDetail', {
                        defaultValue: 'Detail',
                      })}
                      : {failure.detail || '–'}
                    </div>
                    {failure.traceId && (
                      <div>
                        {t('dashboard.observability.traceId', {
                          defaultValue: 'Trace ID',
                        })}
                        : {failure.traceId}{' '}
                        {traceLink && (
                          <a href={traceLink} target="_blank" rel="noreferrer">
                            {t('dashboard.observability.traceLink', {
                              defaultValue: 'View trace',
                            })}
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>
              {t('dashboard.observability.recentNone', {
                defaultValue: 'No failures in this window.',
              })}
            </p>
          )}
        </div>
      </section>
      <section
        className="dashboard-ai-gate"
        style={{
          marginBottom: '1.5rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          padding: '1rem',
          background: '#fff',
        }}
      >
        <h3>
          {t('dashboard.aiGate.title', {
            defaultValue: 'AI gating overview',
          })}
        </h3>
        <p style={{ marginTop: 0 }}>
          {t('dashboard.aiGate.description', {
            defaultValue: 'Recent gating decisions for the selected window.',
          })}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
          }}
        >
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              background: '#f9fafb',
            }}
          >
            <h4 style={{ margin: 0 }}>
              {t('dashboard.aiGate.counts.allowed', { defaultValue: 'Allowed' })}
            </h4>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.35rem 0' }}>
              {formatNumber(gateAllowed)}
            </p>
            <p style={{ margin: 0, color: '#4b5563' }}>
              {totalGateDecisions
                ? t('dashboard.aiGate.countShare', {
                    defaultValue: '{{percent}} of decisions',
                    percent: formatPercent(gateAllowedPct),
                  })
                : t('dashboard.aiGate.noDecisions', {
                    defaultValue: 'No decisions recorded',
                  })}
            </p>
          </div>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              background: '#f9fafb',
            }}
          >
            <h4 style={{ margin: 0 }}>
              {t('dashboard.aiGate.counts.blocked', { defaultValue: 'Blocked' })}
            </h4>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.35rem 0' }}>
              {formatNumber(gateBlocked)}
            </p>
            <p style={{ margin: 0, color: '#4b5563' }}>
              {totalGateDecisions
                ? t('dashboard.aiGate.countShare', {
                    defaultValue: '{{percent}} of decisions',
                    percent: formatPercent(gateBlockedPct),
                  })
                : t('dashboard.aiGate.noDecisions', {
                    defaultValue: 'No decisions recorded',
                  })}
            </p>
          </div>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              background: '#f9fafb',
            }}
          >
            <h4 style={{ margin: 0 }}>
              {t('dashboard.aiGate.avgEdits', {
                defaultValue: 'Avg edits per allowed run',
              })}
            </h4>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.35rem 0' }}>
              {formatNumber(gateAvgEdits, 1)}
            </p>
            <p style={{ margin: 0, color: '#4b5563' }}>
              {t('dashboard.aiGate.totalDecisions', {
                defaultValue: 'Total decisions: {{count}}',
                count: formatNumber(totalGateDecisions),
              })}
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem',
          }}
        >
          <div>
            <h4>
              {t('dashboard.aiGate.blockedReasons', {
                defaultValue: 'Blocked reasons',
              })}
            </h4>
            {gateBlockedReasons.length ? (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.95rem',
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.reason', { defaultValue: 'Reason' })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.count', { defaultValue: 'Count' })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.share', { defaultValue: 'Share' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gateBlockedReasons.map((item) => {
                    const share =
                      totalBlockedReasons > 0
                        ? (item.count / totalBlockedReasons) * 100
                        : null;
                    return (
                      <tr key={`blocked-${item.reason}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.5rem' }}>{item.reason || '–'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          {formatNumber(item.count)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          {share !== null ? formatPercent(share) : '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p>
                {t('dashboard.aiGate.noReasons', {
                  defaultValue: 'No blocked decisions in this window.',
                })}
              </p>
            )}
          </div>
          <div>
            <h4>
              {t('dashboard.aiGate.allowedReasons', {
                defaultValue: 'Allowed triggers',
              })}
            </h4>
            {gateAllowedReasons.length ? (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.95rem',
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.reason', { defaultValue: 'Reason' })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.count', { defaultValue: 'Count' })}
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                      {t('dashboard.aiGate.share', { defaultValue: 'Share' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gateAllowedReasons.map((item) => {
                    const share =
                      totalAllowedReasons > 0
                        ? (item.count / totalAllowedReasons) * 100
                        : null;
                    return (
                      <tr key={`allowed-${item.reason}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.5rem' }}>{item.reason || '–'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          {formatNumber(item.count)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          {share !== null ? formatPercent(share) : '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p>
                {t('dashboard.aiGate.noAllowedReasons', {
                  defaultValue: 'No allowed decisions recorded.',
                })}
              </p>
            )}
          </div>
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <h4>
            {t('dashboard.aiGate.costTitle', {
              defaultValue: 'Cost by route/model',
            })}
          </h4>
          {gateCostByRouteModel.length ? (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                    {t('dashboard.aiGate.route', { defaultValue: 'Route' })}
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                    {t('dashboard.aiGate.model', { defaultValue: 'Model' })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.aiGate.calls', { defaultValue: 'Calls' })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.aiGate.totalCost', { defaultValue: 'Total cost' })}
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>
                    {t('dashboard.aiGate.avgCost', { defaultValue: 'Avg cost' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {gateCostByRouteModel.map((row, index) => (
                  <tr key={`${row.route || 'route'}-${row.model || 'model'}-${index}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{row.route || '–'}</td>
                    <td style={{ padding: '0.5rem' }}>{row.model || '–'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {formatNumber(row.calls)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {formatCurrency(row.totalUsd, 4)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {formatCurrency(row.avgUsd, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              {t('dashboard.aiGate.noCostData', {
                defaultValue: 'No cost data for this window.',
              })}
            </p>
          )}
        </div>
      </section>
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
            const arrow = effective > 0 ? '↑' : effective < 0 ? '↓' : '';
            const colour =
              effective > 0 ? '#2E7D32' : effective < 0 ? '#E57373' : 'inherit';
            const diffLabel =
              effective != null
                ? `${arrow} ${Math.abs(effective).toFixed(1)}%`
                : '';
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
          {hasDaily ? (
            <Line
              data={dailyData}
              options={dailyOptions}
              data-testid="daily-line"
            />
          ) : (
            <p data-testid="no-daily-data">{noDataLabel}</p>
          )}
          <h3 style={{ marginTop: '1rem' }}>{t('dashboard.weeklyEvents')}</h3>
          {hasWeekly ? (
            <Line
              data={weeklyData}
              options={weeklyOptions}
              data-testid="weekly-line"
            />
          ) : (
            <p data-testid="no-weekly-data">{noDataLabel}</p>
          )}
        </div>
      )}

      {metrics.timeseries && hasDaily && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.revenueOverTime')}</h3>
          <Line
            data={revenueLineData}
            options={revenueLineOptions}
            data-testid="revenue-line"
          />
        </div>
      )}

      {metrics.timeseries && hasDaily && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.revenueProjection')}</h3>
          <Bar
            ref={revenueBarRef}
            data={revenueProjectionData}
            options={revenueProjectionOptions}
            aria-label={t('dashboard.revenueProjectionAria')}
            role="img"
            data-testid="revenue-projection-bar"
          />
          <div>
            <button
              onClick={() =>
                exportChartPNG(revenueBarRef, 'revenue_projection.png')
              }
            >
              {t('dashboard.exportPng')}
            </button>
            <button
              style={{ marginLeft: '0.5rem' }}
              onClick={() =>
                exportChartCSV(revenueProjectionData, 'revenue_projection.csv')
              }
            >
              {t('dashboard.exportCsv')}
            </button>
          </div>
        </div>
      )}

      {metrics.timeseries && hasDaily && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.denialRateOverTime')}</h3>
          <Line
            ref={denialRateRef}
            data={denialRateLineData}
            options={denialRateOptions}
            aria-label={t('dashboard.denialRateAria')}
            role="img"
            data-testid="denial-rate-line"
          />
          <div>
            <button
              onClick={() => exportChartPNG(denialRateRef, 'denial_rate.png')}
            >
              {t('dashboard.exportPng')}
            </button>
            <button
              style={{ marginLeft: '0.5rem' }}
              onClick={() =>
                exportChartCSV(denialRateLineData, 'denial_rate.csv')
              }
            >
              {t('dashboard.exportCsv')}
            </button>
          </div>
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

      {metrics.denial_rates && Object.keys(metrics.denial_rates).length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.denialRates')}</h3>
          <Bar
            data={denialData}
            options={denialOptions}
            data-testid="denial-bar"
          />
        </div>
      )}

      {gapEntries.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{t('dashboard.documentationGaps')}</h3>
          <Bar
            data={gapData}
            options={{ scales: { y: { beginAtZero: true } } }}
            data-testid="gaps-bar"
          />
        </div>
      )}
      {metrics.template_usage &&
        Object.keys(metrics.template_usage.current || {}).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3>{t('dashboard.templateUsage')}</h3>
            <ul data-testid="template-usage-list">
              {Object.entries(metrics.template_usage.current).map(
                ([id, count]) => (
                  <li key={id}>
                    {t('dashboard.templateUsageItem', { id, count })}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
    </div>
  );
}

export default Dashboard;
