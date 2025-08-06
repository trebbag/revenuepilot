/* @vitest-environment jsdom */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import '../../i18n.js';
import SuggestionPanel from '../SuggestionPanel.jsx';

afterEach(() => cleanup());

test('renders suggestions and handles click', () => {
  const onInsert = vi.fn();
  const { getAllByText } = render(
    <SuggestionPanel
      suggestions={{ codes: [{ code: 'A', rationale: 'reason' }], compliance: [], publicHealth: [], differentials: [] }}
      settingsState={{ enableCodes: true, enableCompliance: true, enablePublicHealth: true, enableDifferentials: true }}
      onInsert={onInsert}
    />
  );
  const el = getAllByText((_, el) => el.textContent === 'A — reason').find(
    (node) => node.tagName === 'LI'
  );
  fireEvent.click(el);
  expect(onInsert).toHaveBeenCalledWith('A — reason');
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
