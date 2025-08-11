/* @vitest-environment jsdom */
import { render, waitFor } from '@testing-library/react';
import { test, expect, vi, beforeEach } from 'vitest';
import '../i18n.js';
import App from '../App.jsx';

vi.mock('../api.js', () => ({
  pingBackend: vi.fn().mockResolvedValue(true),
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

  getSuggestions: vi
    .fn()
    .mockResolvedValue({ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: null }),

  getTemplates: vi.fn().mockResolvedValue([]),

}));

// Mock fetch for loading default templates and reset state before each test
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));
  localStorage.clear();
  vi.clearAllMocks();
});

test('renders login form when no token', () => {
  const { getByLabelText } = render(<App />);
  expect(getByLabelText(/username/i)).toBeTruthy();
});

test('renders main app when token present', async () => {
  localStorage.setItem('token', 'abc');
  const { getByText } = render(<App />);
  await waitFor(() => expect(getByText('Beautify')).toBeTruthy());
});
