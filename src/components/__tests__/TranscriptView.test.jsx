/* @vitest-environment jsdom */
import { render, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import i18n from '../../i18n.js';
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
    i18n.changeLanguage('en');
    const { getByText, getAllByText } = render(
      <TranscriptView transcript={transcript} onAdd={onAdd} onIgnore={onIgnore} />
    );
    expect(getByText('provider')).toBeTruthy();
    expect(getByText('patient')).toBeTruthy();
    expect(getByText('[00:00-00:01]:', { exact: false })).toBeTruthy();
    expect(getByText('[00:01-00:02]:', { exact: false })).toBeTruthy();
    fireEvent.click(getAllByText(i18n.t('transcript.add'))[0]);
    expect(onAdd).toHaveBeenCalledWith(0);
    fireEvent.click(getAllByText(i18n.t('transcript.ignore'))[1]);
    expect(onIgnore).toHaveBeenCalledWith(1);
  });
});
