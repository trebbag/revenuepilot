// Typed API client wrappers around existing JS functions in api.js
// Provides debounced-friendly helpers and TypeScript interfaces for the new
// NoteEditor implementation.

import {
  beautifyNote as beautifyNoteRaw,
  getSuggestions as getSuggestionsRaw,
  scheduleFollowUp as scheduleFollowUpRaw,
  listScheduleAppointments as listScheduleAppointmentsRaw,
  createScheduleAppointment as createScheduleAppointmentRaw,
  exportAppointmentIcs as exportAppointmentIcsRaw,
  scheduleBulkOperations as scheduleBulkOperationsRaw,
} from '../api.js';

export interface BeautifyContext {
  lang?: string;
  specialty?: string;
  payer?: string;
  useLocalModels?: boolean;
  beautifyModel?: string;
}

export interface SuggestContext {
  lang?: string;
  chart?: string;
  rules?: string[];
  audio?: string;
  age?: number;
  sex?: string;
  region?: string;
  specialty?: string;
  payer?: string;
  template?: string | number | null;
  agencies?: string[];
  useLocalModels?: boolean;
  suggestModel?: string;
}

export interface CodeSuggestion {
  code: string;
  rationale?: string;
  upgrade_to?: string;
  upgradePath?: string;
}
export interface PublicHealthSuggestion {
  recommendation: string;
  reason?: string;
  source?: string;
  evidenceLevel?: string;
  regions?: string[];
  region?: string;
}
export interface DifferentialSuggestion {
  diagnosis: string;
  score?: number;
}
export interface FollowUpSuggestion {
  interval: string;
  reason?: string;
  ics?: string;
}

export interface SuggestionsResult {
  codes: CodeSuggestion[];
  compliance: string[];
  publicHealth: PublicHealthSuggestion[];
  differentials: DifferentialSuggestion[];
  followUp?: FollowUpSuggestion | null;
}

export async function beautifyNote(text: string, context: BeautifyContext = {}): Promise<string> {
  return beautifyNoteRaw(text, context.lang, context);
}

export async function getSuggestions(text: string, context: SuggestContext = {}): Promise<SuggestionsResult> {
  return getSuggestionsRaw(text, context);
}

export interface ScheduleRequest {
  text: string;
  codes?: string[];
  specialty?: string;
  payer?: string;
  patient?: string;
  reason?: string;
}

export interface ScheduleResponse {
  interval: string | null;
  ics: string | null;
  reason?: string | null;
}

export interface AppointmentInput {
  patient: string;
  reason: string;
  start: Date | string | number;
  end?: Date | string | number;
  provider?: string;
  patientId?: string;
  encounterId?: string;
  location?: string;
}

export interface AppointmentRecord {
  id: number;
  patient: string;
  reason: string;
  start: Date | null;
  end: Date | null;
  provider?: string | null;
  status?: string | null;
  patientId?: string | null;
  encounterId?: string | null;
  location?: string | null;
  visitSummary?: Record<string, unknown> | null;
}

export interface AppointmentListResult {
  appointments: AppointmentRecord[];
  visitSummaries: Record<string, unknown>;
}

export interface ScheduleBulkOperationInput {
  id: number;
  action: string;
  time?: Date | string | number;
}

export interface ScheduleBulkRequest {
  updates: ScheduleBulkOperationInput[];
  provider?: string;
}

export interface ScheduleBulkSummary {
  succeeded: number;
  failed: number;
}

function toIsoString(value: Date | string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const padded = trimmed.length === 16 && trimmed.includes('T') ? `${trimmed}:00` : trimmed;
  const dt = new Date(padded);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return trimmed;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value === 'string') {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function mapAppointment(raw: any): AppointmentRecord {
  return {
    id: typeof raw?.id === 'number' ? raw.id : Number.parseInt(raw?.id ?? '0', 10) || 0,
    patient: typeof raw?.patient === 'string' ? raw.patient : '',
    reason: typeof raw?.reason === 'string' ? raw.reason : '',
    start: parseDate(raw?.start),
    end: parseDate(raw?.end),
    provider: raw?.provider ?? null,
    status: raw?.status ?? null,
    patientId: raw?.patientId ?? null,
    encounterId: raw?.encounterId ?? null,
    location: raw?.location ?? null,
    visitSummary: raw?.visitSummary ?? null,
  };
}

export async function scheduleFollowUp(request: ScheduleRequest): Promise<ScheduleResponse> {
  const payload = {
    ...request,
    codes: Array.isArray(request.codes) ? request.codes : [],
  };
  const data = await scheduleFollowUpRaw(payload);
  return {
    interval: data?.interval ?? null,
    ics: data?.ics ?? null,
    reason: data?.reason ?? null,
  };
}

export async function listAppointments(): Promise<AppointmentListResult> {
  const data = await listScheduleAppointmentsRaw();
  const appointments = Array.isArray(data?.appointments)
    ? data.appointments.map(mapAppointment)
    : [];
  return {
    appointments,
    visitSummaries: (data?.visitSummaries as Record<string, unknown>) || {},
  };
}

export async function createAppointment(appt: AppointmentInput): Promise<AppointmentRecord> {
  const payload: Record<string, unknown> = {
    patient: appt.patient,
    reason: appt.reason,
    start: toIsoString(appt.start),
  };
  if (appt.end !== undefined) payload.end = toIsoString(appt.end);
  if (appt.provider) payload.provider = appt.provider;
  if (appt.patientId) payload.patientId = appt.patientId;
  if (appt.encounterId) payload.encounterId = appt.encounterId;
  if (appt.location) payload.location = appt.location;
  const data = await createScheduleAppointmentRaw(payload);
  return mapAppointment(data);
}

export async function exportAppointmentIcs(id: number): Promise<string> {
  const text = await exportAppointmentIcsRaw(id);
  return typeof text === 'string' ? text : '';
}

export async function scheduleBulkOperations(request: ScheduleBulkRequest): Promise<ScheduleBulkSummary> {
  const payload = {
    updates: request.updates.map((item) => {
      const update: Record<string, unknown> = {
        id: item.id,
        action: item.action,
      };
      const time = toIsoString(item.time);
      if (time) update.time = time;
      return update;
    }),
    ...(request.provider ? { provider: request.provider } : {}),
  };
  const data = await scheduleBulkOperationsRaw(payload);
  return {
    succeeded: typeof data?.succeeded === 'number' ? data.succeeded : 0,
    failed: typeof data?.failed === 'number' ? data.failed : 0,
  };
}
