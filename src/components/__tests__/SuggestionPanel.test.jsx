/* @vitest-environment jsdom */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
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
