/* @vitest-environment jsdom */
import { render, waitFor, cleanup } from '@testing-library/react';
import Dashboard from '../Dashboard.jsx';
import { vi, beforeEach, test, expect, afterEach } from 'vitest';

HTMLCanvasElement.prototype.getContext = vi.fn();

vi.mock('../../api.js', () => ({
  getMetrics: vi.fn().mockResolvedValue({
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
    coding_distribution: { '99213': 2 },
    denial_rate: 0.1,
    denial_rates: { '99213': 0.1 },
    deficiency_rate: 0.2,
    timeseries: { daily: [{ date: '2024-01-01', count: 1 }], weekly: [{ week: '2024-01', count: 1 }] },
  }),
}));

afterEach(() => {
  cleanup();
});

const token = [
  btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })),
  btoa(JSON.stringify({ role: 'admin' })),
  '',
].join('.');

beforeEach(() => {
  localStorage.setItem('token', token);
});

test('renders charts', async () => {
  render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  expect(document.querySelector('[data-testid="daily-line"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="weekly-line"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="codes-pie"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-bar"]')).toBeTruthy();
});
