/* @vitest-environment jsdom */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import { useState } from 'react';

vi.mock('../../api.js', () => ({
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: '', patient: '' }),

  getSuggestions: vi
    .fn()
    .mockResolvedValue({ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: null }),

  getTemplates: vi.fn().mockResolvedValue([{ id: 1, name: 'Tpl', content: 'Hello' }]),
  transcribeAudio: vi.fn().mockResolvedValue({ provider: '', patient: '' }),


}));

import '../../i18n.js';
import NoteEditor from '../NoteEditor.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('record button toggles recording state', async () => {
  class MockRecorder {
    constructor() {
      this.stream = { getTracks: () => [] };
      this.ondataavailable = null;
      this.onstop = null;
      this.state = 'inactive';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) this.ondataavailable({ data: new Blob(['a']) });
      if (this.onstop) this.onstop();
    }
  }
  vi.stubGlobal('MediaRecorder', MockRecorder);
  // eslint-disable-next-line no-undef
  navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({}) };

  const { getByText, findByText } = render(
    <NoteEditor id="n" value="" onChange={() => {}} />
  );
  fireEvent.click(getByText('Record Audio'));
  await findByText('Stop Recording');
  fireEvent.click(getByText('Stop Recording'));
  await findByText('Record Audio');
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
