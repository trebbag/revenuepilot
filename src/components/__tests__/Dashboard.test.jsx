/* @vitest-environment jsdom */
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';
import Dashboard from '../Dashboard.jsx';
import { vi, beforeEach, test, expect, afterEach } from 'vitest';
import i18n from '../../i18n.js';

HTMLCanvasElement.prototype.getContext = vi.fn();

vi.mock('react-chartjs-2', () => ({
  Line: (props) => <canvas {...props} />,
  Bar: (props) => <canvas {...props} />,
  Pie: (props) => <canvas {...props} />,
}));

vi.mock('../../api.js', () => ({
  getMetrics: vi.fn().mockResolvedValue({
    baseline: {
      total_notes: 0,
      total_beautify: 0,
      total_suggest: 0,
      total_summary: 0,
      total_chart_upload: 0,
      total_audio: 0,
      avg_note_length: 0,
      avg_beautify_time: 0,
      avg_close_time: 0,
      revenue_per_visit: 0,
      denial_rate: 0,
      deficiency_rate: 0,
    },
    current: {
      total_notes: 1,
      total_beautify: 1,
      total_suggest: 1,
      total_summary: 1,
      total_chart_upload: 1,
      total_audio: 1,
      avg_note_length: 10,
      avg_beautify_time: 5,
      avg_close_time: 90,
      revenue_per_visit: 100,
      denial_rate: 0.1,
      deficiency_rate: 0.2,
    },
    improvement: {},
    coding_distribution: { '99213': 2 },
    denial_rates: { '99213': 0.1 },
    compliance_counts: { Missing: 1 },
    avg_satisfaction: 0,
    public_health_rate: 0,
    clinicians: ['alice', 'bob'],
    timeseries: {
      daily: [
        {
          date: '2024-01-01',
          notes: 1,
          beautify: 1,
          suggest: 0,
          summary: 0,
          chart_upload: 0,
          audio: 0,
        },
      ],
      weekly: [
        {
          week: '2024-01',
          notes: 1,
          beautify: 1,
          suggest: 0,
          summary: 0,
          chart_upload: 0,
          audio: 0,
        },
      ],
    },
  }),
}));
import { getMetrics } from '../../api.js';

afterEach(() => {
  cleanup();
});

const token = [
  btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })),
  btoa(JSON.stringify({ role: 'admin' })),
  '',
].join('.');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem('token', token);
});

test('renders charts and calls API', async () => {
  render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  expect(getMetrics).toHaveBeenCalled();
  expect(document.querySelector('[data-testid="daily-line"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="weekly-line"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="codes-pie"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-bar"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-def-bar"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="revenue-line"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="gaps-bar"]')).toBeTruthy();
});

test('applies date range filters', async () => {
  const { getByLabelText, getByText } = render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  const startInput = getByLabelText('Start');
  const endInput = getByLabelText('End');
  const clinicianSelect = getByLabelText('Clinician');
  fireEvent.change(startInput, { target: { value: '2024-01-01' } });
  fireEvent.change(endInput, { target: { value: '2024-01-07' } });
  fireEvent.change(clinicianSelect, { target: { value: 'alice' } });
  getByText('Apply').click();
  await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(2));
  expect(getMetrics).toHaveBeenLastCalledWith({ start: '2024-01-01', end: '2024-01-07', clinician: 'alice' });
});

test('denies access when user not admin', () => {
  localStorage.setItem(
    'token',
    [
      btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })),
      btoa(JSON.stringify({ role: 'user' })),
      '',
    ].join('.')
  );
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  render(<Dashboard />);
  expect(alertSpy).toHaveBeenCalled();
});

test('applies clinician filter', async () => {
  const { getByLabelText, getByText } = render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  const clinicianInput = getByLabelText('Clinician');
  fireEvent.change(clinicianInput, { target: { value: 'alice' } });
  getByText('Apply').click();
  await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(2));
  expect(getMetrics).toHaveBeenLastCalledWith({
    start: '',
    end: '',
    clinician: 'alice',
  });
});

test('applies quick range filter', async () => {
  const { findByLabelText, getByText } = render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  const rangeSelect = await findByLabelText(i18n.t('dashboard.range'));
  fireEvent.change(rangeSelect, { target: { value: '7' } });
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setDate(now.getDate() - 7);
  const start = startDate.toISOString().slice(0, 10);
  getByText('Apply').click();
  await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(2));
  expect(getMetrics).toHaveBeenLastCalledWith({ start, end, clinician: '' });

});
