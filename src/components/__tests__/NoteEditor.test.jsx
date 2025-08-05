/* @vitest-environment jsdom */
import { render, cleanup, fireEvent } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import '../../i18n.js';
import NoteEditor from '../NoteEditor.jsx';

afterEach(() => cleanup());

test('calls onRecord when record button clicked', () => {
  const onRecord = vi.fn();
  const { getByText } = render(
    <NoteEditor id="n" value="" onChange={() => {}} onRecord={onRecord} />
  );
  fireEvent.click(getByText('Record Audio'));
  expect(onRecord).toHaveBeenCalled();
});

test('shows record button and transcript when provided', () => {
  const { getByText } = render(
    <NoteEditor id="a" value="" onChange={() => {}} onRecord={() => {}} recording transcript="done" />
  );
  expect(getByText('Stop Recording')).toBeTruthy();
  expect(getByText(/Transcript: done/)).toBeTruthy();
});
