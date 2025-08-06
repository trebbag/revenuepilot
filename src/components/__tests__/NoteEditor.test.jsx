/* @vitest-environment jsdom */
import { render, cleanup, fireEvent } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({
  fetchLastTranscript: vi.fn().mockResolvedValue({ provider: '', patient: '' }),
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
