/* @vitest-environment jsdom */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.js', () => ({
  fetchLastTranscript: vi.fn(),

  getSuggestions: vi
    .fn()
    .mockResolvedValue({ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: null }),

  getTemplates: vi.fn().mockResolvedValue([]),
  transcribeAudio: vi.fn(),
  exportToEhr: vi.fn().mockResolvedValue({ status: 'exported' }),

}));

import { fetchLastTranscript } from '../api.js';
import { exportToEhr } from '../api.js';
import '../i18n.js';
import NoteEditor from '../components/NoteEditor.jsx';

beforeEach(() => {
  fetchLastTranscript.mockResolvedValue({ provider: 'hello', patient: 'world' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('transcript persists across reloads', async () => {
  const { findByText, getByText, unmount } = render(
    <NoteEditor id="n1" value="" onChange={() => {}} />
  );
  fireEvent.click(getByText('Transcript:'));
  await findByText(/Provider:/);
  expect(fetchLastTranscript).toHaveBeenCalledTimes(1);
  unmount();
  const { findByText: findByText2, getByText: getByText2 } = render(
    <NoteEditor id="n1" value="" onChange={() => {}} />
  );
  fireEvent.click(getByText2('Transcript:'));
  await findByText2(/Provider:/);
  expect(fetchLastTranscript).toHaveBeenCalledTimes(2);
});

test('shows diarised output when available', async () => {
  fetchLastTranscript.mockResolvedValue({ provider: 'Doc', patient: 'Pat' });
  const { findByText, getByText } = render(
    <NoteEditor id="n2" value="" onChange={() => {}} />
  );
  fireEvent.click(getByText('Transcript:'));
  await findByText(/Provider:/);
  await findByText(/Patient:/);
});

test('displays error when transcript load fails', async () => {
  fetchLastTranscript.mockRejectedValue(new Error('boom'));
  const { findByText } = render(
    <NoteEditor id="n3" value="" onChange={() => {}} />
  );
  await findByText('Failed to load transcript');
});

test('EHR export button triggers API call', async () => {
  const { getByText } = render(
    <NoteEditor
      id="be"
      value="Final"
      onChange={() => {}}
      mode="beautified"
    />,
  );
  fireEvent.click(getByText('Export to EHR'));
  await waitFor(() => expect(exportToEhr).toHaveBeenCalled());
});
