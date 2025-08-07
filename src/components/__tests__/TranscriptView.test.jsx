/* @vitest-environment jsdom */
import { render, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import TranscriptView from '../TranscriptView.jsx';

describe('TranscriptView', () => {
  test('renders segments with speaker labels and times', () => {
    const transcript = {
      segments: [
        { speaker: 'provider', start: 0, end: 1, text: 'hello' },
        { speaker: 'patient', start: 1, end: 2, text: 'hi' },
      ],
    };
    const onAdd = vi.fn();
    const onIgnore = vi.fn();
    const { getByText, getAllByText } = render(
      <TranscriptView transcript={transcript} onAdd={onAdd} onIgnore={onIgnore} />
    );
    expect(getByText('provider')).toBeTruthy();
    expect(getByText('patient')).toBeTruthy();
    expect(getByText('[00:00-00:01]:', { exact: false })).toBeTruthy();
    expect(getByText('[00:01-00:02]:', { exact: false })).toBeTruthy();
    fireEvent.click(getAllByText('Add')[0]);
    expect(onAdd).toHaveBeenCalledWith(0);
    fireEvent.click(getAllByText('Ignore')[1]);
    expect(onIgnore).toHaveBeenCalledWith(1);
  });
});
