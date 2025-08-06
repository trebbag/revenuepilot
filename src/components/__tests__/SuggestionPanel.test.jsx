/* @vitest-environment jsdom */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import '../../i18n.js';
import SuggestionPanel from '../SuggestionPanel.jsx';

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

test('renders follow-up with calendar link', () => {
  const { getByText } = render(
    <SuggestionPanel
      suggestions={{
        codes: [],
        compliance: [],
        publicHealth: [],
        differentials: [],
        followUp: { interval: '3 months', ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
      }}
      settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true, enableFollowUp: true }}
    />
  );
  expect(getByText('3 months')).toBeTruthy();
  const href = getByText('Add to calendar').getAttribute('href');
  expect(href).toContain('text/calendar');
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

test('debounces backend calls on rapid input', async () => {
  vi.useFakeTimers();
  const fetchSuggestions = vi.fn();
  const baseProps = {
    suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [] },
    settingsState: null,
    fetchSuggestions,
  };
  const { rerender } = render(
    <SuggestionPanel {...baseProps} text="a" />,
  );
  // Simulate rapid consecutive updates
  rerender(<SuggestionPanel {...baseProps} text="ab" />);
  rerender(<SuggestionPanel {...baseProps} text="abc" />);
  // No call should happen until the debounce period elapses
  expect(fetchSuggestions).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(fetchSuggestions).toHaveBeenCalledTimes(1);
  expect(fetchSuggestions).toHaveBeenCalledWith('abc', { specialty: '', payer: '' });
  vi.useRealTimers();
});

test('changing specialty or payer triggers fetch', () => {
  const fetchSuggestions = vi.fn();
  const { getByLabelText } = render(
    <SuggestionPanel
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={{ specialty: '', payer: '' }}
      text="note"
      fetchSuggestions={fetchSuggestions}
    />,
  );
  fireEvent.change(getByLabelText('Specialty'), { target: { value: 'cardiology' } });
  expect(fetchSuggestions).toHaveBeenLastCalledWith('note', { specialty: 'cardiology', payer: '' });
  fireEvent.change(getByLabelText('Payer'), { target: { value: 'medicare' } });
  expect(fetchSuggestions).toHaveBeenLastCalledWith('note', { specialty: 'cardiology', payer: 'medicare' });
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
