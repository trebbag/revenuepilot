import type { PatientMetadata, VisitTranscriptEntry } from "./WorkflowWizard"

export type WorkflowStepStatus = "not_started" | "in_progress" | "completed" | "blocked"

export interface WorkflowStepState {
  step?: number | string | null
  status?: WorkflowStepStatus | string | null
  progress?: number | null
  startedAt?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  notes?: string | null
  blockingIssues?: string[]
}

export interface WorkflowReimbursementSummary {
  total?: number
  codes?: Array<Record<string, unknown>>
}

export interface WorkflowSessionResponsePayload {
  sessionId: string
  encounterId?: string | null
  patientId?: string | null
  noteId?: string | null
  currentStep?: number | null
  stepStates?: WorkflowStepState[] | Record<string, WorkflowStepState>
  selectedCodes?: Array<Record<string, unknown>>
  complianceIssues?: Array<Record<string, unknown>>
  patientMetadata?: Record<string, unknown> | PatientMetadata
  noteContent?: string | null
  reimbursementSummary?: WorkflowReimbursementSummary
  auditTrail?: Array<Record<string, unknown>>
  patientQuestions?: Array<Record<string, unknown>>
  blockingIssues?: string[]
  sessionProgress?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
  attestation?: Record<string, unknown>
  dispatch?: Record<string, unknown>
  lastValidation?: Record<string, unknown>
  transcriptEntries?: VisitTranscriptEntry[]
  [key: string]: unknown
}

export interface PreFinalizeCheckResponse {
  canFinalize: boolean
  issues?: Record<string, unknown>
  requiredFields?: string[]
  missingDocumentation?: string[]
  stepValidation?: Record<string, unknown>
  complianceIssues?: Array<Record<string, unknown>>
  estimatedReimbursement?: number
  reimbursementSummary?: WorkflowReimbursementSummary
}

export interface FinalizeNoteResponse extends PreFinalizeCheckResponse {
  finalizedContent: string
  codesSummary: Array<Record<string, unknown>>
  exportReady: boolean
  exportStatus?: string
  complianceCertification?: Record<string, unknown>
  finalizedNoteId?: string
  estimatedReimbursement?: number
}

export interface StoredFinalizationSession extends WorkflowSessionResponsePayload {
  lastPreFinalize?: PreFinalizeCheckResponse
  lastFinalizeResult?: FinalizeNoteResponse
}
