/* @vitest-environment jsdom */
import { render, fireEvent, waitFor } from '@testing-library/react';
import { test, expect, vi, beforeEach } from 'vitest';
import '../i18n.js';
import App from '../App.jsx';

vi.mock('../api.js', () => ({
  getSettings: vi.fn().mockResolvedValue({
    theme: 'modern',
    lang: 'en',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    region: '',
    agencies: ['CDC', 'WHO'],
  }),
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: '', patient: '' }),
  getMetrics: vi.fn().mockResolvedValue({}),
  getTemplates: vi.fn().mockResolvedValue([]),
  getPromptTemplates: vi.fn().mockResolvedValue([]),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  saveSettings: vi.fn(async (s) => s),
}));

vi.mock('react-chartjs-2', () => ({
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
}));

vi.mock('chart.js', () => ({
  Chart: class { static register() {} },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  BarElement: {},
  ArcElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));
  vi.stubGlobal('alert', vi.fn());
  localStorage.clear();
  vi.clearAllMocks();
});

test('switches to Spanish and shows translated UI', async () => {
  localStorage.setItem('token', 'a.eyJyb2xlIjoiYWRtaW4ifQ==.c');
  const { getByText, getByLabelText } = render(<App />);

  await waitFor(() => getByText('Beautify'));

  fireEvent.click(getByText('Settings'));
  fireEvent.change(getByLabelText('Language'), { target: { value: 'es' } });

  fireEvent.click(getByText('Notas'));
  await waitFor(() => getByText('Embellecer'));

  fireEvent.click(getByText('Analíticas'));
  await waitFor(() => getByText('Panel de análisis'));
});

