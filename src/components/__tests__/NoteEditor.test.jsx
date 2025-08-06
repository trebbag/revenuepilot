/* @vitest-environment jsdom */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import { useState } from 'react';

vi.mock('../../api.js', () => ({
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: '', patient: '' }),
  getTemplates: vi.fn().mockResolvedValue([{ id: 1, name: 'Tpl', content: 'Hello' }]),
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

test('selecting template inserts content', async () => {
  function Wrapper() {
    const [val, setVal] = useState('');
    return <NoteEditor id="t" value={val} onChange={setVal} />;
  }
  const { findByLabelText, container } = render(<Wrapper />);
  const select = await findByLabelText('Templates');
  fireEvent.change(select, { target: { value: '1' } });
  const editor = container.querySelector('.ql-editor');
  await waitFor(() => expect(editor.innerHTML).toContain('Hello'));
});
