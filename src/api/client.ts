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
  createWorkflowSession as createWorkflowSessionRaw,
  getWorkflowSession as getWorkflowSessionRaw,
  updateWorkflowStep as updateWorkflowStepRaw,
  attestWorkflowSession as attestWorkflowSessionRaw,
  dispatchWorkflowSession as dispatchWorkflowSessionRaw,
  updateWorkflowNoteContent as updateWorkflowNoteContentRaw,
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
  encounterId?: string;
  sessionId?: string;
  noteId?: string;
  intent?: 'auto' | 'manual' | 'finalize';
  transcriptCursor?: string;
  acceptedJson?: Record<string, unknown> | null;
  force?: boolean;
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

export interface WorkflowStepState {
  step?: number | string | null;
  status?: string | null;
  progress?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
  blockingIssues?: string[] | null;
}

export interface WorkflowSessionData {
  sessionId: string;
  encounterId?: string | null;
  patientId?: string | null;
  noteId?: string | null;
  currentStep?: number | null;
  stepStates?: WorkflowStepState[] | Record<string, WorkflowStepState> | null;
  reimbursementSummary?: Record<string, unknown> | null;
  lastValidation?: Record<string, unknown> | null;
  attestation?: Record<string, unknown> | null;
  dispatch?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface WorkflowValidationResponse {
  encounterId?: string | null;
  sessionId?: string | null;
  noteContent?: string | null;
  reimbursementSummary?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  session?: WorkflowSessionData | null;
  [key: string]: unknown;
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
  patient?: string;
  reason?: string;
  start: Date | string | number;
  end?: Date | string | number;
  provider?: string;
  patientId?: string;
  encounterId?: string;
  location?: string;
  providerId?: string;
  locationId?: string;
  type?: string;
  notes?: string;
  allowOverlap?: boolean;
  locationCapacity?: number;
  timeZone?: string;
  metadata?: Record<string, unknown>;
  chart?: Record<string, unknown>;
}

export interface AppointmentRecord {
  id: number;
  patient: string;
  reason: string;
  start: Date | null;
  end: Date | null;
  provider?: string | null;
  providerId?: string | null;
  status?: string | null;
  patientId?: string | null;
  encounterId?: string | null;
  location?: string | null;
  locationId?: string | null;
  appointmentType?: string | null;
  notes?: string | null;
  correlationId?: string | null;
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
    providerId: raw?.providerId ?? null,
    status: raw?.status ?? null,
    patientId: raw?.patientId ?? null,
    encounterId: raw?.encounterId ?? null,
    location: raw?.location ?? null,
    locationId: raw?.locationId ?? null,
    appointmentType: raw?.appointmentType ?? raw?.type ?? null,
    notes: raw?.notes ?? null,
    correlationId: raw?.correlationId ?? null,
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
    start: toIsoString(appt.start),
  };
  if (appt.end !== undefined) payload.end = toIsoString(appt.end);
  if (appt.provider) payload.provider = appt.provider;
  if (appt.patientId) payload.patientId = appt.patientId;
  if (appt.encounterId) payload.encounterId = appt.encounterId;
  if (appt.location) payload.location = appt.location;
  if (appt.providerId) payload.providerId = appt.providerId;
  if (appt.locationId) payload.locationId = appt.locationId;
  if (appt.type) payload.type = appt.type;
  if (appt.notes) payload.notes = appt.notes;
  if (appt.allowOverlap !== undefined) payload.allowOverlap = appt.allowOverlap;
  if (appt.locationCapacity !== undefined) payload.locationCapacity = appt.locationCapacity;
  if (appt.timeZone) payload.timeZone = appt.timeZone;
  if (appt.metadata) payload.metadata = appt.metadata;
  if (appt.chart) payload.chart = appt.chart;
  if (!payload.patientId && appt.patient) {
    payload.patientId = appt.patient;
  }
  if (!payload.type && appt.reason) {
    payload.type = appt.reason;
  }
  if (!payload.notes && appt.reason) {
    payload.notes = appt.reason;
  }
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

export async function createWorkflowSession(payload: Record<string, unknown>): Promise<WorkflowSessionData> {
  return createWorkflowSessionRaw(payload);
}

export async function getWorkflowSession(sessionId: string): Promise<WorkflowSessionData> {
  return getWorkflowSessionRaw(sessionId);
}

export async function updateWorkflowStep(
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<WorkflowSessionData> {
  return updateWorkflowStepRaw(sessionId, payload);
}

export async function attestWorkflowSession(
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<WorkflowSessionData> {
  const response = await attestWorkflowSessionRaw(sessionId, payload);
  if (response && typeof response === 'object' && 'session' in response) {
    const maybeSession = (response as { session?: WorkflowSessionData }).session;
    if (maybeSession) return maybeSession;
  }
  return response as WorkflowSessionData;
}

export async function dispatchWorkflowSession(
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<{ session: WorkflowSessionData; result?: Record<string, unknown> }> {
  const response = await dispatchWorkflowSessionRaw(sessionId, payload);
  if (response && typeof response === 'object') {
    const session = (response as { session?: WorkflowSessionData }).session;
    if (session) {
      return {
        session,
        result: (response as { result?: Record<string, unknown> }).result,
      };
    }
  }
  return { session: response as WorkflowSessionData };
}

export async function updateWorkflowNoteContent(
  encounterId: string,
  payload: Record<string, unknown>,
): Promise<WorkflowValidationResponse> {
  return updateWorkflowNoteContentRaw(encounterId, payload);

}
