import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import "finalization-wizard/dist/style.css"

import {
  FinalizationWizard,
  type FinalizeRequest,
  type FinalizeResult,
  type PatientMetadata,
  type WizardCodeItem,
  type WizardComplianceItem,
  type WizardStepOverride
} from "finalization-wizard"

type FetchWithAuth = (
  input: RequestInfo | URL,
  init?: (RequestInit & { json?: boolean; jsonBody?: unknown }) | undefined
) => Promise<Response>

type ComplianceLike = {
  id?: string | null
  title?: string | null
  description?: string | null
  details?: string | null
  category?: string | null
  code?: string | null
  severity?: string | null
  dismissed?: boolean | null
  [key: string]: unknown
}

type SessionCodeLike = {
  id?: number | string | null
  code?: string | null
  type?: string | null
  category?: string | null
  description?: string | null
  rationale?: string | null
  confidence?: number | null
  reimbursement?: string | null
  rvu?: string | null
  [key: string]: unknown
}

type TranscriptEntryLike = {
  id?: string | number | null
  text?: string | null
  speaker?: string | null
  timestamp?: number | string | null
  confidence?: number | null
  [key: string]: unknown
}

interface PatientInfoInput {
  patientId?: string | null
  encounterId?: string | null
  name?: string | null
  age?: number | null
  sex?: string | null
  encounterDate?: string | null
}

export interface PreFinalizeCheckResponse {
  canFinalize: boolean
  issues?: Record<string, unknown>
  estimatedReimbursement?: number
  reimbursementSummary?: {
    total: number
    codes: Array<Record<string, unknown>>
  }
  [key: string]: unknown
}

interface FinalizationWizardAdapterProps {
  isOpen: boolean
  onClose: (result?: FinalizeResult) => void
  selectedCodesList: SessionCodeLike[]
  complianceIssues: ComplianceLike[]
  noteContent?: string
  patientInfo?: PatientInfoInput
  transcriptEntries?: TranscriptEntryLike[]
  stepOverrides?: WizardStepOverride[]
  noteId: string | null
  fetchWithAuth: FetchWithAuth
  onPreFinalizeResult?: (result: PreFinalizeCheckResponse) => void
  onError?: (message: string, error?: unknown) => void
}

type FinalizeRequestWithContext = FinalizeRequest & { noteId?: string }

type CodeCategory = "codes" | "prevention" | "diagnoses" | "differentials"

const CODE_CLASSIFICATION_MAP: Record<CodeCategory, string> = {
  codes: "code",
  prevention: "prevention",
  diagnoses: "diagnosis",
  differentials: "differential"
}

const COMPLIANCE_SEVERITY_MAP: Record<string, WizardComplianceItem["severity"]> = {
  critical: "high",
  warning: "medium",
  info: "low"
}

const mapComplianceSeverityToStatus = (
  severity?: string | null,
  dismissed?: boolean | null
): ComplianceCheckPayload["status"] => {
  if (dismissed) {
    return "not_applicable"
  }
  const normalized = typeof severity === "string" ? severity.toLowerCase() : ""
  if (normalized === "critical" || normalized === "high") {
    return "fail"
  }
  if (normalized === "warning" || normalized === "medium") {
    return "warning"
  }
  if (normalized === "info" || normalized === "low") {
    return "pass"
  }
  return "warning"
}

const deriveBillingValidation = (
  validation: PreFinalizeCheckResponse | undefined,
  reimbursementSummary: NoteContentUpdateResponsePayload["reimbursementSummary"] | undefined
): BillingValidationPayload => {
  const issues = validation?.issues && typeof validation.issues === "object" ? validation.issues : {}
  const issueList = (key: string): unknown[] => {
    const value = (issues as Record<string, unknown>)[key]
    return Array.isArray(value) ? value : []
  }

  const estimated =
    typeof validation?.estimatedReimbursement === "number"
      ? validation.estimatedReimbursement
      : typeof reimbursementSummary?.total === "number"
        ? reimbursementSummary.total
        : undefined

  return {
    codesValidated: issueList("codes").length === 0,
    documentationLevelVerified: issueList("content").length === 0,
    medicalNecessityConfirmed: issueList("compliance").length === 0,
    billingComplianceChecked:
      issueList("compliance").length === 0 && issueList("prevention").length === 0,
    estimatedReimbursement: typeof estimated === "number" ? estimated : 0,
    payerSpecificRequirements: []
  }
}

const deriveComplianceChecks = (issues: ComplianceLike[] | undefined): ComplianceCheckPayload[] => {
  if (!Array.isArray(issues)) {
    return []
  }

  return issues
    .map(issue => {
      if (!issue) return null
      const description =
        typeof issue.description === "string" && issue.description.trim().length > 0
          ? issue.description.trim()
          : typeof issue.details === "string" && issue.details.trim().length > 0
            ? issue.details.trim()
            : typeof issue.title === "string"
              ? issue.title.trim()
              : undefined
      const requiredActions: string[] = []
      if (typeof issue.details === "string" && issue.details.trim().length > 0) {
        requiredActions.push(issue.details.trim())
      }
      if (Array.isArray(issue.gaps)) {
        issue.gaps.forEach(entry => {
          if (typeof entry === "string" && entry.trim().length > 0) {
            requiredActions.push(entry.trim())
          }
        })
      }
      return {
        checkType:
          typeof issue.category === "string" && issue.category.trim().length > 0
            ? issue.category.trim()
            : "documentation_standards",
        status: mapComplianceSeverityToStatus(issue.severity, issue.dismissed),
        description,
        requiredActions
      } satisfies ComplianceCheckPayload
    })
    .filter((entry): entry is ComplianceCheckPayload => Boolean(entry))
}

const deriveBillingSummary = (
  codes: SessionCodeLike[] | undefined,
  reimbursementSummary: NoteContentUpdateResponsePayload["reimbursementSummary"] | undefined
): BillingSummaryPayload => {
  const list = Array.isArray(codes) ? codes : []
  const diagnoses: string[] = []
  const procedures: string[] = []
  const modifierCodes: string[] = []
  let totalRvu = 0

  list.forEach(item => {
    if (!item) return
    const codeValue = sanitizeString(item.code)
    const category = sanitizeString(item.category)
    if (category?.toLowerCase().includes("diagnos") || category?.toLowerCase().includes("differential")) {
      if (codeValue) {
        diagnoses.push(codeValue)
      }
    } else if (category?.toLowerCase().includes("procedure") || category?.toLowerCase().includes("code")) {
      if (codeValue) {
        procedures.push(codeValue)
      }
    } else if (codeValue && diagnoses.length === 0) {
      diagnoses.push(codeValue)
    }

    const rawModifiers = Array.isArray((item as Record<string, unknown>).modifiers)
      ? ((item as Record<string, unknown>).modifiers as unknown[])
      : Array.isArray((item as Record<string, unknown>).modifierCodes)
        ? ((item as Record<string, unknown>).modifierCodes as unknown[])
        : []
    rawModifiers.forEach(modifier => {
      if (typeof modifier === "string" && modifier.trim().length > 0) {
        modifierCodes.push(modifier.trim())
      }
    })

    const rvuValue = (item as Record<string, unknown>).rvu
    if (typeof rvuValue === "number" && Number.isFinite(rvuValue)) {
      totalRvu += rvuValue
    } else if (typeof rvuValue === "string") {
      const parsed = Number(rvuValue)
      if (Number.isFinite(parsed)) {
        totalRvu += parsed
      }
    }
  })

  const estimatedPayment =
    typeof reimbursementSummary?.total === "number" ? reimbursementSummary.total : undefined

  return {
    primaryDiagnosis: diagnoses[0],
    secondaryDiagnoses: diagnoses.slice(1),
    procedures,
    evaluationManagementLevel: procedures[0] ?? undefined,
    totalRvu: totalRvu > 0 ? totalRvu : 0,
    estimatedPayment: typeof estimatedPayment === "number" ? estimatedPayment : 0,
    modifierCodes
  }
}

const deriveFinalReview = (session?: WorkflowSessionResponsePayload | null): FinalReviewPayload => {
  const stepsArray: WorkflowStepStateLike[] = Array.isArray(session?.stepStates)
    ? (session?.stepStates as WorkflowStepStateLike[])
    : session?.stepStates && typeof session.stepStates === "object"
      ? (Object.values(session.stepStates) as WorkflowStepStateLike[])
      : []

  const allStepsCompleted = stepsArray.every(
    step => step && typeof step === "object" && step.status === "completed"
  )
  const hasBlocking = Array.isArray(session?.blockingIssues) && session.blockingIssues.length > 0

  return {
    allStepsCompleted,
    physicianFinalApproval: true,
    qualityReviewPassed: !hasBlocking,
    complianceVerified: !hasBlocking,
    readyForDispatch: allStepsCompleted && !hasBlocking
  }
}

const deriveDispatchOptions = (existing?: WorkflowDispatchPayload): DispatchOptionsPayload => {
  const base = existing?.dispatchOptions ?? {}
  return {
    sendToEmr: typeof base.sendToEmr === "boolean" ? base.sendToEmr : true,
    generatePatientSummary:
      typeof base.generatePatientSummary === "boolean" ? base.generatePatientSummary : false,
    scheduleFollowup:
      typeof base.scheduleFollowup === "boolean" ? base.scheduleFollowup : false,
    sendToBilling: typeof base.sendToBilling === "boolean" ? base.sendToBilling : true,
    notifyReferrals: typeof base.notifyReferrals === "boolean" ? base.notifyReferrals : false
  }
}

const deriveDispatchStatus = (
  timestamp: string,
  existing?: WorkflowDispatchPayload
): DispatchStatusPayload => {
  const base = existing?.dispatchStatus ?? {}
  const errors = Array.isArray(base.dispatchErrors)
    ? base.dispatchErrors.filter(error => typeof error === "string" && error.trim().length > 0)
    : []
  return {
    dispatchInitiated:
      typeof base.dispatchInitiated === "boolean" ? base.dispatchInitiated : true,
    dispatchCompleted:
      typeof base.dispatchCompleted === "boolean" ? base.dispatchCompleted : true,
    dispatchTimestamp: base.dispatchTimestamp ?? timestamp,
    dispatchConfirmationNumber: sanitizeString(base.dispatchConfirmationNumber ?? undefined),
    dispatchErrors: errors
  }
}

const derivePostDispatchActions = (
  existing?: WorkflowDispatchPayload
): PostDispatchActionPayload[] => {
  if (!Array.isArray(existing?.postDispatchActions)) {
    return []
  }
  return existing!.postDispatchActions!
    .map(action => {
      if (!action) return null
      return {
        actionType: sanitizeString(action.actionType ?? undefined),
        status: sanitizeString(action.status ?? undefined),
        scheduledTime: sanitizeString(action.scheduledTime ?? undefined),
        completionTime: sanitizeString(action.completionTime ?? undefined),
        errorMessage: sanitizeString(action.errorMessage ?? undefined),
        retryCount:
          typeof action.retryCount === "number" && Number.isFinite(action.retryCount)
            ? action.retryCount
            : 0
      }
    })
    .filter((entry): entry is PostDispatchActionPayload => Boolean(entry))
}

interface WorkflowStepStateLike {
  step?: number | string | null
  status?: string | null
  progress?: number | null
}

interface WorkflowSessionResponsePayload {
  sessionId: string
  encounterId?: string | null
  patientId?: string | null
  noteId?: string | null
  currentStep?: number | null
  stepStates?: WorkflowStepStateLike[] | Record<string, WorkflowStepStateLike>
  selectedCodes?: SessionCodeLike[]
  complianceIssues?: ComplianceLike[]
  patientMetadata?: Record<string, unknown>
  noteContent?: string | null
  reimbursementSummary?: {
    total?: number
    codes?: Array<Record<string, unknown>>
  }
  auditTrail?: Array<Record<string, unknown>>
  patientQuestions?: Array<Record<string, unknown>>
  blockingIssues?: string[]
  sessionProgress?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
  attestation?: WorkflowAttestationPayload
  dispatch?: WorkflowDispatchPayload
  lastValidation?: Record<string, unknown>
}

interface NoteContentUpdateResponsePayload {
  encounterId?: string | null
  sessionId: string
  noteContent: string
  reimbursementSummary: {
    total: number
    codes: Array<Record<string, unknown>>
  }
  validation: PreFinalizeCheckResponse
  session: WorkflowSessionResponsePayload
}

interface WorkflowAttestationResponsePayload {
  session: WorkflowSessionResponsePayload
}

interface DispatchResponsePayload {
  session: WorkflowSessionResponsePayload
  result: FinalizeResult
}

interface PayerRequirementPayload {
  payerName?: string | null
  requirementType?: string | null
  description?: string | null
  isMet?: boolean | null
  missingElements?: string[]
}

interface BillingValidationPayload {
  codesValidated: boolean
  documentationLevelVerified: boolean
  medicalNecessityConfirmed: boolean
  billingComplianceChecked: boolean
  estimatedReimbursement?: number
  payerSpecificRequirements?: PayerRequirementPayload[]
}

interface ComplianceCheckPayload {
  checkType?: string | null
  status?: "pass" | "fail" | "warning" | "not_applicable"
  description?: string | null
  requiredActions?: string[]
}

interface BillingSummaryPayload {
  primaryDiagnosis?: string | null
  secondaryDiagnoses?: string[]
  procedures?: string[]
  evaluationManagementLevel?: string | null
  totalRvu?: number | null
  estimatedPayment?: number | null
  modifierCodes?: string[]
}

interface AttestationDetailsPayload {
  physicianAttestation?: boolean
  attestationText?: string | null
  attestationTimestamp?: string | null
  digitalSignature?: string | null
  attestationIpAddress?: string | null
  attestedBy?: string | null
}

interface WorkflowAttestationPayload {
  billingValidation?: BillingValidationPayload
  attestation?: AttestationDetailsPayload
  complianceChecks?: ComplianceCheckPayload[]
  billingSummary?: BillingSummaryPayload
}

interface FinalReviewPayload {
  allStepsCompleted?: boolean
  physicianFinalApproval?: boolean
  qualityReviewPassed?: boolean
  complianceVerified?: boolean
  readyForDispatch?: boolean
}

interface DispatchOptionsPayload {
  sendToEmr?: boolean
  generatePatientSummary?: boolean
  scheduleFollowup?: boolean
  sendToBilling?: boolean
  notifyReferrals?: boolean
}

interface DispatchStatusPayload {
  dispatchInitiated?: boolean
  dispatchCompleted?: boolean
  dispatchTimestamp?: string | null
  dispatchConfirmationNumber?: string | null
  dispatchErrors?: string[]
}

interface PostDispatchActionPayload {
  actionType?: string | null
  status?: string | null
  scheduledTime?: string | null
  completionTime?: string | null
  errorMessage?: string | null
  retryCount?: number | null
}

interface WorkflowDispatchPayload {
  destination?: string | null
  deliveryMethod?: string | null
  timestamp?: string | null
  finalReview?: FinalReviewPayload
  dispatchOptions?: DispatchOptionsPayload
  dispatchStatus?: DispatchStatusPayload
  postDispatchActions?: PostDispatchActionPayload[]
}

interface BackendPayerRequirementPayload {
  payer_name?: string | null
  requirement_type?: string | null
  description?: string | null
  is_met?: boolean | null
  missing_elements: string[]
}

interface BackendBillingValidationPayload {
  codes_validated: boolean
  documentation_level_verified: boolean
  medical_necessity_confirmed: boolean
  billing_compliance_checked: boolean
  estimated_reimbursement: number
  payer_specific_requirements: BackendPayerRequirementPayload[]
}

interface BackendComplianceCheckPayload {
  check_type?: string | null
  status?: "pass" | "fail" | "warning" | "not_applicable"
  description?: string | null
  required_actions: string[]
}

interface BackendBillingSummaryPayload {
  primary_diagnosis?: string | null
  secondary_diagnoses: string[]
  procedures: string[]
  evaluation_management_level?: string | null
  total_rvu: number
  estimated_payment: number
  modifier_codes: string[]
}

interface BackendAttestationDetailsPayload {
  physician_attestation: boolean
  attestation_text?: string | null
  attestation_timestamp?: string | null
  digital_signature?: string | null
  attestation_ip_address?: string | null
  attestedBy?: string | null
}

interface AttestationRequestBodyPayload {
  encounterId: string
  sessionId: string
  billing_validation: BackendBillingValidationPayload
  attestation: BackendAttestationDetailsPayload
  compliance_checks: BackendComplianceCheckPayload[]
  billing_summary: BackendBillingSummaryPayload
}

interface BackendFinalReviewPayload {
  all_steps_completed: boolean
  physician_final_approval: boolean
  quality_review_passed: boolean
  compliance_verified: boolean
  ready_for_dispatch: boolean
}

interface BackendDispatchOptionsPayload {
  send_to_emr: boolean
  generate_patient_summary: boolean
  schedule_followup: boolean
  send_to_billing: boolean
  notify_referrals: boolean
}

interface BackendDispatchStatusPayload {
  dispatch_initiated: boolean
  dispatch_completed: boolean
  dispatch_timestamp?: string | null
  dispatch_confirmation_number?: string | null
  dispatch_errors: string[]
}

interface BackendPostDispatchActionPayload {
  action_type?: string | null
  status?: string | null
  scheduled_time?: string | null
  completion_time?: string | null
  error_message?: string | null
  retry_count: number
}

interface DispatchRequestBodyPayload {
  encounterId: string
  sessionId: string
  destination?: string
  deliveryMethod?: string
  timestamp?: string
  final_review: BackendFinalReviewPayload
  dispatch_options: BackendDispatchOptionsPayload
  dispatch_status: BackendDispatchStatusPayload
  post_dispatch_actions: BackendPostDispatchActionPayload[]
}

interface DispatchContextSnapshot {
  lastValidation?: PreFinalizeCheckResponse
  reimbursementSummary?: NoteContentUpdateResponsePayload["reimbursementSummary"]
  sessionAfterNoteUpdate?: WorkflowSessionResponsePayload
}

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const cleanStringList = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return []
  }
  return input
    .map(entry => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry): entry is string => entry.length > 0)
}

const toBackendPayerRequirement = (
  requirement: PayerRequirementPayload | undefined
): BackendPayerRequirementPayload => {
  return {
    payer_name: sanitizeString(requirement?.payerName ?? undefined) ?? undefined,
    requirement_type: sanitizeString(requirement?.requirementType ?? undefined) ?? undefined,
    description: sanitizeString(requirement?.description ?? undefined) ?? undefined,
    is_met: typeof requirement?.isMet === "boolean" ? requirement.isMet : undefined,
    missing_elements: cleanStringList(requirement?.missingElements)
  }
}

const toBackendBillingValidation = (
  payload: BillingValidationPayload | undefined
): BackendBillingValidationPayload => {
  const requirements =
    payload?.payerSpecificRequirements?.map(entry => toBackendPayerRequirement(entry)) ?? []
  return {
    codes_validated: Boolean(payload?.codesValidated),
    documentation_level_verified: Boolean(payload?.documentationLevelVerified),
    medical_necessity_confirmed: Boolean(payload?.medicalNecessityConfirmed),
    billing_compliance_checked: Boolean(payload?.billingComplianceChecked),
    estimated_reimbursement:
      typeof payload?.estimatedReimbursement === "number" && Number.isFinite(payload.estimatedReimbursement)
        ? payload.estimatedReimbursement
        : 0,
    payer_specific_requirements: requirements
  }
}

const toBackendComplianceChecks = (
  items: ComplianceCheckPayload[] | undefined
): BackendComplianceCheckPayload[] => {
  if (!Array.isArray(items)) {
    return []
  }
  return items.map(item => ({
    check_type: sanitizeString(item.checkType ?? undefined) ?? undefined,
    status: item.status ?? "warning",
    description: sanitizeString(item.description ?? undefined) ?? undefined,
    required_actions: cleanStringList(item.requiredActions)
  }))
}

const toBackendBillingSummary = (
  payload: BillingSummaryPayload | undefined
): BackendBillingSummaryPayload => {
  return {
    primary_diagnosis: sanitizeString(payload?.primaryDiagnosis ?? undefined) ?? undefined,
    secondary_diagnoses: cleanStringList(payload?.secondaryDiagnoses),
    procedures: cleanStringList(payload?.procedures),
    evaluation_management_level: sanitizeString(payload?.evaluationManagementLevel ?? undefined) ?? undefined,
    total_rvu: typeof payload?.totalRvu === "number" && Number.isFinite(payload.totalRvu) ? payload.totalRvu : 0,
    estimated_payment:
      typeof payload?.estimatedPayment === "number" && Number.isFinite(payload.estimatedPayment)
        ? payload.estimatedPayment
        : 0,
    modifier_codes: cleanStringList(payload?.modifierCodes)
  }
}

const toBackendAttestationDetails = (
  payload: AttestationDetailsPayload | undefined
): BackendAttestationDetailsPayload => {
  return {
    physician_attestation: Boolean(payload?.physicianAttestation),
    attestation_text: sanitizeString(payload?.attestationText ?? undefined) ?? undefined,
    attestation_timestamp: sanitizeString(payload?.attestationTimestamp ?? undefined) ?? undefined,
    digital_signature: sanitizeString(payload?.digitalSignature ?? undefined) ?? undefined,
    attestation_ip_address: sanitizeString(payload?.attestationIpAddress ?? undefined) ?? undefined,
    attestedBy: sanitizeString(payload?.attestedBy ?? undefined) ?? undefined
  }
}

const toBackendAttestationRequest = (input: {
  encounterId: string
  sessionId: string
  billingValidation: BillingValidationPayload | undefined
  attestation: AttestationDetailsPayload | undefined
  complianceChecks: ComplianceCheckPayload[] | undefined
  billingSummary: BillingSummaryPayload | undefined
}): AttestationRequestBodyPayload => {
  return {
    encounterId: input.encounterId,
    sessionId: input.sessionId,
    billing_validation: toBackendBillingValidation(input.billingValidation),
    attestation: toBackendAttestationDetails(input.attestation),
    compliance_checks: toBackendComplianceChecks(input.complianceChecks),
    billing_summary: toBackendBillingSummary(input.billingSummary)
  }
}

const toBackendFinalReview = (
  payload: FinalReviewPayload | undefined
): BackendFinalReviewPayload => ({
  all_steps_completed: Boolean(payload?.allStepsCompleted),
  physician_final_approval: Boolean(payload?.physicianFinalApproval),
  quality_review_passed: Boolean(payload?.qualityReviewPassed),
  compliance_verified: Boolean(payload?.complianceVerified),
  ready_for_dispatch: Boolean(payload?.readyForDispatch)
})

const toBackendDispatchOptions = (
  payload: DispatchOptionsPayload | undefined
): BackendDispatchOptionsPayload => ({
  send_to_emr: Boolean(payload?.sendToEmr),
  generate_patient_summary: Boolean(payload?.generatePatientSummary),
  schedule_followup: Boolean(payload?.scheduleFollowup),
  send_to_billing: Boolean(payload?.sendToBilling),
  notify_referrals: Boolean(payload?.notifyReferrals)
})

const toBackendDispatchStatus = (
  payload: DispatchStatusPayload | undefined
): BackendDispatchStatusPayload => ({
  dispatch_initiated: payload?.dispatchInitiated !== false,
  dispatch_completed: payload?.dispatchCompleted !== false,
  dispatch_timestamp: sanitizeString(payload?.dispatchTimestamp ?? undefined) ?? undefined,
  dispatch_confirmation_number: sanitizeString(payload?.dispatchConfirmationNumber ?? undefined) ?? undefined,
  dispatch_errors: cleanStringList(payload?.dispatchErrors)
})

const toBackendPostDispatchActions = (
  payload: PostDispatchActionPayload[] | undefined
): BackendPostDispatchActionPayload[] => {
  if (!Array.isArray(payload)) {
    return []
  }
  return payload.map(action => ({
    action_type: sanitizeString(action.actionType ?? undefined) ?? undefined,
    status: sanitizeString(action.status ?? undefined) ?? undefined,
    scheduled_time: sanitizeString(action.scheduledTime ?? undefined) ?? undefined,
    completion_time: sanitizeString(action.completionTime ?? undefined) ?? undefined,
    error_message: sanitizeString(action.errorMessage ?? undefined) ?? undefined,
    retry_count:
      typeof action.retryCount === "number" && Number.isFinite(action.retryCount) ? action.retryCount : 0
  }))
}

const toBackendDispatchRequest = (input: {
  encounterId: string
  sessionId: string
  destination?: string
  deliveryMethod?: string
  timestamp?: string
  finalReview: FinalReviewPayload | undefined
  dispatchOptions: DispatchOptionsPayload | undefined
  dispatchStatus: DispatchStatusPayload | undefined
  postDispatchActions: PostDispatchActionPayload[] | undefined
}): DispatchRequestBodyPayload => ({
  encounterId: input.encounterId,
  sessionId: input.sessionId,
  destination: input.destination,
  deliveryMethod: input.deliveryMethod,
  timestamp: input.timestamp,
  final_review: toBackendFinalReview(input.finalReview),
  dispatch_options: toBackendDispatchOptions(input.dispatchOptions),
  dispatch_status: toBackendDispatchStatus(input.dispatchStatus),
  post_dispatch_actions: toBackendPostDispatchActions(input.postDispatchActions)
})

const toWizardCodeItems = (list: SessionCodeLike[]): WizardCodeItem[] => {
  if (!Array.isArray(list)) {
    return []
  }

  return list.map((item, index) => {
    const code = sanitizeString(item.code)
    const description = sanitizeString(item.description)
    const rationale = sanitizeString(item.rationale)
    const type = sanitizeString(item.type)
    const category = sanitizeString(item.category)
    const classificationKey = (category ?? "codes") as CodeCategory
    const classification = CODE_CLASSIFICATION_MAP[classificationKey] ?? CODE_CLASSIFICATION_MAP.codes

    const identifier =
      typeof item.id === "number" || typeof item.id === "string"
        ? item.id
        : code
          ? `${code}-${index}`
          : `code-${index + 1}`

    const base: WizardCodeItem = {
      id: identifier,
      code: code ?? undefined,
      title: description ?? code ?? `Code ${index + 1}`,
      description: description ?? undefined,
      status: sanitizeString(item.status as string | undefined) ?? "pending",
      details: description ?? rationale ?? undefined,
      codeType: type ?? undefined,
      docSupport: sanitizeString(item.docSupport as string | undefined),
      stillValid: item.stillValid as boolean | undefined,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
      aiReasoning: rationale ?? undefined,
      evidence: Array.isArray(item.evidence)
        ? item.evidence.filter(entry => typeof entry === "string" && entry.trim().length > 0)
        : undefined,
      gaps: Array.isArray(item.gaps)
        ? item.gaps.filter(entry => typeof entry === "string" && entry.trim().length > 0)
        : undefined,
      tags: Array.isArray(item.tags)
        ? item.tags.filter(entry => typeof entry === "string" && entry.trim().length > 0)
        : undefined,
      reimbursement: sanitizeString(item.reimbursement),
      rvu: sanitizeString(item.rvu)
    }

    if (classification) {
      base.tags = [classification]
    }

    return base
  })
}

const toWizardComplianceItems = (list: ComplianceLike[]): WizardComplianceItem[] => {
  if (!Array.isArray(list)) {
    return []
  }

  return list
    .filter(issue => !issue?.dismissed)
    .map((issue, index) => {
      const id = sanitizeString(issue.id) ?? `issue-${index + 1}`
      const title = sanitizeString(issue.title) ?? sanitizeString(issue.description) ?? `Issue ${index + 1}`
      const description = sanitizeString(issue.description) ?? title
      const severityKey = sanitizeString(issue.severity)?.toLowerCase() ?? ""
      const severity = COMPLIANCE_SEVERITY_MAP[severityKey] ?? "medium"

      const item: WizardComplianceItem = {
        id,
        title,
        description,
        status: "pending",
        severity,
        category: sanitizeString(issue.category) ?? undefined,
        code: sanitizeString(issue.code) ?? undefined
      }

      return item
    })
}

const toPatientMetadata = (info?: PatientInfoInput): PatientMetadata | undefined => {
  if (!info) {
    return undefined
  }

  const metadata: PatientMetadata = {}
  const patientId = sanitizeString(info.patientId)
  const encounterId = sanitizeString(info.encounterId)
  const name = sanitizeString(info.name)
  const sex = sanitizeString(info.sex)
  const encounterDate = sanitizeString(info.encounterDate)

  if (patientId) metadata.patientId = patientId
  if (encounterId) metadata.encounterId = encounterId
  if (name) metadata.name = name
  if (typeof info.age === "number" && Number.isFinite(info.age)) metadata.age = info.age
  if (sex) metadata.sex = sex
  if (encounterDate) metadata.encounterDate = encounterDate

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function FinalizationWizardAdapter({
  isOpen,
  onClose,
  selectedCodesList,
  complianceIssues,
  noteContent,
  patientInfo,
  transcriptEntries,
  stepOverrides,
  noteId,
  fetchWithAuth,
  onPreFinalizeResult,
  onError
}: FinalizationWizardAdapterProps) {
  const [sessionData, setSessionData] = useState<WorkflowSessionResponsePayload | null>(null)
  const [wizardSuggestions, setWizardSuggestions] = useState<WizardCodeItem[]>([])
  const attestationPayloadRef = useRef<AttestationRequestBodyPayload | null>(null)
  const dispatchContextRef = useRef<DispatchContextSnapshot | null>(null)

  useEffect(() => {
    if (!isOpen) {
      attestationPayloadRef.current = null
      dispatchContextRef.current = null
    }
  }, [isOpen])

  const encounterId = useMemo(() => {
    const fromSession = sessionData?.encounterId
    if (typeof fromSession === "string" && fromSession.trim().length > 0) {
      return fromSession.trim()
    }
    if (typeof patientInfo?.encounterId === "string" && patientInfo.encounterId.trim().length > 0) {
      return patientInfo.encounterId.trim()
    }
    return "draft-encounter"
  }, [patientInfo?.encounterId, sessionData?.encounterId])

  const patientMetadataPayload = useMemo(() => {
    const payload: Record<string, unknown> = {}
    if (typeof patientInfo?.patientId === "string" && patientInfo.patientId.trim()) {
      payload.patientId = patientInfo.patientId.trim()
    }
    if (typeof patientInfo?.encounterId === "string" && patientInfo.encounterId.trim()) {
      payload.encounterId = patientInfo.encounterId.trim()
    }
    if (typeof patientInfo?.name === "string" && patientInfo.name.trim()) {
      payload.name = patientInfo.name.trim()
    }
    if (typeof patientInfo?.sex === "string" && patientInfo.sex.trim()) {
      payload.sex = patientInfo.sex.trim()
    }
    if (typeof patientInfo?.encounterDate === "string" && patientInfo.encounterDate.trim()) {
      payload.encounterDate = patientInfo.encounterDate.trim()
    }
    if (typeof patientInfo?.age === "number" && Number.isFinite(patientInfo.age)) {
      payload.age = patientInfo.age
    }
    return payload
  }, [patientInfo])

  const sanitizedTranscripts = useMemo(() => {
    if (!Array.isArray(transcriptEntries)) {
      return [] as Array<{ id: string | number; text: string; speaker?: string; timestamp?: number | string; confidence?: number }>
    }

    return transcriptEntries
      .map((entry, index) => {
        const textValue = typeof entry?.text === "string" ? entry.text.trim() : ""
        if (!textValue) {
          return null
        }

        const speakerValue =
          typeof entry?.speaker === "string" && entry.speaker.trim().length > 0
            ? entry.speaker.trim()
            : undefined

        let timestamp: number | string | undefined
        if (typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)) {
          timestamp = entry.timestamp
        } else if (typeof entry?.timestamp === "string" && entry.timestamp.trim().length > 0) {
          timestamp = entry.timestamp.trim()
        }

        const confidence =
          typeof entry?.confidence === "number" && Number.isFinite(entry.confidence)
            ? Math.max(0, Math.min(1, entry.confidence))
            : undefined

        return {
          id: entry?.id ?? index,
          text: textValue,
          speaker: speakerValue,
          timestamp,
          confidence,
        }
      })
      .filter((entry): entry is { id: string | number; text: string; speaker?: string; timestamp?: number | string; confidence?: number } => Boolean(entry))
  }, [transcriptEntries])

  const selectedCodeSet = useMemo(() => {
    const codes = Array.isArray(selectedCodesList) ? selectedCodesList : []
    const identifiers = codes
      .map(codeItem =>
        typeof codeItem?.code === "string" && codeItem.code.trim().length > 0
          ? codeItem.code.trim().toUpperCase()
          : typeof codeItem?.description === "string" && codeItem.description.trim().length > 0
            ? codeItem.description.trim().toUpperCase()
            : undefined
      )
      .filter((value): value is string => Boolean(value))
    return new Set(identifiers)
  }, [selectedCodesList])

  const initializationInput = useMemo(() => {
    const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
    const sessionNoteId = typeof sessionData?.noteId === "string" ? sessionData.noteId.trim() : ""
    const providedNoteContent = typeof noteContent === "string" ? noteContent : ""
    const sessionNoteContent =
      typeof sessionData?.noteContent === "string" ? sessionData.noteContent : ""
    const normalizedNote = providedNoteContent || sessionNoteContent || ""
    const patientIdFromProps =
      typeof patientInfo?.patientId === "string" && patientInfo.patientId.trim().length > 0
        ? patientInfo.patientId.trim()
        : ""
    const sessionPatientId =
      typeof sessionData?.patientId === "string" && sessionData.patientId.trim().length > 0
        ? sessionData.patientId.trim()
        : ""

    return {
      trimmedNoteId,
      sessionNoteId,
      normalizedNote,
      patientIdFromProps,
      sessionPatientId,
      selectedCodes: Array.isArray(selectedCodesList) ? selectedCodesList : [],
      complianceList: Array.isArray(complianceIssues) ? complianceIssues : [],
      metadata: patientMetadataPayload,
      transcripts: sanitizedTranscripts,
      sessionId:
        typeof sessionData?.sessionId === "string" && sessionData.sessionId.trim().length > 0
          ? sessionData.sessionId.trim()
          : ""
    }
  }, [
    complianceIssues,
    noteContent,
    noteId,
    patientInfo?.patientId,
    patientMetadataPayload,
    sanitizedTranscripts,
    selectedCodesList,
    sessionData?.noteContent,
    sessionData?.noteId,
    sessionData?.patientId,
    sessionData?.sessionId
  ])

  const lastInitialisationRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const fingerprint = JSON.stringify({
      encounterId,
      noteId: initializationInput.trimmedNoteId || initializationInput.sessionNoteId || null,
      noteContent: initializationInput.normalizedNote,
      patientId: initializationInput.patientIdFromProps || initializationInput.sessionPatientId || null,
      selectedCodes: initializationInput.selectedCodes.map(code => ({
        code: typeof code?.code === "string" ? code.code : null,
        description: typeof code?.description === "string" ? code.description : null,
        category: typeof code?.category === "string" ? code.category : null,
        type: typeof code?.type === "string" ? code.type : null
      })),
      compliance: initializationInput.complianceList.map(issue => ({
        id: typeof issue?.id === "string" ? issue.id : null,
        code: typeof issue?.code === "string" ? issue.code : null,
        severity: typeof issue?.severity === "string" ? issue.severity : null
      })),
      metadata: initializationInput.metadata,
      transcripts: initializationInput.transcripts.map(entry => ({
        id: entry.id,
        text: entry.text,
        speaker: entry.speaker,
        timestamp: entry.timestamp,
        confidence: entry.confidence
      })),
      sessionId: initializationInput.sessionId
    })

    if (lastInitialisationRef.current === fingerprint) {
      return
    }

    lastInitialisationRef.current = fingerprint

    let cancelled = false
    const initialise = async () => {
      const wordCount = initializationInput.normalizedNote.trim().length
        ? initializationInput.normalizedNote.trim().split(/\s+/).length
        : 0
      const charCount = initializationInput.normalizedNote.length
      const contextPayload: Record<string, unknown> = {
        noteMetrics: {
          wordCount,
          charCount
        }
      }

      if (initializationInput.transcripts.length > 0) {
        contextPayload.transcript = initializationInput.transcripts.map(entry => ({
          id: entry.id,
          text: entry.text,
          speaker: entry.speaker,
          timestamp: entry.timestamp,
          confidence: entry.confidence
        }))
      }

      if (initializationInput.selectedCodes.length > 0) {
        contextPayload.selectedCodes = initializationInput.selectedCodes.map(code => ({
          code: typeof code?.code === "string" ? code.code : undefined,
          description: typeof code?.description === "string" ? code.description : undefined,
          category: typeof code?.category === "string" ? code.category : undefined,
          type: typeof code?.type === "string" ? code.type : undefined
        }))
      }

      const payload: Record<string, unknown> = {
        encounterId,
        patientId:
          initializationInput.patientIdFromProps || initializationInput.sessionPatientId || null,
        noteId:
          initializationInput.trimmedNoteId || initializationInput.sessionNoteId || undefined,
        noteContent: initializationInput.normalizedNote,
        selectedCodes: initializationInput.selectedCodes,
        complianceIssues: initializationInput.complianceList,
        patientMetadata: { ...initializationInput.metadata },
        context: contextPayload
      }

      if (initializationInput.sessionId) {
        payload.sessionId = initializationInput.sessionId
      }

      try {
        const response = await fetchWithAuth("/api/v1/workflow/sessions", {
          method: "POST",
          json: true,
          body: JSON.stringify(payload)
        })
        if (!response.ok) {
          throw new Error(`Failed to initialise workflow session (${response.status})`)
        }
        const data = (await response.json()) as WorkflowSessionResponsePayload
        if (!cancelled) {
          setSessionData(data)
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to initialise the finalization workflow session."
          onError?.(message, error)
        }
      }
    }

    void initialise()

    return () => {
      cancelled = true
    }
  }, [encounterId, fetchWithAuth, initializationInput, isOpen, onError])

  useEffect(() => {
    if (!isOpen) {
      lastInitialisationRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const sourceContent = sessionData?.noteContent ?? noteContent ?? ""
    const trimmedContent = typeof sourceContent === "string" ? sourceContent.trim() : ""
    if (!trimmedContent) {
      setWizardSuggestions([])
      return
    }

    let cancelled = false

    const fetchSuggestions = async () => {
      try {
        const response = await fetchWithAuth("/api/ai/codes/suggest", {
          method: "POST",
          jsonBody: { content: trimmedContent, useOfflineMode: true }
        })
        if (!response.ok) {
          throw new Error(`Suggestion request failed (${response.status})`)
        }
        const data = await response.json().catch(() => ({}))
        const rawList = Array.isArray(data?.suggestions) ? data.suggestions : []
        const mapped: WizardCodeItem[] = rawList
          .map((item: any, index: number) => {
            const codeValue = typeof item?.code === "string" ? item.code.trim() : ""
            const descriptionValue = typeof item?.description === "string" ? item.description.trim() : ""
            if (!codeValue && !descriptionValue) {
              return null
            }
            const identifier = codeValue || descriptionValue || `suggestion-${index + 1}`
            if (selectedCodeSet.has(identifier.toUpperCase())) {
              return null
            }
            const confidence = typeof item?.confidence === "number" ? item.confidence : undefined
            return {
              id: identifier,
              code: codeValue || undefined,
              title: descriptionValue || codeValue || `Suggested Code ${index + 1}`,
              description: descriptionValue || undefined,
              details: typeof item?.reasoning === "string" ? item.reasoning : undefined,
              aiReasoning: typeof item?.reasoning === "string" ? item.reasoning : undefined,
              confidence: confidence,
              status: "pending"
            } as WizardCodeItem
          })
          .filter((item): item is WizardCodeItem => Boolean(item))

        if (!cancelled) {
          setWizardSuggestions(mapped)
        }
      } catch (error) {
        if (!cancelled) {
          onError?.("Unable to fetch AI suggestions", error)
          setWizardSuggestions([])
        }
      }
    }

    void fetchSuggestions()

    return () => {
      cancelled = true
    }
  }, [fetchWithAuth, isOpen, noteContent, onError, selectedCodeSet, sessionData?.noteContent])

  const reimbursementLookup = useMemo(() => {
    const map = new Map<string, number>()
    const summaryCodes = sessionData?.reimbursementSummary?.codes
    if (Array.isArray(summaryCodes)) {
      summaryCodes.forEach(entry => {
        const code = typeof entry?.code === "string" ? entry.code.trim().toUpperCase() : undefined
        const amount = typeof entry?.amount === "number" ? entry.amount : undefined
        if (code && typeof amount === "number") {
          map.set(code, amount)
        }
      })
    }
    return map
  }, [sessionData?.reimbursementSummary?.codes])

  const selectedWizardCodes = useMemo(() => {
    const base = toWizardCodeItems(
      Array.isArray(sessionData?.selectedCodes) && sessionData.selectedCodes.length > 0
        ? sessionData.selectedCodes
        : Array.isArray(selectedCodesList)
          ? selectedCodesList
          : []
    )

    if (reimbursementLookup.size === 0) {
      return base
    }

    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    })

    return base.map(item => {
      const codeKey = typeof item.code === "string" ? item.code.trim().toUpperCase() : undefined
      if (codeKey && reimbursementLookup.has(codeKey)) {
        const amount = reimbursementLookup.get(codeKey) ?? 0
        return {
          ...item,
          reimbursement: formatter.format(amount)
        }
      }
      return item
    })
  }, [reimbursementLookup, selectedCodesList, sessionData?.selectedCodes])

  const reimbursementSummary = useMemo(() => {
    if (sessionData?.reimbursementSummary) {
      return sessionData.reimbursementSummary
    }
    return undefined
  }, [sessionData?.reimbursementSummary])

  const complianceWizardItems = useMemo(
    () =>
      toWizardComplianceItems(
        Array.isArray(sessionData?.complianceIssues) && sessionData.complianceIssues.length > 0
          ? sessionData.complianceIssues
          : Array.isArray(complianceIssues)
            ? complianceIssues
            : []
      ),
    [complianceIssues, sessionData?.complianceIssues]
  )

  const patientMetadata = useMemo(() => {
    if (sessionData?.patientMetadata && typeof sessionData.patientMetadata === "object") {
      const metadata = sessionData.patientMetadata
      const mapped: PatientInfoInput = {
        patientId: typeof metadata.patientId === "string" ? metadata.patientId : undefined,
        encounterId: typeof metadata.encounterId === "string" ? metadata.encounterId : undefined,
        name: typeof metadata.name === "string" ? metadata.name : undefined,
        age: typeof metadata.age === "number" ? metadata.age : undefined,
        sex: typeof metadata.sex === "string" ? metadata.sex : undefined,
        encounterDate: typeof metadata.encounterDate === "string" ? metadata.encounterDate : undefined
      }
      return toPatientMetadata(mapped)
    }
    return toPatientMetadata(patientInfo)
  }, [patientInfo, sessionData?.patientMetadata])

  const sessionStepOverrides = useMemo(() => {
    const overrides: WizardStepOverride[] = []
    const rawStates = sessionData?.stepStates
    const listStates: WorkflowStepStateLike[] = Array.isArray(rawStates)
      ? rawStates
      : rawStates && typeof rawStates === "object"
        ? Object.values(rawStates)
        : []

    listStates.forEach(state => {
      const stepId = typeof state.step === "number" ? state.step : Number(state.step)
      if (!Number.isFinite(stepId)) {
        return
      }
      const status = typeof state.status === "string" ? state.status.toLowerCase() : ""
      let description: string | undefined
      if (status === "completed") {
        description = "Step completed"
      } else if (status === "in_progress") {
        description = "In progress"
      } else if (status === "blocked") {
        description = "Attention required"
      } else if (status === "not_started") {
        description = "Not started"
      }

      if (typeof state.progress === "number" && Number.isFinite(state.progress)) {
        const suffix = `${Math.max(0, Math.min(100, Math.round(state.progress)))}%`
        description = description ? `${description} • ${suffix}` : `Progress ${suffix}`
      }

      const blockingList = Array.isArray((state as Record<string, unknown>)?.blockingIssues)
        ? ((state as Record<string, unknown>).blockingIssues as unknown[])
        : []
      const blockingCount = blockingList.filter(item => typeof item === "string" && item.trim().length > 0).length
      if (blockingCount > 0) {
        const blockingText = `${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}`
        description = description ? `${description} • ${blockingText}` : blockingText
      }

      overrides.push({ id: stepId, description })
    })

    return overrides
  }, [sessionData?.stepStates])

  const mergedStepOverrides = useMemo(() => {
    const map = new Map<number, WizardStepOverride>()
    if (Array.isArray(stepOverrides)) {
      stepOverrides.forEach(override => {
        if (override && typeof override.id === "number") {
          map.set(override.id, { ...override })
        }
      })
    }
    sessionStepOverrides.forEach(override => {
      if (override && typeof override.id === "number") {
        const existing = map.get(override.id)
        map.set(override.id, { ...existing, ...override })
      }
    })
    return Array.from(map.values())
  }, [sessionStepOverrides, stepOverrides])

  const handleFinalize = useCallback(
    async (request: FinalizeRequest): Promise<FinalizeResult> => {
      const activeSessionId = sessionData?.sessionId
      if (!activeSessionId) {
        throw new Error("No active workflow session is available for finalization.")
      }

      attestationPayloadRef.current = null
      dispatchContextRef.current = null

      const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
      const payloadWithContext: FinalizeRequestWithContext = trimmedNoteId
        ? { ...request, noteId: trimmedNoteId }
        : request

      const providerName = sanitizeString(
        sessionData?.patientMetadata && typeof sessionData.patientMetadata === "object" &&
          typeof (sessionData.patientMetadata as Record<string, unknown>).providerName === "string"
          ? ((sessionData.patientMetadata as Record<string, unknown>).providerName as string)
          : undefined
      )

      try {
        const noteResponse = await fetchWithAuth(`/api/v1/notes/${encodeURIComponent(encounterId)}/content`, {
          method: "PUT",
          json: true,
          body: JSON.stringify({
            ...payloadWithContext,
            sessionId: activeSessionId,
            encounterId
          })
        })

        if (!noteResponse.ok) {
          throw new Error(`Note update failed (${noteResponse.status})`)
        }

        const data = (await noteResponse.json()) as NoteContentUpdateResponsePayload
        setSessionData(data.session)
        const validation = data.validation ?? {
          canFinalize: true,
          issues: {},
          estimatedReimbursement: data.reimbursementSummary?.total ?? 0,
          reimbursementSummary: data.reimbursementSummary
        }
        onPreFinalizeResult?.(validation)

        const billingValidation = deriveBillingValidation(validation, data.reimbursementSummary)
        const complianceCheckPayload = deriveComplianceChecks(
          Array.isArray(complianceIssues) ? complianceIssues : sessionData?.complianceIssues
        )
        const billingSummary = deriveBillingSummary(selectedCodesList, data.reimbursementSummary)
        const attestationTimestamp = new Date().toISOString()
        const attestationStatement = providerName
          ? `Final attestation recorded by ${providerName}`
          : "Final attestation recorded via finalization wizard"
        const attestationDetails: AttestationDetailsPayload = {
          physicianAttestation: true,
          attestationText: attestationStatement,
          attestationTimestamp,
          attestedBy: providerName ?? undefined
        }
        attestationPayloadRef.current = toBackendAttestationRequest({
          encounterId,
          sessionId: activeSessionId,
          billingValidation,
          attestation: attestationDetails,
          complianceChecks: complianceCheckPayload,
          billingSummary
        })
        dispatchContextRef.current = {
          lastValidation: validation,
          reimbursementSummary: data.reimbursementSummary,
          sessionAfterNoteUpdate: data.session
        }

        if (!validation?.canFinalize) {
          const issueMessages: string[] = []
          if (validation?.issues && typeof validation.issues === "object") {
            for (const value of Object.values(validation.issues)) {
              if (!Array.isArray(value)) continue
              for (const entry of value) {
                if (typeof entry === "string" && entry.trim().length > 0) {
                  issueMessages.push(entry.trim())
                }
              }
            }
          }

          const message = issueMessages.length
            ? `Finalization blocked: ${issueMessages.slice(0, 3).join("; ")}`
            : "Finalization cannot proceed until outstanding issues are resolved."
          throw new Error(message)
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to update the note before finalization."
        onError?.(message, error)
        throw error
      }

      let attestedSession: WorkflowSessionResponsePayload | undefined
      try {
        const fallbackSession =
          dispatchContextRef.current?.sessionAfterNoteUpdate ?? sessionData ?? undefined
        const fallbackValidation = dispatchContextRef.current?.lastValidation
        const fallbackReimbursement =
          dispatchContextRef.current?.reimbursementSummary ??
          (fallbackSession?.reimbursementSummary as
            | NoteContentUpdateResponsePayload["reimbursementSummary"]
            | undefined)
        const fallbackCodes =
          (Array.isArray(fallbackSession?.selectedCodes)
            ? (fallbackSession?.selectedCodes as SessionCodeLike[])
            : undefined) ?? selectedCodesList
        const fallbackComplianceSource = Array.isArray(fallbackSession?.complianceIssues)
          ? (fallbackSession?.complianceIssues as ComplianceLike[])
          : complianceIssues
        const attestationPayload =
          attestationPayloadRef.current ??
          toBackendAttestationRequest({
            encounterId,
            sessionId: activeSessionId,
            billingValidation: deriveBillingValidation(fallbackValidation, fallbackReimbursement),
            attestation: {
              physicianAttestation: true,
              attestationText: providerName
                ? `Final attestation recorded by ${providerName}`
                : "Final attestation recorded via finalization wizard",
              attestationTimestamp: new Date().toISOString(),
              attestedBy: providerName ?? undefined
            },
            complianceChecks: deriveComplianceChecks(fallbackComplianceSource),
            billingSummary: deriveBillingSummary(fallbackCodes, fallbackReimbursement)
          })
        const attestResponse = await fetchWithAuth(`/api/v1/workflow/${encodeURIComponent(activeSessionId)}/step5/attest`, {
          method: "POST",
          json: true,
          body: JSON.stringify(attestationPayload)
        })

        if (!attestResponse.ok) {
          throw new Error(`Attestation failed (${attestResponse.status})`)
        }

        const attestData = (await attestResponse.json()) as WorkflowAttestationResponsePayload
        attestedSession = attestData.session
        setSessionData(attestedSession)

        const dispatchTimestamp = new Date().toISOString()
        const sessionForDispatch = attestedSession ?? fallbackSession
        const dispatchPayload = toBackendDispatchRequest({
          encounterId,
          sessionId: activeSessionId,
          destination: "ehr",
          deliveryMethod: "wizard",
          timestamp: dispatchTimestamp,
          finalReview: deriveFinalReview(sessionForDispatch),
          dispatchOptions: deriveDispatchOptions(sessionForDispatch?.dispatch),
          dispatchStatus: deriveDispatchStatus(dispatchTimestamp, sessionForDispatch?.dispatch),
          postDispatchActions: derivePostDispatchActions(sessionForDispatch?.dispatch)
        })

        const dispatchResponse = await fetchWithAuth(`/api/v1/workflow/${encodeURIComponent(activeSessionId)}/step6/dispatch`, {
          method: "POST",
          json: true,
          body: JSON.stringify(dispatchPayload)
        })

        if (!dispatchResponse.ok) {
          let errorMessage = `Dispatch failed (${dispatchResponse.status})`
          try {
            const errorBody = await dispatchResponse.json()
            if (typeof errorBody?.detail === "string" && errorBody.detail.trim().length > 0) {
              errorMessage = errorBody.detail
            }
          } catch {
            // Ignore JSON parsing errors.
          }
          throw new Error(errorMessage)
        }

        const dispatchData = (await dispatchResponse.json()) as DispatchResponsePayload
        setSessionData(dispatchData.session)
        return dispatchData.result
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to finalize the note."
        onError?.(message, error)
        throw error
      }
    },
    [
      encounterId,
      fetchWithAuth,
      noteId,
      onError,
      onPreFinalizeResult,
      selectedCodesList,
      complianceIssues,
      sessionData,
      sessionData?.sessionId
    ]
  )

  const handleClose = useCallback(
    (result?: FinalizeResult) => {
      onClose(result)
    },
    [onClose]
  )

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onClose()}
      />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
        <FinalizationWizard
          selectedCodes={selectedWizardCodes}
          suggestedCodes={wizardSuggestions}
          complianceItems={complianceWizardItems}
          noteContent={sessionData?.noteContent ?? noteContent ?? ""}
          patientMetadata={patientMetadata}
          reimbursementSummary={reimbursementSummary}
          transcriptEntries={sanitizedTranscripts}
          blockingIssues={sessionData?.blockingIssues}
          stepOverrides={mergedStepOverrides.length > 0 ? mergedStepOverrides : stepOverrides}
          onFinalize={handleFinalize}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
