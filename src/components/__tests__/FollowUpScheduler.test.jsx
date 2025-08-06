/* @vitest-environment jsdom */
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, afterEach } from 'vitest';
import FollowUpScheduler from '../FollowUpScheduler.jsx';
import * as api from '../../api.js';
import i18n from '../../i18n.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('fetches recommendation and provides calendar link', async () => {
  vi.spyOn(api, 'scheduleFollowUp').mockResolvedValue({
    interval: '2 weeks',
    ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
  });
  const { getByText, getByPlaceholderText } = render(
    <FollowUpScheduler note="note" codes={["E11"]} />
  );
  fireEvent.click(getByText(i18n.t('followUp.recommend')));
  await waitFor(() =>
    expect(
      getByPlaceholderText(i18n.t('followUp.placeholder')).value,
    ).toBe('2 weeks'),
  );
  const href = getByText(i18n.t('suggestion.addToCalendar')).getAttribute(
    'href',
  );
  expect(href).toContain('text/calendar');
});
