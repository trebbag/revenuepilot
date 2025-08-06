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
  exportToEhr: vi.fn().mockResolvedValue({ status: 'exported' }),


}));

import { fetchLastTranscript } from '../../api.js';
import '../../i18n.js';
import NoteEditor from '../NoteEditor.jsx';
import { exportToEhr } from '../../api.js';

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

test('inserts template and merges audio transcript', async () => {
  fetchLastTranscript.mockResolvedValue({ provider: 'Hi there', patient: '' });

  function Wrapper() {
    const [val, setVal] = useState('');
    return <NoteEditor id="m" value={val} onChange={setVal} />;
  }

  const { findByLabelText, container, findAllByText } = render(<Wrapper />);
  const select = await findByLabelText('Templates');
  fireEvent.change(select, { target: { value: '1' } });
  const [insertProvider] = await findAllByText('Insert');
  fireEvent.click(insertProvider);

  const editor = container.querySelector('.ql-editor');
  await waitFor(() => {
    expect(editor.innerHTML).toContain('Hello');
    expect(editor.innerHTML).toContain('Hi there');
  });
  fetchLastTranscript.mockResolvedValue({ provider: '', patient: '' });
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

test('supports undo beyond five beautified entries', () => {
  const { rerender, getByText } = render(
    <NoteEditor id="c" value="1" onChange={() => {}} mode="beautified" />
  );
  ['2', '3', '4', '5', '6', '7'].forEach((v) =>
    rerender(<NoteEditor id="c" value={v} onChange={() => {}} mode="beautified" />)
  );
  for (let i = 0; i < 6; i += 1) {
    fireEvent.click(getByText('Undo'));
  }
  expect(getByText('1')).toBeTruthy();
});

test('EHR export button triggers API call', async () => {
    const { getByText } = render(
      <NoteEditor
        id="e"
        value="Some"
        onChange={() => {}}
        mode="beautified"
        role="admin"
      />,
    );
  fireEvent.click(getByText('EHR Export'));
  await waitFor(() => expect(exportToEhr).toHaveBeenCalled());
});
