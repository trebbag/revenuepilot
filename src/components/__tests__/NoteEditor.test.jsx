/* @vitest-environment jsdom */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import { useState } from 'react';

vi.mock('../../api.js', () => ({
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: 'Hi there', patient: '' }),
  getSuggestions: vi
    .fn()
    .mockResolvedValue({ codes: [], compliance: [], publicHealth: [], differentials: [], followUp: null }),
  getTemplates: vi.fn().mockResolvedValue([{ id: 1, name: 'Tpl', content: 'Hello' }]),
  transcribeAudio: vi.fn().mockResolvedValue({ provider: '', patient: '' }),
  exportToEhr: vi.fn().mockResolvedValue({ status: 'exported' }),
  logEvent: vi.fn().mockResolvedValue(undefined),
  startVisitSession: vi
    .fn()
    .mockResolvedValue({
      sessionId: 101,
      status: 'started',
      startTime: '2023-01-01T00:00:00.000Z',
    }),
  updateVisitSession: vi
    .fn()
    .mockResolvedValue({
      sessionId: 101,
      status: 'pause',
      startTime: '2023-01-01T00:00:00.000Z',
      endTime: null,
    }),
}));

// mock typed client wrappers
vi.mock('../../api/client.ts', () => ({
  beautifyNote: vi.fn().mockResolvedValue('Beautified Text'),
  getSuggestions: vi.fn().mockResolvedValue({ codes: [{ code: '99213', rationale: 'Low complexity' }], compliance: ['Add ROS'], publicHealth: [], differentials: [] }),
}));

import '../../i18n.js';
import NoteEditor from '../NoteEditor.jsx';
import {
  exportToEhr,
  fetchLastTranscript,
  startVisitSession,
  updateVisitSession,
  logEvent,
} from '../../api.js';
import { beautifyNote, getSuggestions } from '../../api/client.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
  const { findByText, container } = render(<Wrapper />);
  const toggle = await findByText('Templates ▾');
  fireEvent.click(toggle);
  const btn = await findByText('Tpl');
  fireEvent.click(btn);
  const editor = container.querySelector('.ql-editor');
  await waitFor(() => expect(editor.innerHTML).toContain('Hello'));
});

test('inserts template and merges audio transcript', async () => {
  fetchLastTranscript.mockResolvedValue({ provider: 'Hi there', patient: '' });
  function Wrapper() {
    const [val, setVal] = useState('');
    return <NoteEditor id="m" value={val} onChange={setVal} />;
  }
  const { findByText, container, findAllByText } = render(<Wrapper />);
  const toggle = await findByText('Templates ▾');
  fireEvent.click(toggle);
  const tplBtn = await findByText('Tpl');
  fireEvent.click(tplBtn);
  // Insert provider transcript: match Insert case-insensitively
  const insertButtons = await findAllByText(/Insert/i);
  fireEvent.click(insertButtons[0]);
  const editor = container.querySelector('.ql-editor');
  await waitFor(() => {
    expect(editor.innerHTML).toContain('Hello');
    expect(editor.innerHTML).toContain('Hi there');
  });
  fetchLastTranscript.mockResolvedValue({ provider: '', patient: '' });
});

test('preloads default template', async () => {
  function Wrapper() {
    const [val, setVal] = useState('');
    return (
      <NoteEditor
        id="p"
        value={val}
        onChange={setVal}
        defaultTemplateId={1}
      />
    );
  }
  const { container, findByText } = render(<Wrapper />);
  const toggle = await findByText('Templates ▾');
  fireEvent.click(toggle);
  await findByText('Tpl');
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
    />,
  );
  // Ensure button visible (now present in draft view)
  fireEvent.click(getByText('Export to EHR'));
  await waitFor(() => expect(exportToEhr).toHaveBeenCalled());
});

test('tab switching triggers beautify fetch', async () => {
  function Wrapper() {
    const [val, setVal] = useState('draft text');
    return <NoteEditor id="tabs" value={val} onChange={setVal} />;
  }
  const { getByText, findByText } = render(<Wrapper />);
  fireEvent.click(getByText('Beautified'));
  await findByText('Beautified Text');
  expect(beautifyNote).toHaveBeenCalledWith('<p>draft text</p>', { specialty: undefined, payer: undefined });
});

// Utility to mock Quill selection APIs that break in jsdom
function patchQuillSelection() {
  const el = document.querySelector('.ql-editor');
  if (!el) return;
  // Provide a minimal Range-like object for getSelection path
  if (!window.getSelection) {
    window.getSelection = () => ({
      getRangeAt: () => ({ getBoundingClientRect: () => ({ top:0,left:0,width:0,height:0 }) }),
    });
  }
}

test('suggestion panel renders codes and inserts into draft', async () => {
  const changeSpy = vi.fn();
  function Wrapper() {
    const [val, setVal] = useState('draft');
    const handle = (v) => { changeSpy(v); setVal(v); };
    return <NoteEditor id="sugg" value={val} onChange={handle} />;
  }
  const { findByText, container } = render(<Wrapper />);
  await waitFor(() => expect(getSuggestions).toHaveBeenCalled());
  const code = await findByText(/99213/);
  fireEvent.click(code); // clicking list item text should trigger insert
  const editor = container.querySelector('.ql-editor');
  await waitFor(() => expect(editor.innerHTML).toMatch(/99213/));
  expect(changeSpy).toHaveBeenCalled();
});

test('starts visit session when identifiers are provided and completes on export', async () => {
  startVisitSession.mockResolvedValue({
    sessionId: 55,
    status: 'started',
    startTime: '2024-01-01T00:00:00.000Z',
  });
  updateVisitSession.mockResolvedValueOnce({
    sessionId: 55,
    status: 'complete',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T00:10:00.000Z',
  });

  const { getByText, findByText } = render(
    <NoteEditor id="sess" value="<p>note</p>" onChange={() => {}} patientId="P123" encounterId="42" />,
  );

  await waitFor(() => expect(startVisitSession).toHaveBeenCalledWith({ encounterId: 42 }));
  await findByText(/Visit Duration:/i);

  fireEvent.click(getByText('Export to EHR'));

  await waitFor(() =>
    expect(updateVisitSession).toHaveBeenCalledWith({ sessionId: 55, action: 'complete' }),
  );
  expect(logEvent).toHaveBeenCalledWith(
    'visit_session_start',
    expect.objectContaining({ sessionId: 55, patientId: 'P123', encounterId: 42 }),
  );
  expect(logEvent).toHaveBeenCalledWith(
    'visit_session_complete',
    expect.objectContaining({ sessionId: 55, encounterId: 42 }),
  );
});

test('pauses visit session on unmount when still active', async () => {
  startVisitSession.mockResolvedValue({
    sessionId: 77,
    status: 'started',
    startTime: '2024-02-01T12:00:00.000Z',
  });

  const { unmount } = render(
    <NoteEditor id="cleanup" value="<p>note</p>" onChange={() => {}} patientId="PX" encounterId="77" />,
  );

  await waitFor(() => expect(startVisitSession).toHaveBeenCalled());

  unmount();

  await waitFor(() =>
    expect(updateVisitSession).toHaveBeenCalledWith({ sessionId: 77, action: 'pause' }),
  );
  expect(logEvent).toHaveBeenCalledWith(
    'visit_session_pause',
    expect.objectContaining({ sessionId: 77, reason: 'exit' }),
  );
});
