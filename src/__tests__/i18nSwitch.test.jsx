/* @vitest-environment jsdom */
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { test, expect, vi, beforeEach } from 'vitest';
import i18n from '../i18n.js';
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
  i18n.changeLanguage('en');
});

test('switches to Spanish and shows translated UI', async () => {
  localStorage.setItem('token', 'a.eyJyb2xlIjoiYWRtaW4ifQ==.c');
  const { getByText, getAllByText, getByLabelText } = render(<App />);

  await waitFor(() => getByText('Beautify'));

  fireEvent.click(getAllByText('Settings')[0]);
  fireEvent.change(getByLabelText('Language'), { target: { value: 'es' } });

  fireEvent.click(getByText('Notas'));
  await waitFor(() => getByText('Embellecer'));

  fireEvent.click(getByText('Analíticas'));
  await waitFor(() => getByText('Panel de análisis'));
});


