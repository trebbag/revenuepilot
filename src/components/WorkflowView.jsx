import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createWorkflowSession,
  getWorkflowSession,
  updateWorkflowStep,
  attestWorkflowSession,
  dispatchWorkflowSession,
  updateWorkflowNoteContent,
} from '../api.js';

const STEP_COUNT = 6;

function normalizeStepStates(rawStates) {
  const map = new Map();
  if (Array.isArray(rawStates)) {
    rawStates.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const rawStep = entry.step ?? entry.id;
      const stepNumber = Number.parseInt(rawStep, 10);
      if (Number.isFinite(stepNumber)) {
        map.set(stepNumber, entry);
      }
    });
  } else if (rawStates && typeof rawStates === 'object') {
    Object.entries(rawStates).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const stepNumber = Number.parseInt(key, 10);
      if (Number.isFinite(stepNumber)) {
        map.set(stepNumber, entry);
      }
    });
  }
  return map;
}

function StepList({ steps, onComplete, onReopen, busy }) {
  const { t } = useTranslation();
  const statusLabels = {
    not_started: t('workflow.statusNotStarted'),
    in_progress: t('workflow.statusInProgress'),
    completed: t('workflow.statusCompleted'),
    blocked: t('workflow.statusBlocked'),
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>{t('workflow.stepsHeading')}</h2>
      <ol className="workflow-steps">
        {steps.map((step) => (
          <li key={step.id} className={`workflow-step status-${step.status}`}>
            <div className="workflow-step-header">
              <div>
                <strong>
                  {t('workflow.stepLabel', {
                    index: step.id,
                    title: step.title,
                  })}
                </strong>
                <div className="workflow-step-status">
                  {statusLabels[step.status] || step.status}
                  {Number.isFinite(step.progress) && (
                    <span className="workflow-progress">{step.progress}%</span>
                  )}
                </div>
              </div>
              <div className="workflow-step-actions">
                {step.status !== 'completed' && onComplete && (
                  <button
                    type="button"
                    className="workflow-action"
                    onClick={() => onComplete(step.id)}
                    disabled={busy}
                  >
                    {t('workflow.markComplete')}
                  </button>
                )}
                {step.status === 'completed' &&
                  onReopen &&
                  step.id < STEP_COUNT && (
                    <button
                      type="button"
                      className="workflow-action secondary"
                      onClick={() => onReopen(step.id)}
                      disabled={busy}
                    >
                      {t('workflow.reopenStep')}
                    </button>
                  )}
              </div>
            </div>
            <p className="workflow-step-description">{step.description}</p>
            {step.notes && (
              <p className="workflow-step-notes">
                <span>{t('workflow.notesLabel')}:</span> {step.notes}
              </p>
            )}
            {Array.isArray(step.blockingIssues) &&
              step.blockingIssues.length > 0 && (
                <div className="workflow-blockers">
                  <strong>{t('workflow.blockingIssues')}</strong>
                  <ul>
                    {step.blockingIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ValidationPanel({
  encounterId,
  noteId,
  noteContent,
  suggestions,
  session,
  onSessionUpdate,
  onError,
}) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const validation = session?.lastValidation;

  const handleValidate = async () => {
    if (!session?.sessionId || !encounterId) {
      onError(t('workflow.validationMissingContext'));
      return;
    }
    setRunning(true);
    onError('');
    try {
      const payload = {
        sessionId: session.sessionId,
        encounterId,
        noteId: noteId || session.noteId,
        content: noteContent || session.noteContent || '',
        codes: (session.selectedCodes || suggestions?.codes || []).map(
          (entry) =>
            typeof entry === 'string'
              ? entry
              : entry.code || entry.id || entry.title || 'code',
        ),
        prevention: Array.isArray(suggestions?.compliance)
          ? suggestions.compliance
          : [],
        diagnoses: [],
        differentials: Array.isArray(suggestions?.differentials)
          ? suggestions.differentials.map((d) => (d && d.diagnosis) || d)
          : [],
        compliance: Array.isArray(suggestions?.compliance)
          ? suggestions.compliance.map((item) =>
              typeof item === 'string'
                ? item
                : item?.title || item?.description || '',
            )
          : [],
      };
      const response = await updateWorkflowNoteContent(encounterId, payload);
      const updatedSession = response?.session || session;
      onSessionUpdate(updatedSession);
    } catch (err) {
      const message = err?.message || String(err);
      onError(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="workflow-panel-header">
        <h2>{t('workflow.validationHeading')}</h2>
        <button type="button" onClick={handleValidate} disabled={running}>
          {running ? t('workflow.validating') : t('workflow.runValidation')}
        </button>
      </div>
      {validation ? (
        <div className="workflow-validation-body">
          <p>
            <strong>{t('workflow.canFinalizeLabel')}:</strong>{' '}
            {validation.canFinalize ? t('workflow.yes') : t('workflow.no')}
          </p>
          {validation.reimbursementSummary && (
            <p>
              <strong>{t('workflow.estimatedReimbursement')}:</strong>{' '}
              {validation.reimbursementSummary.total ?? 0}
            </p>
          )}
          {validation.issues && (
            <div className="workflow-issues">
              <strong>{t('workflow.validationIssues')}</strong>
              <ul>
                {Object.entries(validation.issues).map(([key, list]) => (
                  <li key={key}>
                    <strong>{key}:</strong>{' '}
                    {Array.isArray(list) && list.length > 0
                      ? list.join(', ')
                      : t('workflow.none')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(validation.missingDocumentation) &&
            validation.missingDocumentation.length > 0 && (
              <div className="workflow-issues">
                <strong>{t('workflow.missingDocumentation')}</strong>
                <ul>
                  {validation.missingDocumentation.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      ) : (
        <p>{t('workflow.validationEmpty')}</p>
      )}
    </div>
  );
}

function AttestationPanel({ session, onSessionUpdate, onError }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    attestedBy: '',
    statement: '',
    ipAddress: '',
    signature: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const attestation = session?.attestation?.attestation;
    if (attestation && typeof attestation === 'object') {
      setForm((prev) => ({
        ...prev,
        attestedBy:
          attestation.attestedBy || attestation.attested_by || prev.attestedBy,
        statement: attestation.attestationText || prev.statement,
      }));
    }
  }, [session?.attestation]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!session?.sessionId) {
      onError(t('workflow.attestationMissingSession'));
      return;
    }
    setSubmitting(true);
    onError('');
    try {
      const payload = {
        attestedBy: form.attestedBy || undefined,
        statement: form.statement || undefined,
        attestation: {
          attestationText: form.statement || undefined,
          attestedBy: form.attestedBy || undefined,
          physicianAttestation: true,
          attestationIpAddress: form.ipAddress || undefined,
          digitalSignature: form.signature || undefined,
        },
      };
      const updated = await attestWorkflowSession(session.sessionId, payload);
      onSessionUpdate(updated?.session || updated);
    } catch (err) {
      const message = err?.message || String(err);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const attestation = session?.attestation;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2>{t('workflow.attestationHeading')}</h2>
      <form onSubmit={handleSubmit} className="workflow-form">
        <label>
          <span>{t('workflow.attestedByLabel')}</span>
          <input
            type="text"
            name="attestedBy"
            value={form.attestedBy}
            onChange={handleChange}
            placeholder={t('workflow.attestedByPlaceholder')}
          />
        </label>
        <label>
          <span>{t('workflow.statementLabel')}</span>
          <textarea
            name="statement"
            rows={3}
            value={form.statement}
            onChange={handleChange}
            placeholder={t('workflow.statementPlaceholder')}
          />
        </label>
        <div className="workflow-grid">
          <label>
            <span>{t('workflow.ipLabel')}</span>
            <input
              type="text"
              name="ipAddress"
              value={form.ipAddress}
              onChange={handleChange}
              placeholder="203.0.113.1"
            />
          </label>
          <label>
            <span>{t('workflow.signatureLabel')}</span>
            <input
              type="text"
              name="signature"
              value={form.signature}
              onChange={handleChange}
              placeholder="sig-123"
            />
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting
            ? t('workflow.submitting')
            : t('workflow.submitAttestation')}
        </button>
      </form>
      {attestation && (
        <div className="workflow-attestation-summary">
          <h3>{t('workflow.attestationSummary')}</h3>
          <ul>
            <li>
              <strong>{t('workflow.attestedByLabel')}:</strong>{' '}
              {attestation.attestation?.attestedBy || t('workflow.unknown')}
            </li>
            <li>
              <strong>{t('workflow.statementLabel')}:</strong>{' '}
              {attestation.attestation?.attestationText ||
                t('workflow.unknown')}
            </li>
            {attestation.billingValidation?.estimatedReimbursement !==
              undefined && (
              <li>
                <strong>{t('workflow.estimatedReimbursement')}:</strong>{' '}
                {attestation.billingValidation.estimatedReimbursement}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function DispatchPanel({ session, onSessionUpdate, onError, onResult }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    destination: 'ehr',
    deliveryMethod: 'wizard',
    sendToEmr: true,
    sendToBilling: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.dispatch) return;
    setForm((prev) => ({
      ...prev,
      destination: session.dispatch.destination || prev.destination,
      deliveryMethod: session.dispatch.deliveryMethod || prev.deliveryMethod,
    }));
  }, [session?.dispatch]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!session?.sessionId) {
      onError(t('workflow.dispatchMissingSession'));
      return;
    }
    setSubmitting(true);
    onError('');
    try {
      const payload = {
        destination: form.destination,
        deliveryMethod: form.deliveryMethod,
        dispatchOptions: {
          sendToEmr: form.sendToEmr,
          sendToBilling: form.sendToBilling,
        },
      };
      const response = await dispatchWorkflowSession(
        session.sessionId,
        payload,
      );
      const updatedSession = response?.session || session;
      onSessionUpdate(updatedSession);
      onResult(response?.result || null);
    } catch (err) {
      const message = err?.message || String(err);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const dispatch = session?.dispatch;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2>{t('workflow.dispatchHeading')}</h2>
      <form onSubmit={handleSubmit} className="workflow-form">
        <label>
          <span>{t('workflow.destinationLabel')}</span>
          <select
            name="destination"
            value={form.destination}
            onChange={handleChange}
          >
            <option value="ehr">{t('workflow.destinationEhr')}</option>
            <option value="billing">{t('workflow.destinationBilling')}</option>
            <option value="export">{t('workflow.destinationExport')}</option>
          </select>
        </label>
        <label>
          <span>{t('workflow.deliveryLabel')}</span>
          <select
            name="deliveryMethod"
            value={form.deliveryMethod}
            onChange={handleChange}
          >
            <option value="wizard">{t('workflow.deliveryWizard')}</option>
            <option value="api">{t('workflow.deliveryApi')}</option>
            <option value="manual">{t('workflow.deliveryManual')}</option>
          </select>
        </label>
        <div className="workflow-grid">
          <label className="checkbox">
            <input
              type="checkbox"
              name="sendToEmr"
              checked={form.sendToEmr}
              onChange={handleChange}
            />
            <span>{t('workflow.optionSendEmr')}</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="sendToBilling"
              checked={form.sendToBilling}
              onChange={handleChange}
            />
            <span>{t('workflow.optionSendBilling')}</span>
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting
            ? t('workflow.dispatching')
            : t('workflow.dispatchButton')}
        </button>
      </form>
      {dispatch && (
        <div className="workflow-dispatch-summary">
          <h3>{t('workflow.dispatchSummary')}</h3>
          <ul>
            <li>
              <strong>{t('workflow.destinationLabel')}:</strong>{' '}
              {dispatch.destination}
            </li>
            <li>
              <strong>{t('workflow.deliveryLabel')}:</strong>{' '}
              {dispatch.deliveryMethod}
            </li>
            <li>
              <strong>{t('workflow.dispatchStatus')}:</strong>{' '}
              {dispatch.dispatchStatus?.dispatchCompleted
                ? t('workflow.completed')
                : t('workflow.incomplete')}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function buildStepDefinitions(t) {
  return [
    {
      id: 1,
      title: t('workflow.step1Title'),
      description: t('workflow.step1Description'),
    },
    {
      id: 2,
      title: t('workflow.step2Title'),
      description: t('workflow.step2Description'),
    },
    {
      id: 3,
      title: t('workflow.step3Title'),
      description: t('workflow.step3Description'),
    },
    {
      id: 4,
      title: t('workflow.step4Title'),
      description: t('workflow.step4Description'),
    },
    {
      id: 5,
      title: t('workflow.step5Title'),
      description: t('workflow.step5Description'),
    },
    {
      id: 6,
      title: t('workflow.step6Title'),
      description: t('workflow.step6Description'),
    },
  ];
}

function mapSteps(definitions, session) {
  const stateMap = normalizeStepStates(session?.stepStates);
  return definitions.map((definition) => {
    const state = stateMap.get(definition.id) || {};
    return {
      ...definition,
      status:
        state.status || (definition.id === 1 ? 'in_progress' : 'not_started'),
      progress: typeof state.progress === 'number' ? state.progress : undefined,
      notes: state.notes,
      blockingIssues: Array.isArray(state.blockingIssues)
        ? state.blockingIssues
        : [],
    };
  });
}

function WorkflowView({
  sessionId,
  patientId,
  encounterId,
  noteId,
  noteContent,
  suggestions,
  onSessionIdChange,
  onSessionChange,
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [dispatchResult, setDispatchResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setSession(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError('');
    getWorkflowSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        const normalized = data?.session || data;
        setSession(normalized);
        if (onSessionChange) onSessionChange(normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err?.message || String(err);
        setError(message);
        if (message === 'Not found' && onSessionIdChange) {
          onSessionIdChange(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, onSessionChange, onSessionIdChange]);

  const definitions = useMemo(() => buildStepDefinitions(t), [t]);
  const steps = useMemo(
    () => mapSteps(definitions, session),
    [definitions, session],
  );

  const handleSessionUpdate = (updatedSession) => {
    const normalized = updatedSession?.session || updatedSession;
    if (!normalized) return;
    setSession(normalized);
    if (onSessionChange) onSessionChange(normalized);
  };

  const ensureSessionContext = () => {
    if (!patientId || !encounterId) {
      setError(t('workflow.missingIdentifiers'));
      return false;
    }
    return true;
  };

  const handleCreateSession = async () => {
    if (!ensureSessionContext()) return;
    setCreating(true);
    setError('');
    try {
      const baseCodes = Array.isArray(suggestions?.codes)
        ? suggestions.codes.map((code) => {
            if (!code || typeof code !== 'object') {
              return {
                code: String(code || ''),
                type: 'CPT',
                category: 'procedure',
              };
            }
            return {
              code: code.code || code.id || '',
              type: code.type || 'CPT',
              category: code.category || 'procedure',
              description: code.description || code.rationale || '',
              rationale: code.rationale,
            };
          })
        : [];
      const complianceIssues = Array.isArray(suggestions?.compliance)
        ? suggestions.compliance.map((item, index) =>
            typeof item === 'string'
              ? { id: `comp-${index + 1}`, title: item, severity: 'warning' }
              : {
                  id: item?.id || `comp-${index + 1}`,
                  title: item?.title || item?.description || 'Issue',
                  severity: item?.severity || 'warning',
                  description: item?.description,
                },
          )
        : [];
      const payload = {
        encounterId,
        patientId,
        noteId: noteId || undefined,
        noteContent: noteContent || '',
        selectedCodes: baseCodes,
        complianceIssues,
      };
      const data = await createWorkflowSession(payload);
      const normalized = data?.session || data;
      handleSessionUpdate(normalized);
      if (onSessionIdChange && normalized?.sessionId) {
        onSessionIdChange(
          normalized.sessionId,
          normalized.encounterId || encounterId,
        );
      }
    } catch (err) {
      const message = err?.message || String(err);
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    getWorkflowSession(sessionId)
      .then((data) => {
        const normalized = data?.session || data;
        handleSessionUpdate(normalized);
      })
      .catch((err) => {
        const message = err?.message || String(err);
        setError(message);
      })
      .finally(() => setLoading(false));
  };

  const handleCompleteStep = async (stepId) => {
    if (!session?.sessionId) return;
    try {
      const updated = await updateWorkflowStep(session.sessionId, {
        step: stepId,
        status: 'completed',
        progress: 100,
      });
      handleSessionUpdate(updated?.session || updated);
    } catch (err) {
      const message = err?.message || String(err);
      setError(message);
    }
  };

  const handleReopenStep = async (stepId) => {
    if (!session?.sessionId) return;
    try {
      const updated = await updateWorkflowStep(session.sessionId, {
        step: stepId,
        status: 'in_progress',
        progress: 50,
      });
      handleSessionUpdate(updated?.session || updated);
    } catch (err) {
      const message = err?.message || String(err);
      setError(message);
    }
  };

  return (
    <div className="workflow-view">
      <header className="workflow-header">
        <div>
          <h1>{t('workflow.title')}</h1>
          <p className="workflow-subtitle">{t('workflow.subtitle')}</p>
        </div>
        <div className="workflow-actions">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!sessionId || loading}
          >
            {t('workflow.refresh')}
          </button>
          <button
            type="button"
            onClick={handleCreateSession}
            disabled={creating || loading}
          >
            {creating ? t('workflow.creating') : t('workflow.createSession')}
          </button>
        </div>
      </header>
      {error && (
        <div className="workflow-error" role="alert">
          {error}
        </div>
      )}
      {loading && <p>{t('workflow.loading')}</p>}
      {!loading && !sessionId && (
        <p className="workflow-empty">{t('workflow.noSession')}</p>
      )}
      {session && (
        <>
          <StepList
            steps={steps}
            onComplete={handleCompleteStep}
            onReopen={handleReopenStep}
            busy={loading}
          />
          <ValidationPanel
            encounterId={encounterId}
            noteId={noteId}
            noteContent={noteContent}
            suggestions={suggestions}
            session={session}
            onSessionUpdate={handleSessionUpdate}
            onError={setError}
          />
          <AttestationPanel
            session={session}
            onSessionUpdate={handleSessionUpdate}
            onError={setError}
          />
          <DispatchPanel
            session={session}
            onSessionUpdate={handleSessionUpdate}
            onError={setError}
            onResult={setDispatchResult}
          />
          {dispatchResult && (
            <div className="card workflow-dispatch-result">
              <h2>{t('workflow.dispatchResultHeading')}</h2>
              <pre>{JSON.stringify(dispatchResult, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WorkflowView;
