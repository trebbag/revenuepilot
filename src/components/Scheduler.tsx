import React, { useEffect, useState } from 'react';
import { scheduleFollowUpTyped, listAppointments, createAppointment, exportAppointmentIcs, AppointmentRecord } from '../api/client';

interface Props {
  note: string;
  codes?: string[];
  specialty?: string;
  payer?: string;
}

const Scheduler: React.FC<Props> = ({ note, codes = [], specialty, payer }) => {
  const [interval, setInterval] = useState<string>('');
  const [ics, setIcs] = useState<string>('');
  const [appts, setAppts] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState('');
  const [reason, setReason] = useState('');
  const [start, setStart] = useState<string>('');
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const data = await listAppointments();
      setAppts(data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function recommend() {
    setLoading(true);
    try {
      const res = await scheduleFollowUpTyped({ text: note, codes, specialty, payer });
      setInterval(res.interval || '');
      setIcs(res.ics || '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function addAppointment() {
    if (!patient || !reason || !start) return;
    setCreating(true);
    try {
      await createAppointment({ patient, reason, start });
      setPatient('');
      setReason('');
      setStart('');
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  function downloadIcsRecord(id: number) {
    exportAppointmentIcs(id).then(text => {
      const blob = new Blob([text], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appointment-${id}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function downloadFollowUp() {
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'follow-up.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="scheduler">
      <div style={{ marginBottom: '1em' }}>
        <button onClick={recommend} disabled={loading}>Recommend Follow-up</button>
        <input value={interval} onChange={e => setInterval(e.target.value)} placeholder="e.g. 3 months" />
        {ics && <button onClick={downloadFollowUp}>Export .ics</button>}
      </div>
      <div style={{ border: '1px solid #ccc', padding: '0.5em', marginBottom: '1em' }}>
        <h4>Create Appointment</h4>
        <input placeholder="Patient" value={patient} onChange={e => setPatient(e.target.value)} />
        <input placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
        <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
        <button onClick={addAppointment} disabled={creating}>Add</button>
      </div>
      <h4>Upcoming Appointments</h4>
      <table style={{ width: '100%', fontSize: '0.9em' }}>
        <thead><tr><th>ID</th><th>Patient</th><th>Reason</th><th>Start</th><th>End</th><th>ICS</th></tr></thead>
        <tbody>
          {appts.map(a => (
            <tr key={a.id}>
              <td>{a.id}</td>
              <td>{a.patient}</td>
              <td>{a.reason}</td>
              <td>{new Date(a.start!).toLocaleString()}</td>
              <td>{new Date(a.end!).toLocaleString()}</td>
              <td><button onClick={() => downloadIcsRecord(a.id)}>Export</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Scheduler;
