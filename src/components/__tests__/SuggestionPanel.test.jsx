/* @vitest-environment jsdom */
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import '../../i18n.js';
import SuggestionPanel from '../SuggestionPanel.jsx';
import * as api from '../../api.js';

afterEach(() => cleanup());

test('renders suggestions and handles click', () => {
  const onInsert = vi.fn();
  const { getAllByText, getByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [{ code: 'A', rationale: 'reason' }],
        compliance: [],
        publicHealth: [
          {
            recommendation: 'Flu shot',
            reason: 'Prevents influenza',
            source: 'CDC',
            evidenceLevel: 'A',
          },
        ],
        differentials: [],
      }}

      settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true }}
      onInsert={onInsert}
    />
  );
  const el = getAllByText((_, el) => el.textContent.startsWith('A — reason')).find(
    (node) => node.tagName === 'LI'
  );
  fireEvent.click(el);
  expect(onInsert).toHaveBeenCalledWith('A — reason');
  expect(getByText('Prevents influenza')).toBeTruthy();
  expect(getByText('CDC (A)')).toBeTruthy();
});

test('filters public health suggestions by region', () => {
  const { getByText, queryByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [
          { recommendation: 'US rec', region: 'US' },
          { recommendation: 'EU rec', region: 'EU' },
        ],
        differentials: [],
      }}
      settingsState={{ enablePublicHealth: true, region: 'US' }}
    />
  );
  expect(getByText('US rec')).toBeTruthy();
  expect(queryByText('EU rec')).toBeNull();
});

test('toggles public health suggestions visibility', () => {
  const { getByText, queryByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [{ recommendation: 'Flu shot' }],
        differentials: [],
      }}
      settingsState={{ enablePublicHealth: true }}
    />
  );
  expect(getByText('Flu shot')).toBeTruthy();
  const toggle = getByText('Hide Suggestions');
  fireEvent.click(toggle);
  expect(queryByText('Flu shot')).toBeNull();
  fireEvent.click(getByText('Show Suggestions'));
  expect(getByText('Flu shot')).toBeTruthy();
});

test('shows loading and toggles sections', () => {
  const { getByText, getAllByText } = render(
    <SuggestionPanel loading settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true }} />
  );
  expect(getAllByText('Loading suggestions...').length).toBeGreaterThan(0);
  const header = getByText('Codes & Rationale');
  fireEvent.click(header);
  expect(header.parentElement?.parentElement.querySelector('ul')).toBeNull();
});

test('exports follow-up to calendar on click', async () => {
  const icsText =
    'BEGIN:VCALENDAR\nDTSTART:20240101T000000Z\nDTEND:20240101T000000Z\nEND:VEVENT\nEND:VCALENDAR';
  vi.spyOn(api, 'exportFollowUp').mockResolvedValue(icsText);
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  const { getByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [],
        differentials: [],
        followUp: { interval: '3 months', reason: 'rule' },
      }}
      settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true, enableFollowUp: true }}
      calendarSummary="John Doe"
    />
  );
  fireEvent.click(getByText('Add to calendar'));
  await waitFor(() =>
    expect(api.exportFollowUp).toHaveBeenCalledWith('3 months', 'John Doe')
  );
  await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  const anchor = clickSpy.mock.instances[0];
  const decoded = decodeURIComponent(anchor.href.split(',')[1]);
  expect(decoded).toContain('DTSTART');
  expect(decoded).toContain('DTEND');
});

test('hides follow-up when disabled', () => {
  const { queryByText } = render(
    <SuggestionPanel
      suggestions={{ followUp: { interval: '3 months', ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' } }}
      settingsState={{ enableFollowUp: false }}
    />
  );
  expect(queryByText('3 months')).toBeNull();
});

test('renders differential scores as percentages', () => {
  const { getByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [],
        differentials: [{ diagnosis: 'Flu', score: 0.42 }],
      }}
      settingsState={{ enableDifferentials: true }}
    />
  );
  expect(getByText('Flu — 42%')).toBeTruthy();
});

test('small edits do not trigger auto gating', async () => {
  const fetchSuggestions = vi.fn();
  const gateSuggestions = vi.fn();
  const baseProps = {
    suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [] },
    settingsState: null,
    fetchSuggestions,
    gateSuggestions,
    text: 'Initial note',
  };
  const { rerender } = render(<SuggestionPanel {...baseProps} />);
  rerender(<SuggestionPanel {...baseProps} text="Initial note updated" />);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(gateSuggestions).not.toHaveBeenCalled();
  expect(fetchSuggestions).not.toHaveBeenCalled();
});

test('salient newline triggers auto gating', async () => {
  const fetchSuggestions = vi.fn().mockResolvedValue({});
  const gateSuggestions = vi
    .fn()
    .mockResolvedValue({ status: 409, blocked: true, detail: { delta: 20, manualThreshold: 80, salient: true } });
  const baseProps = {
    suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [] },
    settingsState: null,
    fetchSuggestions,
    gateSuggestions,
    text: 'Start.',
  };
  const { rerender } = render(<SuggestionPanel {...baseProps} />);
  rerender(
    <SuggestionPanel
      {...baseProps}
      text={'Start.\nBP 120/80 recorded'}
      gateSuggestions={gateSuggestions}
      fetchSuggestions={fetchSuggestions}
    />,
  );
  await waitFor(() => expect(gateSuggestions).toHaveBeenCalledTimes(1));
});

test('refresh button enables on salient gate and calls manual intent', async () => {
  const fetchSuggestions = vi.fn().mockResolvedValue({});
  const gateSuggestions = vi
    .fn()
    .mockResolvedValue({ status: 409, blocked: true, detail: { delta: 10, manualThreshold: 60, salient: true } });
  const { rerender, getByRole } = render(
    <SuggestionPanel
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={null}
      text="Baseline."
      fetchSuggestions={fetchSuggestions}
      gateSuggestions={gateSuggestions}
    />,
  );
  rerender(
    <SuggestionPanel
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={null}
      text={'Baseline.\nNew salient entry'}
      fetchSuggestions={fetchSuggestions}
      gateSuggestions={gateSuggestions}
    />,
  );
  await waitFor(() => expect(gateSuggestions).toHaveBeenCalledTimes(1));
  const refreshButton = getByRole('button', { name: /refresh/i });
  expect(refreshButton).not.toBeDisabled();
  fireEvent.click(refreshButton);
  await waitFor(() =>
    expect(fetchSuggestions).toHaveBeenCalledWith(
      'Baseline.\nNew salient entry',
      expect.objectContaining({ specialty: '', payer: '', intent: 'manual' }),
    ),
  );
});

test('refresh button honors server enable flag and shows CTA when confidence is low', async () => {
  const fetchSuggestions = vi.fn().mockResolvedValue({});
  const { getByRole, findByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [],
        differentials: [],
        enableManual: true,
        lowConfidence: true,
      }}
      settingsState={null}
      text={'Baseline.\nMeaningful change'}
      fetchSuggestions={fetchSuggestions}
    />,
  );
  const refreshButton = getByRole('button', { name: /refresh/i });
  await waitFor(() => expect(refreshButton).not.toBeDisabled());
  expect(await findByText('Consider High-Accuracy')).toBeTruthy();
});

test('changing specialty or payer triggers gate, fetch, and notifies parent', async () => {
  const fetchSuggestions = vi.fn().mockResolvedValue({});
  const gateSuggestions = vi
    .fn()
    .mockResolvedValue({ status: 202, allowed: true, detail: { delta: 120, manualThreshold: 60 } });
  const handleSpecialtyChange = vi.fn();
  const handlePayerChange = vi.fn();
  const { getByLabelText, rerender } = render(
    <SuggestionPanel
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={{ specialty: '', payer: '' }}
      text={'note.\n'}
      fetchSuggestions={fetchSuggestions}
      gateSuggestions={gateSuggestions}
      onSpecialtyChange={handleSpecialtyChange}
      onPayerChange={handlePayerChange}
    />,
  );
  await waitFor(() => expect(gateSuggestions).toHaveBeenCalled());
  gateSuggestions.mockClear();
  fetchSuggestions.mockClear();

  fireEvent.change(getByLabelText('Specialty'), { target: { value: 'cardiology' } });
  expect(handleSpecialtyChange).toHaveBeenCalledWith('cardiology');
  await waitFor(() => expect(gateSuggestions).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(fetchSuggestions).toHaveBeenCalledWith(
      'note.\n',
      expect.objectContaining({ specialty: 'cardiology', payer: '', intent: 'auto' }),
    ),
  );

  gateSuggestions.mockClear();
  fetchSuggestions.mockClear();
  rerender(
    <SuggestionPanel
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={{ specialty: 'cardiology', payer: '' }}
      text={'note.\n'}
      fetchSuggestions={fetchSuggestions}
      gateSuggestions={gateSuggestions}
      onSpecialtyChange={handleSpecialtyChange}
      onPayerChange={handlePayerChange}
    />,
  );
  fireEvent.change(getByLabelText('Payer'), { target: { value: 'medicare' } });
  expect(handlePayerChange).toHaveBeenCalledWith('medicare');
  await waitFor(() => expect(gateSuggestions).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(fetchSuggestions).toHaveBeenCalledWith(
      'note.\n',
      expect.objectContaining({ specialty: 'cardiology', payer: 'medicare', intent: 'auto' }),
    ),
  );
});

test('handles missing or invalid differential scores gracefully', () => {
  const { getByText, queryByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [],
        differentials: [
          { diagnosis: 'NoScore' },
          { diagnosis: 'BadScore', score: 'oops' },
          { diagnosis: 'TooHigh', score: 2 },
        ],
      }}
      settingsState={{ enableDifferentials: true }}
    />
  );
  expect(getByText('NoScore')).toBeTruthy();
  expect(getByText('BadScore')).toBeTruthy();
  expect(getByText('TooHigh')).toBeTruthy();
  expect(queryByText(/NoScore\s+—/)).toBeNull();
  expect(queryByText(/BadScore\s+—/)).toBeNull();
  expect(queryByText(/TooHigh\s+—/)).toBeNull();
});
