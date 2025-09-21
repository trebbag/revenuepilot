/* @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../i18n.js';
import WorkflowView from '../WorkflowView.jsx';

const mocks = vi.hoisted(() => ({
  createWorkflowSession: vi.fn(),
  getWorkflowSession: vi.fn(),
  updateWorkflowStep: vi.fn(),
  attestWorkflowSession: vi.fn(),
  dispatchWorkflowSession: vi.fn(),
  updateWorkflowNoteContent: vi.fn(),
}));

vi.mock('../../api.js', () => ({
  createWorkflowSession: (...args) => mocks.createWorkflowSession(...args),
  getWorkflowSession: (...args) => mocks.getWorkflowSession(...args),
  updateWorkflowStep: (...args) => mocks.updateWorkflowStep(...args),
  attestWorkflowSession: (...args) => mocks.attestWorkflowSession(...args),
  dispatchWorkflowSession: (...args) => mocks.dispatchWorkflowSession(...args),
  updateWorkflowNoteContent: (...args) => mocks.updateWorkflowNoteContent(...args),
}));

describe('WorkflowView', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset());
  });

  it('renders empty state when session is missing', () => {
    render(
      <WorkflowView
        sessionId={null}
        patientId="patient-1"
        encounterId="enc-1"
        noteContent="Initial note"
        suggestions={{ codes: [], compliance: [] }}
      />,
    );
    expect(screen.getByText(/No workflow session/i)).toBeTruthy();
  });

  it('creates a session and surfaces steps', async () => {
    mocks.createWorkflowSession.mockResolvedValue({
      sessionId: 'wf-1',
      encounterId: 'enc-1',
      stepStates: { 1: { step: 1, status: 'in_progress', progress: 10 } },
    });

    const onSessionIdChange = vi.fn();
    render(
      <WorkflowView
        sessionId={null}
        patientId="patient-1"
        encounterId="enc-1"
        noteContent="Patient note content"
        suggestions={{ codes: [{ code: '99213', description: 'Visit' }], compliance: ['Complete ROS'] }}
        onSessionIdChange={onSessionIdChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    await waitFor(() => expect(mocks.createWorkflowSession).toHaveBeenCalledTimes(1));
    expect(onSessionIdChange).toHaveBeenCalledWith('wf-1', 'enc-1');
    expect(await screen.findByText(/Step 1/i)).toBeTruthy();
  });

  it('runs validation and displays reimbursement information', async () => {
    mocks.getWorkflowSession.mockResolvedValue({
      sessionId: 'wf-2',
      stepStates: { 1: { step: 1, status: 'in_progress' } },
    });
    mocks.updateWorkflowNoteContent.mockResolvedValue({
      session: {
        sessionId: 'wf-2',
        stepStates: { 1: { step: 1, status: 'completed' } },
        lastValidation: {
          canFinalize: true,
          reimbursementSummary: { total: 120 },
          issues: { content: [], codes: [] },
        },
      },
    });

    render(
      <WorkflowView
        sessionId="wf-2"
        patientId="patient-2"
        encounterId="enc-2"
        noteContent="Detailed documentation"
        suggestions={{ codes: ['99214'], compliance: [] }}
      />,
    );

    await waitFor(() => expect(mocks.getWorkflowSession).toHaveBeenCalledWith('wf-2'));

    fireEvent.click(screen.getByRole('button', { name: /run validation/i }));
    await waitFor(() => expect(mocks.updateWorkflowNoteContent).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Estimated reimbursement/i)).toBeTruthy();
  });

  it('submits attestation and dispatches results', async () => {
    mocks.getWorkflowSession.mockResolvedValue({
      sessionId: 'wf-3',
      stepStates: { 1: { step: 1, status: 'completed' }, 5: { step: 5, status: 'in_progress' } },
    });
    mocks.attestWorkflowSession.mockResolvedValue({
      session: {
        sessionId: 'wf-3',
        stepStates: { 5: { step: 5, status: 'completed', progress: 100 } },
        attestation: {
          attestation: { attestedBy: 'Dr. Example', attestationText: 'Reviewed' },
        },
      },
    });
    mocks.dispatchWorkflowSession.mockResolvedValue({
      session: {
        sessionId: 'wf-3',
        stepStates: { 6: { step: 6, status: 'completed' } },
        dispatch: { destination: 'ehr', deliveryMethod: 'wizard', dispatchStatus: { dispatchCompleted: true } },
      },
      result: { exportReady: true },
    });

    render(
      <WorkflowView
        sessionId="wf-3"
        patientId="patient-3"
        encounterId="enc-3"
        noteContent="Attestation ready"
        suggestions={{ codes: [], compliance: [] }}
      />,
    );

    await waitFor(() => expect(mocks.getWorkflowSession).toHaveBeenCalledWith('wf-3'));

    fireEvent.change(screen.getByLabelText(/Attested by/i), { target: { value: 'Dr. Example' } });
    fireEvent.change(screen.getByLabelText(/Statement/i), { target: { value: 'Reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: /submit attestation/i }));
    await waitFor(() => expect(mocks.attestWorkflowSession).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /dispatch$/i }));
    await waitFor(() => expect(mocks.dispatchWorkflowSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Dispatch result/i)).toBeTruthy();
  });
});
