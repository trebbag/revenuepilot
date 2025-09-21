/* @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Scheduler from '../Scheduler.tsx';
import * as client from '../../api/client';
import '../../i18n.js';

describe('Scheduler', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requests follow-up recommendation and updates interval', async () => {
    vi.spyOn(client, 'listAppointments').mockResolvedValue({
      appointments: [
        {
          id: 1,
          patient: 'Existing',
          reason: 'Follow-up',
          start: new Date('2024-01-01T10:00:00Z'),
          end: new Date('2024-01-01T10:30:00Z'),
          provider: null,
          status: 'scheduled',
          patientId: null,
          encounterId: null,
          location: null,
          visitSummary: null,
        },
      ],
      visitSummaries: {},
    });
    vi.spyOn(client, 'scheduleFollowUp').mockResolvedValue({
      interval: '6 weeks',
      ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
      reason: 'code mapping',
    });

    render(
      <Scheduler
        note="Clinical note"
        codes={['E11']}
        specialty="cardiology"
        payer="medicare"
      />,
    );

    const recommendButton = screen.getByRole('button', {
      name: /recommend/i,
    });
    fireEvent.click(recommendButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/interval/i)).toHaveValue('6 weeks');
    });

    expect(client.scheduleFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Clinical note',
        codes: ['E11'],
        specialty: 'cardiology',
        payer: 'medicare',
      }),
    );
  });

  it('creates appointments and applies bulk actions', async () => {
    const listSpy = vi.spyOn(client, 'listAppointments');
    listSpy.mockResolvedValueOnce({ appointments: [], visitSummaries: {} });
    listSpy.mockResolvedValueOnce({
      appointments: [
        {
          id: 1,
          patient: 'Existing',
          reason: 'Follow-up',
          start: new Date('2024-01-01T10:00:00Z'),
          end: new Date('2024-01-01T10:30:00Z'),
          provider: null,
          status: 'scheduled',
          patientId: null,
          encounterId: null,
          location: null,
          visitSummary: null,
        },
      ],
      visitSummaries: {},
    });
    listSpy.mockResolvedValue({
      appointments: [
        {
          id: 1,
          patient: 'Existing',
          reason: 'Follow-up',
          start: new Date('2024-01-01T10:00:00Z'),
          end: new Date('2024-01-01T10:30:00Z'),
          provider: null,
          status: 'scheduled',
          patientId: null,
          encounterId: null,
          location: null,
          visitSummary: null,
        },
        {
          id: 2,
          patient: 'Jane Doe',
          reason: 'Re-check',
          start: new Date('2024-01-02T09:00:00Z'),
          end: new Date('2024-01-02T09:30:00Z'),
          provider: null,
          status: 'scheduled',
          patientId: null,
          encounterId: null,
          location: null,
          visitSummary: null,
        },
      ],
      visitSummaries: {},
    });

    vi.spyOn(client, 'createAppointment').mockResolvedValue({
      id: 2,
      patient: 'Jane Doe',
      reason: 'Re-check',
      start: new Date('2024-01-02T09:00:00Z'),
      end: new Date('2024-01-02T09:30:00Z'),
      provider: null,
      status: 'scheduled',
      patientId: null,
      encounterId: null,
      location: null,
      visitSummary: null,
    });

    vi.spyOn(client, 'scheduleBulkOperations').mockResolvedValue({
      succeeded: 1,
      failed: 0,
    });

    render(<Scheduler note="" codes={[]} />);

    const patientInput = screen.getByLabelText(/patient/i);
    fireEvent.change(patientInput, { target: { value: 'Jane Doe' } });

    const reasonInput = screen.getByLabelText(/reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Re-check' } });

    const submitButton = screen.getByRole('button', {
      name: /schedule appointment/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(client.createAppointment).toHaveBeenCalled();
    });

    await screen.findByText('Jane Doe');

    const checkbox = screen.getByLabelText(/appointment 2/i);
    fireEvent.click(checkbox);

    const applyButton = screen.getByRole('button', {
      name: /apply/i,
    });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(client.scheduleBulkOperations).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({ id: 2, action: 'complete' }),
          ]),
        }),
      );
    });
  });
});
