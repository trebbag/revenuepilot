/* @vitest-environment jsdom */
import React from 'react';
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { vi, beforeEach, test, expect, afterEach } from 'vitest';

vi.mock('react-chartjs-2', () => {
  const React = require('react');
  return {
    Line: React.forwardRef(({ data, ...props }, ref) => (
      <canvas data-chart={JSON.stringify(data)} ref={ref} {...props} />
    )),
    Bar: React.forwardRef(({ data, ...props }, ref) => (
      <canvas data-chart={JSON.stringify(data)} ref={ref} {...props} />
    )),
  };
});

vi.mock('jspdf', () => ({
  default: vi.fn(() => ({ text: vi.fn(), save: vi.fn() })),
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
      avg_time_to_close: 0,
      revenue_per_visit: 0,
      revenue_projection: 0,
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
      avg_time_to_close: 90,
      revenue_per_visit: 100,
       revenue_projection: 100,
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
          revenue_projection: 100,
          avg_time_to_close: 90,
          denial_rate: 0.1,
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
          revenue_projection: 100,
          avg_time_to_close: 90,
          denial_rate: 0.1,
        },
      ],
    },
  }),
}));

import Dashboard from '../Dashboard.jsx';
import i18n from '../../i18n.js';
import jsPDF from 'jspdf';

HTMLCanvasElement.prototype.getContext = vi.fn();
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
  expect(document.querySelector('[data-testid="codes-bar"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-bar"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-def-bar"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="revenue-line"]')).toBeTruthy();
  expect(
    document.querySelector('[data-testid="revenue-projection-bar"]'),
  ).toBeTruthy();
  expect(document.querySelector('[data-testid="denial-rate-line"]')).toBeTruthy();
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

test('exports metrics as CSV', async () => {
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();

  const { getByText } = render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  fireEvent.click(getByText('Export'));
  expect(clickSpy).toHaveBeenCalled();

  clickSpy.mockRestore();

});

test('exports metrics as PDF', async () => {
  const { getByText } = render(<Dashboard />);
  await waitFor(() => document.querySelector('[data-testid="daily-line"]'));
  fireEvent.click(getByText('Export PDF'));
  expect(jsPDF).toHaveBeenCalled();
  const instance = jsPDF.mock.results[0].value;
  expect(instance.save).toHaveBeenCalled();
});
