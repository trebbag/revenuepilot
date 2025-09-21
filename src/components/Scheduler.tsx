import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppointmentRecord,
  scheduleFollowUp,
  listAppointments,
  createAppointment,
  exportAppointmentIcs,
  scheduleBulkOperations,
} from '../api/client';

interface SchedulerProps {
  note: string;
  codes?: string[];
  specialty?: string;
  payer?: string;
  patientId?: string;
  encounterId?: string;
}

interface CreateFormState {
  patient: string;
  reason: string;
  start: string;
  end: string;
  provider: string;
  location: string;
}

const formatDateTimeLocal = (date: Date): string => {
  const iso = date.toISOString();
  return iso.slice(0, 16);
};

const defaultStartValue = () => {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  return formatDateTimeLocal(next);
};

const Scheduler: React.FC<SchedulerProps> = ({
  note,
  codes = [],
  specialty,
  payer,
  patientId,
  encounterId,
}) => {
  const { t } = useTranslation();
  const [interval, setInterval] = useState('');
  const [reason, setReason] = useState('');
  const [ics, setIcs] = useState('');
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [visitSummaries, setVisitSummaries] = useState<Record<string, unknown>>({});
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState('complete');
  const [bulkTime, setBulkTime] = useState('');
  const [bulkProvider, setBulkProvider] = useState('');
  const [createForm, setCreateForm] = useState<CreateFormState>({
    patient: patientId || '',
    reason: '',
    start: defaultStartValue(),
    end: '',
    provider: '',
    location: '',
  });

  const codeList = useMemo(() => codes.filter(Boolean), [codes]);

  const refreshAppointments = useCallback(async () => {
    setLoadingAppointments(true);
    try {
      const data = await listAppointments();
      setAppointments(data.appointments);
      setVisitSummaries(data.visitSummaries);
      setSelected((prev) =>
        prev.filter((id) => data.appointments.some((appt) => appt.id === id)),
      );
    } catch (err) {
      console.error(err);
      setError(t('scheduler.errors.loadAppointments'));
    } finally {
      setLoadingAppointments(false);
    }
  }, [t]);

  useEffect(() => {
    refreshAppointments();
  }, [refreshAppointments]);

  useEffect(() => {
    if (patientId && patientId !== createForm.patient) {
      setCreateForm((prev) => ({ ...prev, patient: patientId }));
    }
  }, [patientId]);

  const handleRecommend = async () => {
    setLoadingRecommendation(true);
    setError(null);
    try {
      const response = await scheduleFollowUp({
        text: note || '',
        codes: codeList,
        specialty,
        payer,
        patient: createForm.patient || patientId || undefined,
        reason: createForm.reason || undefined,
      });
      setInterval(response.interval || '');
      setIcs(response.ics || '');
      setReason(response.reason || '');
    } catch (err) {
      console.error(err);
      setError(t('scheduler.errors.recommendation'));
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!createForm.patient || !createForm.reason || !createForm.start) {
      setError(t('scheduler.errors.createRequired'));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createAppointment({
        patient: createForm.patient,
        reason: createForm.reason,
        start: createForm.start,
        end: createForm.end || undefined,
        provider: createForm.provider || undefined,
        patientId: patientId || undefined,
        encounterId: encounterId || undefined,
        location: createForm.location || undefined,
      });
      setCreateForm((prev) => ({
        ...prev,
        reason: '',
        start: defaultStartValue(),
        end: '',
      }));
      await refreshAppointments();
    } catch (err) {
      console.error(err);
      setError(t('scheduler.errors.create'));
    } finally {
      setCreating(false);
    }
  };

  const downloadFollowUp = () => {
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'follow-up.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAppointment = async (id: number) => {
    try {
      const text = await exportAppointmentIcs(id);
      if (!text) return;
      const blob = new Blob([text], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `appointment-${id}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(t('scheduler.errors.export'));
    }
  };

  const toggleSelection = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (!appointments.length) return;
    if (selected.length === appointments.length) {
      setSelected([]);
    } else {
      setSelected(appointments.map((appt) => appt.id));
    }
  };

  const handleBulkApply = async () => {
    if (!selected.length) {
      setError(t('scheduler.errors.noSelection'));
      return;
    }
    if (bulkAction === 'reschedule' && !bulkTime) {
      setError(t('scheduler.errors.missingTime'));
      return;
    }
    setApplyingBulk(true);
    setError(null);
    setBulkStatus('');
    try {
      const updates = selected.map((id) => ({
        id,
        action: bulkAction,
        ...(bulkAction === 'reschedule' ? { time: bulkTime } : {}),
      }));
      const result = await scheduleBulkOperations({
        updates,
        provider: bulkProvider || undefined,
      });
      setBulkStatus(
        t('scheduler.bulkResult', {
          count: result.succeeded,
          failed: result.failed,
        }),
      );
      await refreshAppointments();
    } catch (err) {
      console.error(err);
      setError(t('scheduler.errors.bulk'));
    } finally {
      setApplyingBulk(false);
    }
  };

  return (
    <div className="scheduler-view">
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('scheduler.title')}</h2>
        <p className="muted">{t('scheduler.subtitle')}</p>
        <div className="scheduler-recommend">
          <button onClick={handleRecommend} disabled={loadingRecommendation}>
            {loadingRecommendation
              ? t('scheduler.recommending')
              : t('scheduler.recommend')}
          </button>
          <label style={{ marginLeft: '1rem' }}>
            <span className="input-label">{t('scheduler.intervalLabel')}</span>
            <input
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              placeholder={t('scheduler.intervalPlaceholder')}
            />
          </label>
          {ics && (
            <button onClick={downloadFollowUp} style={{ marginLeft: '1rem' }}>
              {t('scheduler.downloadFollowUp')}
            </button>
          )}
        </div>
        {reason && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            <strong>{t('scheduler.reasonLabel')}:</strong> {reason}
          </p>
        )}
      </div>

      <form className="card" onSubmit={handleCreate} style={{ marginBottom: '1rem' }}>
        <h3>{t('scheduler.createTitle')}</h3>
        <div className="grid" style={{ gap: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>
            <span className="input-label">{t('scheduler.patientLabel')}</span>
            <input
              value={createForm.patient}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, patient: event.target.value }))
              }
              placeholder={t('scheduler.patientPlaceholder')}
            />
          </label>
          <label>
            <span className="input-label">{t('scheduler.reasonField')}</span>
            <input
              value={createForm.reason}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, reason: event.target.value }))
              }
              placeholder={t('scheduler.reasonPlaceholder')}
            />
          </label>
          <label>
            <span className="input-label">{t('scheduler.startField')}</span>
            <input
              type="datetime-local"
              value={createForm.start}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, start: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="input-label">{t('scheduler.endField')}</span>
            <input
              type="datetime-local"
              value={createForm.end}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, end: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="input-label">{t('scheduler.providerField')}</span>
            <input
              value={createForm.provider}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, provider: event.target.value }))
              }
              placeholder={t('scheduler.providerPlaceholder')}
            />
          </label>
          <label>
            <span className="input-label">{t('scheduler.locationField')}</span>
            <input
              value={createForm.location}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, location: event.target.value }))
              }
              placeholder={t('scheduler.locationPlaceholder')}
            />
          </label>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button type="submit" disabled={creating}>
            {creating ? t('scheduler.creating') : t('scheduler.createButton')}
          </button>
        </div>
      </form>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{t('scheduler.bulkTitle')}</h3>
          <div>
            <button type="button" onClick={toggleAll} disabled={!appointments.length}>
              {selected.length === appointments.length
                ? t('scheduler.bulkClear')
                : t('scheduler.bulkSelectAll')}
            </button>
          </div>
        </div>
        <p className="muted">{t('scheduler.bulkDescription')}</p>
        <div className="bulk-controls" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label>
            <span className="input-label">{t('scheduler.bulkAction')}</span>
            <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}>
              <option value="check-in">{t('scheduler.actions.checkIn')}</option>
              <option value="complete">{t('scheduler.actions.complete')}</option>
              <option value="cancel">{t('scheduler.actions.cancel')}</option>
              <option value="reschedule">{t('scheduler.actions.reschedule')}</option>
            </select>
          </label>
          {bulkAction === 'reschedule' && (
            <label>
              <span className="input-label">{t('scheduler.bulkTime')}</span>
              <input
                type="datetime-local"
                value={bulkTime}
                onChange={(event) => setBulkTime(event.target.value)}
              />
            </label>
          )}
          <label>
            <span className="input-label">{t('scheduler.bulkProvider')}</span>
            <input
              value={bulkProvider}
              onChange={(event) => setBulkProvider(event.target.value)}
              placeholder={t('scheduler.bulkProviderPlaceholder')}
            />
          </label>
          <div style={{ alignSelf: 'flex-end' }}>
            <button type="button" onClick={handleBulkApply} disabled={applyingBulk}>
              {applyingBulk ? t('scheduler.applyingBulk') : t('scheduler.applyBulk')}
            </button>
          </div>
        </div>
        {bulkStatus && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            {bulkStatus}
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{t('scheduler.appointmentsTitle')}</h3>
          <button type="button" onClick={refreshAppointments} disabled={loadingAppointments}>
            {loadingAppointments ? t('scheduler.refreshing') : t('scheduler.refresh')}
          </button>
        </div>
        {!appointments.length && !loadingAppointments ? (
          <p className="muted">{t('scheduler.empty')}</p>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={appointments.length > 0 && selected.length === appointments.length}
                      onChange={toggleAll}
                      aria-label={t('scheduler.bulkSelectAll') || 'select'}
                    />
                  </th>
                  <th>{t('scheduler.table.patient')}</th>
                  <th>{t('scheduler.table.reason')}</th>
                  <th>{t('scheduler.table.start')}</th>
                  <th>{t('scheduler.table.end')}</th>
                  <th>{t('scheduler.table.status')}</th>
                  <th>{t('scheduler.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => {
                  const summaryKey = String(appt.id);
                  const summary = visitSummaries[summaryKey] as Record<string, unknown> | undefined;
                  const details = summary && typeof summary === 'object' ? summary : null;
                  return (
                    <tr key={appt.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(appt.id)}
                          onChange={() => toggleSelection(appt.id)}
                          aria-label={t('scheduler.checkboxLabel', { id: appt.id })}
                        />
                      </td>
                      <td>{appt.patient}</td>
                      <td>
                        {appt.reason}
                        {details && details['note'] && (
                          <div className="muted" style={{ fontSize: '0.85em' }}>
                            {String(details['note'])}
                          </div>
                        )}
                      </td>
                      <td>{appt.start ? appt.start.toLocaleString() : '—'}</td>
                      <td>{appt.end ? appt.end.toLocaleString() : '—'}</td>
                      <td>{appt.status || t('scheduler.unknownStatus')}</td>
                      <td>
                        <button type="button" onClick={() => handleExportAppointment(appt.id)}>
                          {t('scheduler.exportAppointment')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && (
        <div className="error" role="alert" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default Scheduler;
