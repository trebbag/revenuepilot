/* @vitest-environment jsdom */
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import '../../i18n.js';
import ClipboardExportButtons from '../ClipboardExportButtons.jsx';
import * as api from '../../api.js';

describe('ClipboardExportButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete window.require;
  });

  test('copies beautified text to clipboard and logs event', async () => {
    const writeText = vi.fn().mockResolvedValue();
    navigator.clipboard = { writeText };
    const logSpy = vi.spyOn(api, 'logEvent').mockResolvedValue();
    const { getByText } = render(
      <ClipboardExportButtons beautified="beauty" summary="" patientID="p1" />
    );
    fireEvent.click(getByText('Copy Beautified'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('beauty');
      expect(logSpy).toHaveBeenCalledWith('copy', {
        patientID: 'p1',
        type: 'beautified',
        length: 6,
      });
    });
  });

  test('copies summary text to clipboard and logs event', async () => {
    const writeText = vi.fn().mockResolvedValue();
    navigator.clipboard = { writeText };
    const logSpy = vi.spyOn(api, 'logEvent').mockResolvedValue();
    const { getByText } = render(
      <ClipboardExportButtons beautified="" summary="sum" patientID="p2" />
    );
    fireEvent.click(getByText('Copy Summary'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('sum');
      expect(logSpy).toHaveBeenCalledWith('copy', {
        patientID: 'p2',
        type: 'summary',
        length: 3,
      });
    });
  });

  test('exports note via ipc and logs event', async () => {
    const invoke = vi.fn().mockResolvedValue();
    window.require = vi.fn().mockReturnValue({ ipcRenderer: { invoke } });
    const logSpy = vi.spyOn(api, 'logEvent').mockResolvedValue();
    const { getByText } = render(
      <ClipboardExportButtons beautified="b" summary="s" patientID="p3" />
    );
    fireEvent.click(getByText('Export'));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export-note', { beautified: 'b', summary: 's' });
      expect(logSpy).toHaveBeenCalledWith('export', {
        patientID: 'p3',
        beautifiedLength: 1,
        summaryLength: 1,
      });
    });
  });

  test('exports RTF via ipc and logs event', async () => {
    const invoke = vi.fn().mockResolvedValue();
    window.require = vi.fn().mockReturnValue({ ipcRenderer: { invoke } });
    const logSpy = vi.spyOn(api, 'logEvent').mockResolvedValue();
    const { getByText } = render(
      <ClipboardExportButtons beautified="b" summary="s" patientID="p4" />
    );
    fireEvent.click(getByText('Export RTF'));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export-rtf', { beautified: 'b', summary: 's' });
      expect(logSpy).toHaveBeenCalledWith('export-rtf', {
        patientID: 'p4',
        beautifiedLength: 1,
        summaryLength: 1,
      });
    });
  });
});
