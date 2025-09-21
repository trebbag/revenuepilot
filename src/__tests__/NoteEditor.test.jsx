/* @vitest-environment jsdom */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.js', () => ({
  fetchLastTranscript: vi.fn(),
  getSuggestions: vi
    .fn()
    .mockResolvedValue({
      codes: [],
      compliance: [],
      publicHealth: [],
      differentials: [],
      followUp: null,
    }),
  getTemplates: vi.fn().mockResolvedValue([]),
  transcribeAudio: vi.fn(),
  exportToEhr: vi.fn().mockResolvedValue({ status: 'exported' }),
  searchPatients: vi
    .fn()
    .mockResolvedValue({
      patients: [],
      externalPatients: [],
      pagination: { query: '', limit: 25, offset: 0, returned: 0, total: 0, hasMore: false },
    }),
  validateEncounter: vi.fn().mockResolvedValue({ valid: true, encounterId: '101' }),
}));

import {
  fetchLastTranscript,
  exportToEhr,
  searchPatients,
  validateEncounter,
} from '../api.js';
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
  await findByText('Transcript:');
  await findByText(/Provider:/);
  expect(fetchLastTranscript).toHaveBeenCalledTimes(1);
  unmount();
  const { findByText: findByText2 } = render(
    <NoteEditor id="n1" value="" onChange={() => {}} />
  );
  await findByText2('Transcript:');
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

test('patient lookup surfaces suggestions and emits selection', async () => {
  searchPatients.mockResolvedValueOnce({
    patients: [
      {
        patientId: '123',
        name: 'Anna Adams',
        mrn: 'MRN-1',
        dob: '1990-01-01',
      },
    ],
    externalPatients: [],
    pagination: { query: 'ann', limit: 25, offset: 0, returned: 1, total: 1, hasMore: false },
  });
  const handlePatient = vi.fn();
  const { getByLabelText, findByRole } = render(
    <NoteEditor id="p1" value="" onChange={() => {}} onPatientIdChange={handlePatient} />,
  );
  fireEvent.change(getByLabelText('Patient'), { target: { value: 'Ann' } });
  await waitFor(() => expect(searchPatients).toHaveBeenCalledWith('Ann', expect.any(Object)));
  const option = await findByRole('option', { name: /Anna Adams/ });
  fireEvent.click(option);
  expect(handlePatient).toHaveBeenCalledWith('123');
});

test('encounter validation reports results and calls callback', async () => {
  validateEncounter.mockResolvedValueOnce({
    valid: true,
    encounterId: '9001',
  });
  const handleEncounter = vi.fn();
  const { getByLabelText } = render(
    <NoteEditor
      id="p2"
      value=""
      onChange={() => {}}
      patientId="42"
      onEncounterChange={handleEncounter}
    />,
  );
  const encounterField = getByLabelText('Encounter');
  fireEvent.change(encounterField, { target: { value: '9001' } });
  await waitFor(() =>
    expect(validateEncounter).toHaveBeenCalledWith('9001', '42', expect.any(Object)),
  );
  await waitFor(() => expect(handleEncounter).toHaveBeenCalled());
  expect(handleEncounter.mock.calls[0][0]).toBe('9001');
  expect(handleEncounter.mock.calls[0][1]).toMatchObject({ valid: true });
});
