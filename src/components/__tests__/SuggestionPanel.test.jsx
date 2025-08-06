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
        publicHealth: [{ recommendation: 'Flu shot', reason: 'Prevents influenza' }],
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
      suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: '3 months' }}
      settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true }}
    />
  );
  expect(getByText('3 months')).toBeTruthy();
  const href = getByText('Add to calendar').getAttribute('href');
  expect(href).toContain('text/calendar');
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
