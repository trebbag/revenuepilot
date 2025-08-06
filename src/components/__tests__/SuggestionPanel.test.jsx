/* @vitest-environment jsdom */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import '../../i18n.js';
import SuggestionPanel from '../SuggestionPanel.jsx';

afterEach(() => cleanup());

test('renders suggestions and handles click', () => {
  const onInsert = vi.fn();
  const { getByText } = render(
    <SuggestionPanel suggestions={{ codes: ['A'], compliance: [], publicHealth: [], differentials: [] }} onInsert={onInsert} />
  );
  fireEvent.click(getByText('A'));
  expect(onInsert).toHaveBeenCalledWith('A');
});

test('shows loading and toggles sections', () => {
  const { getByText, getAllByText } = render(<SuggestionPanel loading />);
  expect(getAllByText('Loading suggestions...').length).toBeGreaterThan(0);
  const header = getByText('Codes & Rationale');
  fireEvent.click(header);
  expect(header.parentElement?.parentElement.querySelector('ul')).toBeNull();
});

test('renders follow-up with calendar link', () => {
  const { getByText } = render(
    <SuggestionPanel suggestions={{ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: '3 months' }} />
  );
  expect(getByText('3 months')).toBeTruthy();
  const href = getByText('Add to calendar').getAttribute('href');
  expect(href).toContain('text/calendar');
});
