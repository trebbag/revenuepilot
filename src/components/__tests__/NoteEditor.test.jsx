/* @vitest-environment jsdom */
import { render, cleanup, fireEvent } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: '', patient: '' }),
}));

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

test('shows record button when recording', () => {
  const { getByText } = render(
    <NoteEditor id="a" value="" onChange={() => {}} onRecord={() => {}} recording />
  );
  expect(getByText('Stop Recording')).toBeTruthy();
});

test('maintains beautified history with undo/redo', () => {
  const onChange = vi.fn();
  const { rerender, getByText } = render(
    <NoteEditor id="b" value="First" onChange={onChange} mode="beautified" />
  );
  rerender(<NoteEditor id="b" value="Second" onChange={onChange} mode="beautified" />);
  rerender(<NoteEditor id="b" value="Third" onChange={onChange} mode="beautified" />);
  fireEvent.click(getByText('Undo'));
  expect(onChange).toHaveBeenLastCalledWith('Second');
  fireEvent.click(getByText('Undo'));
  expect(onChange).toHaveBeenLastCalledWith('First');
  fireEvent.click(getByText('Redo'));
  expect(onChange).toHaveBeenLastCalledWith('Second');
});

test('limits beautified history to five entries', () => {
  const { rerender, getByText, queryByText } = render(
    <NoteEditor id="c" value="1" onChange={() => {}} mode="beautified" />
  );
  ['2', '3', '4', '5', '6'].forEach((v) =>
    rerender(<NoteEditor id="c" value={v} onChange={() => {}} mode="beautified" />)
  );
  for (let i = 0; i < 5; i += 1) {
    fireEvent.click(getByText('Undo'));
  }
  expect(queryByText('1')).toBeNull();
  expect(getByText('2')).toBeTruthy();
});
