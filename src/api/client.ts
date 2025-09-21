// Typed API client wrappers around existing JS functions in api.js
// Provides debounced-friendly helpers and TypeScript interfaces for the new
// NoteEditor implementation.

import {
  beautifyNote as beautifyNoteRaw,
  getSuggestions as getSuggestionsRaw,
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
