/* @vitest-environment jsdom */
import { render, cleanup } from '@testing-library/react';
import { test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.js', () => ({
  fetchLastTranscript: vi.fn(),
  getTemplates: vi.fn().mockResolvedValue([]),
  transcribeAudio: vi.fn(),

}));

import { fetchLastTranscript } from '../api.js';
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
  const { findByText, unmount } = render(
    <NoteEditor id="n1" value="" onChange={() => {}} />
  );
  await findByText(/Provider:/);
  expect(fetchLastTranscript).toHaveBeenCalledTimes(1);
  unmount();
  const { findByText: findByText2 } = render(
    <NoteEditor id="n1" value="" onChange={() => {}} />
  );
  await findByText2(/Provider:/);
  expect(fetchLastTranscript).toHaveBeenCalledTimes(2);
});

test('shows diarised output when available', async () => {
  fetchLastTranscript.mockResolvedValue({ provider: 'Doc', patient: 'Pat' });
  const { findByText } = render(
    <NoteEditor id="n2" value="" onChange={() => {}} />
  );
  await findByText(/Provider:/);
  await findByText(/Patient:/);
});
