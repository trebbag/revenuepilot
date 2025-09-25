import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  FinalizationWizard,
  type AttestationFormPayload,
  type AttestationSubmitResult,
  type CodeClassification,
  type FinalizeRequest,
  type FinalizeResult,
  type PatientMetadata,
  type WizardCodeItem,
  type WizardComplianceItem,
  type WizardStepOverride,
} from "../features/finalization"
import { useSession } from "../contexts/SessionContext"
import type { LiveCodeSuggestion, StreamConnectionState } from "./NoteEditor"
import { Badge } from "./ui/badge"
import type {
  FinalizeNoteResponse,
  PreFinalizeCheckResponse,
  StoredFinalizationSession,
  WorkflowSessionResponsePayload,
} from "../features/finalization/workflowTypes"

type FetchWithAuth = (input: RequestInfo | URL, init?: (RequestInit & { json?: boolean; jsonBody?: unknown }) | undefined) => Promise<Response>

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

interface ComposeJobLike {
  composeId: number
  status: string
  stage?: string | null
  progress?: number | null
  steps?: Array<Record<string, unknown>>
  result?: Record<string, unknown> | null
  validation?: Record<string, unknown> | null
  message?: string | null
}

interface PatientInfoInput {
  patientId?: string | null
  encounterId?: string | null
  name?: string | null
  age?: number | null
  sex?: string | null
  encounterDate?: string | null
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
  displayMode?: "overlay" | "embedded"
  initialPreFinalizeResult?: PreFinalizeCheckResponse | null
  initialSessionSnapshot?: StoredFinalizationSession | null
  streamingCodeSuggestions?: LiveCodeSuggestion[]
  codesConnection?: StreamConnectionState
  complianceConnection?: StreamConnectionState
}

export type FinalizationWizardLaunchOptions = Omit<FinalizationWizardAdapterProps, "isOpen" | "onClose"> & {
  onClose?: FinalizationWizardAdapterProps["onClose"]
}

type CodeCategory = "codes" | "prevention" | "diagnoses" | "differentials"

const CODE_CLASSIFICATION_MAP: Record<CodeCategory, string> = {
  codes: "code",
  prevention: "prevention",
  diagnoses: "diagnosis",
  differentials: "differential",
}

const toCodeCategory = (value: unknown): CodeCategory | null => {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized.includes("prevent")) {
    return "prevention"
  }
  if (normalized.includes("differential")) {
    return "differentials"
  }
  if (normalized.includes("diagnos") || normalized.includes("icd")) {
    return "diagnoses"
  }
  if (normalized.includes("cpt") || normalized.includes("procedure") || normalized === "code" || normalized === "codes") {
    return "codes"
  }
  return null
}

const normalizeClassifications = (item: WizardCodeItem): CodeCategory[] => {
  const values = new Set<CodeCategory>()
  const register = (input: unknown) => {
    const category = toCodeCategory(input)
    if (category) {
      values.add(category)
    }
  }

  const classification = (item as { classification?: unknown }).classification
  if (Array.isArray(classification)) {
    classification.forEach((entry) => register(entry))
  } else {
    register(classification)
  }

  register(item.category)
  register(item.codeType)
  register((item as { type?: unknown }).type)

  if (Array.isArray(item.tags)) {
    item.tags.forEach((tag) => register(tag))
  }

  if (typeof item.code === "string" && /^\d{4,5}$/.test(item.code.trim())) {
    values.add("codes")
  }

  if (!values.size && typeof item.codeType === "string") {
    register(item.codeType)
  }

  if (!values.size) {
    values.add("diagnoses")
  }

  return Array.from(values)
}

const COMPLIANCE_SEVERITY_MAP: Record<string, WizardComplianceItem["severity"]> = {
  critical: "high",
  warning: "medium",
  info: "low",
}

const ensureStringArray = (value: unknown, fallback: string[]): string[] => {
  if (Array.isArray(value)) {
    const sanitized = value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((item) => item.length > 0)
    return sanitized.length ? Array.from(new Set(sanitized)) : fallback
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : fallback
  }
  return fallback
}

const toFinalizeRequestPayload = (request: FinalizeRequest, fallback: FinalizeRequest) => ({
  content: typeof request.content === "string" && request.content.trim().length > 0 ? request.content : fallback.content,
  codes: ensureStringArray(request.codes, fallback.codes),
  prevention: ensureStringArray(request.prevention, fallback.prevention),
  diagnoses: ensureStringArray(request.diagnoses, fallback.diagnoses),
  differentials: ensureStringArray(request.differentials, fallback.differentials),
  compliance: ensureStringArray(request.compliance, fallback.compliance),
})

interface WorkflowStepStateLike {
  step?: number | string | null
  status?: string | null
  progress?: number | null
}

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

// Utility: robustly sanitize and trim a list of strings (from either branch)
const sanitizeStringList = (value: unknown): string[] => {
  if (!value) return [];

  const processEntry = (entry: unknown): string | undefined => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      const asString = String(entry).trim();
      return asString.length > 0 ? asString : undefined;
    }
    return undefined;
  };

  const unique = new Set<string>();
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const processed = processEntry(entry);
      if (processed) unique.add(processed);
    });
  } else if (value instanceof Set) {
    value.forEach((entry) => {
      const processed = processEntry(entry);
      if (processed) unique.add(processed);
    });
  } else {
    const processed = processEntry(value);
    if (processed) unique.add(processed);
  }
  return Array.from(unique.values());
};

// Utility: normalize confidence value (from codex branch, covers both string and number)
const normalizeConfidenceValue = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  let numeric: number;
  if (typeof value === "string") {
    numeric = Number.parseFloat(value);
  } else if (typeof value === "number") {
    numeric = value;
  } else {
    numeric = Number(value);
  }
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric <= 1 && numeric >= 0) {
    return Math.round(Math.max(0, Math.min(1, numeric)) * 100);
  }
  return Math.round(Math.max(0, Math.min(100, numeric)));
};

const normalizeConfidence = (value: unknown): number | undefined => normalizeConfidenceValue(value);


// Utility: normalize doc support value (from master branch)
const normalizeDocSupport = (value: unknown): string | undefined => {
  const [candidate] = sanitizeStringList(value);
  if (!candidate) return undefined;
  const normalized = candidate.toLowerCase();
  if (["strong", "high", "definitive", "robust", "clear", "solid", "comprehensive"].includes(normalized)) return "strong";
  if (["moderate", "medium", "adequate", "partial", "supportive", "good", "documented", "fair"].includes(normalized)) return "moderate";
  if (["weak", "low", "limited", "minimal", "insufficient", "poor", "uncertain"].includes(normalized)) return "weak";
  return undefined;
};

// Utility: classification mapping (combines both branches)
const SUGGESTION_CLASSIFICATION_ALIASES: Record<string, CodeClassification> = {
  code: "code", codes: "code", procedure: "code", procedures: "code", cpt: "code", "cpt code": "code",
  prevention: "prevention", preventive: "prevention", screening: "prevention", wellness: "prevention",
  immunization: "prevention", immunisation: "prevention", vaccine: "prevention", vaccination: "prevention",
  diagnosis: "diagnosis", diagnoses: "diagnosis", icd: "diagnosis", "icd-10": "diagnosis",
  differential: "differential", differentials: "differential",
};

const toClassification = (value: unknown): CodeClassification | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("differential")) return "differential";
  if (normalized.includes("prevent")) return "prevention";
  if (normalized.includes("diagn")) return "diagnosis";
  if (normalized.includes("code") || normalized.includes("procedure")) return "code";
  // Try explicit mapping first
  return SUGGESTION_CLASSIFICATION_ALIASES[normalized] ?? null;
};


// Additional utilities continue below.


const toWizardCodeItems = (list: SessionCodeLike[]): WizardCodeItem[] => {
  if (!Array.isArray(list)) {
    return []
  }

  return list.map((item, index) => {
    const code = sanitizeString(item.code)
    const description = sanitizeString(item.description)
    const rationale = sanitizeString(item.rationale)
    const extras = item as {
      details?: unknown
      evidence?: unknown
      evidenceText?: unknown
      gaps?: unknown
      tags?: unknown
      docSupport?: unknown
      aiReasoning?: unknown
      classification?: unknown
    }
    const detail = sanitizeString(extras.details as string | undefined)
    const type = sanitizeString(item.type)
    const category = sanitizeString(item.category)
    const classificationKey = (category ?? "codes") as CodeCategory
    const mappedClassification = CODE_CLASSIFICATION_MAP[classificationKey] ?? CODE_CLASSIFICATION_MAP.codes
    const identifier =
      typeof item.id === "number" || typeof item.id === "string"
        ? item.id
        : code
        ? `${code}-${index}`
        : `code-${index + 1}`

    const evidence = toTrimmedStringArray(extras.evidence ?? extras.evidenceText)
    const gaps = toTrimmedStringArray(extras.gaps)
    const existingTags = toTrimmedStringArray(extras.tags)
    const docSupport = normalizeDocSupport(extras.docSupport)
    const confidence = normalizeConfidence(item.confidence)
    const aiReasoning = sanitizeString(extras.aiReasoning as string | undefined) ?? rationale ?? undefined

    const classificationSet = new Set<CodeClassification>()
    if (mappedClassification) {
      classificationSet.add(mappedClassification as CodeClassification)
    }
    const rawClassification = extras.classification
    if (Array.isArray(rawClassification)) {
      rawClassification.forEach((entry) => {
        const normalized = toClassification(entry)
        if (normalized) {
          classificationSet.add(normalized)
        }
      })
    } else {
      const normalized = toClassification(rawClassification)
      if (normalized) {
        classificationSet.add(normalized)
      }
    }

    const classification = Array.from(classificationSet.values())
    const tags = Array.from(new Set([...existingTags, ...classification]))

    const base: WizardCodeItem = {
      id: identifier,
      code: code ?? undefined,
      title: description ?? code ?? `Code ${index + 1}`,
      description: description ?? undefined,
      status: sanitizeString(item.status as string | undefined) ?? "pending",
      details: detail ?? description ?? rationale ?? undefined,
      codeType: type ?? undefined,
      category: category ?? classificationKey,
      docSupport,
      stillValid: item.stillValid as boolean | undefined,
      confidence,
      aiReasoning,
      evidence: evidence.length ? evidence : undefined,
      gaps: gaps.length ? gaps : undefined,
      tags: tags.length ? tags : undefined,
      reimbursement: sanitizeString(item.reimbursement),
      rvu: sanitizeString(item.rvu),
    }

    if (classification.length) {
      base.classification = classification
    }

    return base
  })
}

const toWizardComplianceItems = (list: ComplianceLike[]): WizardComplianceItem[] => {
  if (!Array.isArray(list)) {
    return []
  }

  return list
    .filter((issue) => !issue?.dismissed)
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
        code: sanitizeString(issue.code) ?? undefined,
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

type StepStatus = "pending" | "in-progress" | "completed" | "blocked"

interface StepAggregationState {
  status: StepStatus
  messages: string[]
  totalChecks: number
  completedChecks: number
}

interface ValidationMappingResult {
  overrides: WizardStepOverride[]
  blockingIssues: string[]
  canFinalize: boolean
  firstOpenStep: number | null
}

const STEP_STATUS_PRIORITY: Record<StepStatus, number> = {
  completed: 0,
  pending: 1,
  "in-progress": 1,
  blocked: 2,
}

const mergeStepStatus = (current: StepStatus, incoming: StepStatus): StepStatus => {
  return STEP_STATUS_PRIORITY[incoming] >= STEP_STATUS_PRIORITY[current] ? incoming : current
}

const sanitizeIssueText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeIssueText(entry)).filter((entry): entry is string => Boolean(entry))
  }
  const single = sanitizeIssueText(value)
  return single ? [single] : []
}

const flattenIssuesObject = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return []
  }
  const entries: string[] = []
  Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
    const sanitizedKey = sanitizeIssueText(key) ?? "Issue"
    const values = toStringList(entryValue)
    if (values.length > 0) {
      entries.push(`${sanitizedKey}: ${values.join(", ")}`)
    }
  })
  return entries
}

const interpretValidationRecord = (record: Record<string, unknown> | undefined, label: string): { status: StepStatus; messages: string[] } => {
  if (!record) {
    return { status: "pending", messages: [] }
  }

  const passed = typeof record.passed === "boolean" ? record.passed : undefined
  const messages: string[] = []

  const collect = (input: unknown, prefix: string) => {
    const list = toStringList(input)
    if (list.length > 0) {
      messages.push(`${prefix}: ${list.join(", ")}`)
    }
  }

  collect(record.issues, "Issues")
  collect(record.conflicts, "Conflicts")
  collect(record.missing, "Missing")
  collect(record.requirements, "Requirements")
  collect(record.criticalIssues, "Critical")
  collect((record as Record<string, unknown>).details, label)

  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : undefined
  if (typeof confidence === "number") {
    messages.push(`${label} confidence ${Math.round(confidence * 100)}%`)
  }

  if (passed === true) {
    if (!messages.length) {
      messages.push(`${label} completed`)
    }
    return { status: "completed", messages }
  }

  if (passed === false) {
    if (!messages.length) {
      messages.push(`${label} requires attention`)
    }
    return { status: "blocked", messages }
  }

  if (messages.length > 0) {
    return { status: "blocked", messages }
  }

  return { status: "pending", messages: [] }
}

const buildValidationState = (validation?: PreFinalizeCheckResponse | null): ValidationMappingResult => {
  const state = new Map<number, StepAggregationState>()
  const blocking = new Set<string>()
  let canFinalize = true

  const register = (stepId: number, payload: { status: StepStatus; messages: string[] }) => {
    if (!Number.isFinite(stepId)) {
      return
    }
    const sanitizedMessages = payload.messages.map((message) => sanitizeIssueText(message)).filter((message): message is string => Boolean(message))
    if (!state.has(stepId)) {
      state.set(stepId, {
        status: payload.status,
        messages: [...sanitizedMessages],
        totalChecks: 1,
        completedChecks: payload.status === "completed" ? 1 : 0,
      })
    } else {
      const existing = state.get(stepId) as StepAggregationState
      existing.status = mergeStepStatus(existing.status, payload.status)
      existing.messages.push(...sanitizedMessages)
      existing.totalChecks += 1
      if (payload.status === "completed") {
        existing.completedChecks += 1
      }
    }

    if (payload.status === "blocked") {
      sanitizedMessages.forEach((message) => blocking.add(message))
    }
  }

  if (!validation) {
    return { overrides: [], blockingIssues: [], canFinalize: true, firstOpenStep: null }
  }

  const stepValidation = validation.stepValidation && typeof validation.stepValidation === "object" ? (validation.stepValidation as Record<string, Record<string, unknown>>) : {}

  register(1, interpretValidationRecord(stepValidation.codeVerification, "Code verification"))

  const suggestionValidations = [
    interpretValidationRecord(stepValidation.preventionItems, "Prevention items"),
    interpretValidationRecord(stepValidation.diagnosesConfirmation, "Diagnoses confirmation"),
    interpretValidationRecord(stepValidation.differentialsReview, "Differential review"),
  ]
  suggestionValidations.forEach((result) => register(2, result))

  register(3, interpretValidationRecord(stepValidation.contentReview, "Content review"))

  const requiredFields = toStringList(validation.requiredFields)
  const missingDocumentation = toStringList(validation.missingDocumentation)
  if (requiredFields.length || missingDocumentation.length) {
    const messages: string[] = []
    if (requiredFields.length) {
      messages.push(`Required fields: ${requiredFields.join(", ")}`)
    }
    if (missingDocumentation.length) {
      messages.push(`Missing documentation: ${missingDocumentation.join(", ")}`)
    }
    register(4, { status: "blocked", messages })
  } else {
    register(4, { status: "completed", messages: ["Documentation complete"] })
  }

  register(5, interpretValidationRecord(stepValidation.complianceChecks, "Compliance checks"))

  const complianceSummaries = Array.isArray(validation.complianceIssues)
    ? validation.complianceIssues
        .map((issue) => sanitizeIssueText((issue as Record<string, unknown>)?.title ?? ((issue as Record<string, unknown>)?.description as string | undefined)))
        .filter((entry): entry is string => Boolean(entry))
    : []
  if (complianceSummaries.length) {
    register(5, { status: "blocked", messages: complianceSummaries })
  }

  const flattenedIssues = flattenIssuesObject(validation.issues)
  if (flattenedIssues.length) {
    register(5, { status: "blocked", messages: flattenedIssues })
  }

  canFinalize = validation.canFinalize !== false
  if (!canFinalize) {
    register(6, {
      status: "blocked",
      messages: ["Resolve outstanding validation items before dispatch"],
    })
  } else {
    register(6, { status: "pending", messages: ["Ready for dispatch review"] })
  }

  const overrides: WizardStepOverride[] = Array.from(state.entries()).map(([stepId, info]) => {
    const uniqueMessages = Array.from(new Set(info.messages))
    const description =
      uniqueMessages.length > 0 ? uniqueMessages.join(" • ") : info.status === "completed" ? "All checks passed" : info.status === "blocked" ? "Attention required" : "Pending validation"

    const override: WizardStepOverride = {
      id: stepId,
      status: info.status,
      description,
    }

    if (info.totalChecks > 0) {
      const progress = Math.round((info.completedChecks / info.totalChecks) * 100)
      if (Number.isFinite(progress)) {
        override.progress = progress
      }
    }

    return override
  })

  const orderedSteps = [1, 2, 3, 4, 5, 6]
  let firstOpenStep: number | null = null
  for (const stepId of orderedSteps) {
    const entry = state.get(stepId)
    const status = entry?.status ?? (stepId === 1 ? "in-progress" : "pending")
    if (status !== "completed") {
      firstOpenStep = stepId
      break
    }
  }

  return {
    overrides,
    blockingIssues: Array.from(blocking),
    canFinalize,
    firstOpenStep,
  }
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
  onError,
  displayMode = "overlay",
  initialPreFinalizeResult = null,
  initialSessionSnapshot = null,
  streamingCodeSuggestions,
  codesConnection,
  complianceConnection,
}: FinalizationWizardAdapterProps) {
  const { state: sessionState, actions: sessionActions } = useSession()
  const [sessionData, setSessionData] = useState<WorkflowSessionResponsePayload | null>(initialSessionSnapshot ?? null)
  const sessionDataRef = useRef<WorkflowSessionResponsePayload | null>(initialSessionSnapshot ?? null)
  const [wizardSuggestions, setWizardSuggestions] = useState<WizardCodeItem[]>([])
  const [preFinalizeResult, setPreFinalizeResult] = useState<PreFinalizeCheckResponse | null>(initialPreFinalizeResult)
  const preFinalizeResultRef = useRef<PreFinalizeCheckResponse | null>(initialPreFinalizeResult)
  const preFinalizeFingerprintRef = useRef<string | null>(null)
  const lastFinalizeResultRef = useRef<FinalizeResult | null>(initialSessionSnapshot?.lastFinalizeResult ?? null)
  const [composeJob, setComposeJob] = useState<ComposeJobLike | null>(
    (initialSessionSnapshot?.composeJob as ComposeJobLike | undefined) ?? null,
  )
  const [composeError, setComposeError] = useState<string | null>(null)
  const composeJobIdRef = useRef<number | null>(
    typeof (initialSessionSnapshot?.composeJob as ComposeJobLike | undefined)?.composeId === "number"
      ? (initialSessionSnapshot?.composeJob as ComposeJobLike).composeId
      : null,
  )
  const composePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composeFingerprintRef = useRef<string | null>(null)
  const composeActiveRef = useRef<boolean>(false)

  const encounterId = useMemo(() => {
    const fromSession = sessionData?.encounterId ?? initialSessionSnapshot?.encounterId
    if (typeof fromSession === "string" && fromSession.trim().length > 0) {
      return fromSession.trim()
    }
    if (typeof patientInfo?.encounterId === "string" && patientInfo.encounterId.trim().length > 0) {
      return patientInfo.encounterId.trim()
    }
    return "draft-encounter"
  }, [initialSessionSnapshot?.encounterId, patientInfo?.encounterId, sessionData?.encounterId])

  const contextSessionSnapshot = useMemo<StoredFinalizationSession | null>(() => {
    const sessions = sessionState.finalizationSessions
    if (!sessions) {
      return null
    }
    const candidateIds = [sessionData?.sessionId, initialSessionSnapshot?.sessionId].map((id) => (typeof id === "string" ? id.trim() : "")).filter((id) => id.length > 0)
    for (const id of candidateIds) {
      if (sessions[id]) {
        return sessions[id]
      }
    }
    const normalizedEncounter = sanitizeString(encounterId)?.toLowerCase()
    if (normalizedEncounter) {
      const match = Object.values(sessions).find((entry) => {
        if (!entry || typeof entry !== "object") {
          return false
        }
        const encounter = sanitizeString((entry as StoredFinalizationSession).encounterId)?.toLowerCase()
        return encounter === normalizedEncounter
      })
      if (match) {
        return match as StoredFinalizationSession
      }
    }
    return null
  }, [encounterId, initialSessionSnapshot?.sessionId, sessionData?.sessionId, sessionState.finalizationSessions])

  const sessionSnapshot = useMemo<StoredFinalizationSession | null>(() => {
    if (initialSessionSnapshot) {
      return initialSessionSnapshot
    }
    return contextSessionSnapshot
  }, [contextSessionSnapshot, initialSessionSnapshot])

  const validationSource = useMemo<PreFinalizeCheckResponse | null>(() => {
    if (preFinalizeResult) {
      return preFinalizeResult
    }
    if (sessionData?.lastValidation && typeof sessionData.lastValidation === "object") {
      return sessionData.lastValidation as PreFinalizeCheckResponse
    }
    if (sessionSnapshot?.lastPreFinalize && typeof sessionSnapshot.lastPreFinalize === "object") {
      return sessionSnapshot.lastPreFinalize
    }
    return null
  }, [preFinalizeResult, sessionData?.lastValidation, sessionSnapshot?.lastPreFinalize])

  const validationState = useMemo(() => buildValidationState(validationSource), [validationSource])

  useEffect(() => {
    sessionDataRef.current = sessionData
  }, [sessionData])

  useEffect(() => {
    preFinalizeResultRef.current = preFinalizeResult
  }, [preFinalizeResult])

  useEffect(() => {
    if (initialPreFinalizeResult) {
      setPreFinalizeResult(initialPreFinalizeResult)
    }
  }, [initialPreFinalizeResult])

  useEffect(() => {
    if (!initialSessionSnapshot) {
      return
    }
    setSessionData((prev) => {
      if (!prev) {
        return initialSessionSnapshot
      }
      if (initialSessionSnapshot.sessionId && (!prev.sessionId || prev.sessionId !== initialSessionSnapshot.sessionId)) {
        return initialSessionSnapshot
      }
      return prev
    })
  }, [initialSessionSnapshot])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (!sessionSnapshot) {
      return
    }
    setSessionData((prev) => (prev ? prev : sessionSnapshot))
  }, [isOpen, sessionSnapshot])

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

        const speakerValue = typeof entry?.speaker === "string" && entry.speaker.trim().length > 0 ? entry.speaker.trim() : undefined

        let timestamp: number | string | undefined
        if (typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)) {
          timestamp = entry.timestamp
        } else if (typeof entry?.timestamp === "string" && entry.timestamp.trim().length > 0) {
          timestamp = entry.timestamp.trim()
        }

        const confidence = typeof entry?.confidence === "number" && Number.isFinite(entry.confidence) ? Math.max(0, Math.min(1, entry.confidence)) : undefined

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

  const composeSelectedCodes = useMemo(() => {
    if (Array.isArray(sessionData?.selectedCodes) && sessionData.selectedCodes.length) {
      return sessionData.selectedCodes as Array<Record<string, unknown>>
    }
    if (Array.isArray(selectedCodesList) && selectedCodesList.length) {
      return selectedCodesList
    }
    return [] as Array<Record<string, unknown>>
  }, [selectedCodesList, sessionData?.selectedCodes])

  const composePatientMetadata = useMemo(() => {
    const base =
      sessionData?.patientMetadata && typeof sessionData.patientMetadata === "object"
        ? { ...(sessionData.patientMetadata as Record<string, unknown>) }
        : {}
    return { ...base, ...patientMetadataPayload }
  }, [patientMetadataPayload, sessionData?.patientMetadata])

  const composeSnapshot = useMemo(() => {
    const sessionId = sessionData?.sessionId ?? initialSessionSnapshot?.sessionId ?? null
    const encounterId =
      sessionData?.encounterId ?? initialSessionSnapshot?.encounterId ?? patientInfo?.encounterId ?? null
    const noteIdentifier = sessionData?.noteId ?? initialSessionSnapshot?.noteId ?? noteId ?? null
    const sourceContent = sessionData?.noteContent ?? noteContent ?? ""
    const trimmed = typeof sourceContent === "string" ? sourceContent.trim() : ""

    return {
      sessionId,
      encounterId,
      noteId: noteIdentifier,
      noteContent: trimmed,
      patientMetadata: composePatientMetadata,
      selectedCodes: composeSelectedCodes,
      transcript: sanitizedTranscripts,
      context: (sessionData?.context ?? initialSessionSnapshot?.context ?? {}) as Record<string, unknown>,
    }
  }, [
    composePatientMetadata,
    composeSelectedCodes,
    initialSessionSnapshot?.context,
    initialSessionSnapshot?.encounterId,
    initialSessionSnapshot?.noteId,
    initialSessionSnapshot?.sessionId,
    noteContent,
    noteId,
    patientInfo?.encounterId,
    sanitizedTranscripts,
    sessionData?.context,
    sessionData?.encounterId,
    sessionData?.noteContent,
    sessionData?.noteId,
    sessionData?.sessionId,
  ])

  const composeSnapshotFingerprint = useMemo(() => JSON.stringify(composeSnapshot), [composeSnapshot])

  const clearComposePollTimer = useCallback(() => {
    if (composePollTimerRef.current !== null) {
      clearTimeout(composePollTimerRef.current)
      composePollTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearComposePollTimer()
      composeActiveRef.current = false
    }
  }, [clearComposePollTimer])

  useEffect(() => {
    if (!isOpen) {
      composeActiveRef.current = false
      clearComposePollTimer()
    }
  }, [clearComposePollTimer, isOpen])

  const persistSession = useCallback(
    (session: WorkflowSessionResponsePayload | null | undefined, extras?: Partial<StoredFinalizationSession>) => {
      const base = session ?? sessionDataRef.current
      if (!base?.sessionId) {
        return
      }
      const snapshot: StoredFinalizationSession = {
        ...(sessionState.finalizationSessions?.[base.sessionId] ?? {}),
        ...base,
        transcriptEntries: sanitizedTranscripts,
        ...(extras ?? {}),
      }
      sessionActions.storeFinalizationSession(base.sessionId, snapshot)
    },
    [sanitizedTranscripts, sessionActions, sessionState.finalizationSessions],
  )


  const pollComposeJobStatus = useCallback(async () => {
    const composeId = composeJobIdRef.current
    if (!composeId) {
      composeActiveRef.current = false
      return
    }

    try {
      const response = await fetchWithAuth(`/api/compose/${encodeURIComponent(String(composeId))}`)
      if (!response.ok) {
        throw new Error(`Compose status check failed (${response.status})`)
      }

      const data = (await response.json()) as ComposeJobLike
      setComposeJob(data)
      setComposeError(null)
      setSessionData((prev) => {
        if (!prev) {
          persistSession(sessionDataRef.current, {
            composeJob: data,
            composeResult: data.result,
            composeValidation: data.validation,
          })
          return prev
        }

        const next: WorkflowSessionResponsePayload = {
          ...prev,
          composeJob: data,
        }
        persistSession(next, {
          composeJob: data,
          composeResult: data.result,
          composeValidation: data.validation,
        })
        sessionDataRef.current = next
        return next
      })

      const normalizedStatus = typeof data.status === "string" ? data.status.toLowerCase() : ""
      if (["completed", "failed", "blocked", "cancelled"].includes(normalizedStatus)) {
        composeActiveRef.current = false
        clearComposePollTimer()
      } else {
        clearComposePollTimer()
        composePollTimerRef.current = window.setTimeout(() => {
          void pollComposeJobStatus()
        }, 650)
      }
    } catch (error) {
      composeActiveRef.current = false
      clearComposePollTimer()
      const message = error instanceof Error ? error.message : "Unable to poll compose job"
      setComposeError(message)
      onError?.(message, error)
    }
  }, [clearComposePollTimer, fetchWithAuth, onError, persistSession])

  const handleComposeRequest = useCallback(
    (options?: { force?: boolean }) => {
      if (!sessionData?.sessionId) {
        setComposeError("Session not ready for compose job")
        return
      }

      const fingerprint = composeSnapshotFingerprint
      const shouldForce = Boolean(options?.force)
      if (!shouldForce && composeActiveRef.current && composeFingerprintRef.current === fingerprint) {
        return
      }

      composeFingerprintRef.current = fingerprint
      composeActiveRef.current = true
      setComposeError(null)

      const payload: Record<string, unknown> = {
        sessionId: sessionData.sessionId,
        noteContent: composeSnapshot.noteContent,
        patientMetadata: composeSnapshot.patientMetadata,
        selectedCodes: composeSnapshot.selectedCodes,
        transcript: composeSnapshot.transcript,
      }
      if (composeSnapshot.encounterId) {
        payload.encounterId = composeSnapshot.encounterId
      }
      if (composeSnapshot.noteId) {
        payload.noteId = composeSnapshot.noteId
      }

      const preferences = (composeSnapshot.context?.preferences ?? composeSnapshot.context?.settings) as
        | Record<string, unknown>
        | undefined
      if (preferences) {
        if (typeof preferences.useOfflineMode === "boolean") {
          payload.useOfflineMode = preferences.useOfflineMode
        }
        if (typeof preferences.useLocalModels === "boolean") {
          payload.useLocalModels = preferences.useLocalModels
        }
      }

      const start = async () => {
        try {
          const response = await fetchWithAuth("/api/compose/start", {
            method: "POST",
            jsonBody: payload,
          })
          if (!response.ok) {
            throw new Error(`Compose start failed (${response.status})`)
          }
          const data = (await response.json()) as ComposeJobLike
          composeJobIdRef.current = data.composeId
          setComposeJob(data)
          setSessionData((prev) => {
            if (!prev) {
              persistSession(sessionDataRef.current, { composeJob: data })
              return prev
            }
            const next: WorkflowSessionResponsePayload = { ...prev, composeJob: data }
            persistSession(next, { composeJob: data })
            sessionDataRef.current = next
            return next
          })
          clearComposePollTimer()
          composePollTimerRef.current = window.setTimeout(() => {
            void pollComposeJobStatus()
          }, 650)
        } catch (error) {
          composeActiveRef.current = false
          clearComposePollTimer()
          const message = error instanceof Error ? error.message : "Unable to start compose job"
          setComposeError(message)
          onError?.(message, error)
        }
      }

      void start()
    },
    [
      clearComposePollTimer,
      composeSnapshot.context,
      composeSnapshot.encounterId,
      composeSnapshot.noteContent,
      composeSnapshot.noteId,
      composeSnapshot.patientMetadata,
      composeSnapshot.selectedCodes,
      composeSnapshot.transcript,
      composeSnapshotFingerprint,
      fetchWithAuth,
      onError,
      persistSession,
      pollComposeJobStatus,
      sessionData?.sessionId,
    ],
  )

  const applyValidationResult = useCallback(
    (
      data: PreFinalizeCheckResponse,
      options?: {
        finalizeResult?: FinalizeNoteResponse
        finalizedNoteId?: string | null
        dispatchSummary?: Record<string, unknown>
        sessionOverride?: WorkflowSessionResponsePayload | null
      },
    ) => {
      setPreFinalizeResult(data)
      onPreFinalizeResult?.(data)

      const normalizedFinalizedId =
        typeof options?.finalizedNoteId === "string" && options.finalizedNoteId.trim().length > 0
          ? options.finalizedNoteId.trim()
          : undefined

      const extras: Partial<StoredFinalizationSession> = {
        lastPreFinalize: data,
        ...(options?.finalizeResult ? { lastFinalizeResult: options.finalizeResult } : {}),
        ...(normalizedFinalizedId ? { noteId: normalizedFinalizedId } : {}),
        ...(options?.dispatchSummary ? { dispatch: options.dispatchSummary } : {}),
      }

      setSessionData((prev) => {
        const base = options?.sessionOverride ?? prev
        if (!base) {
          persistSession(sessionDataRef.current, extras)
          return base
        }

        const validationInfo = buildValidationState(data)
        const existingBlocking = Array.isArray(base.blockingIssues)
          ? base.blockingIssues
              .map((issue) => sanitizeIssueText(issue))
              .filter((issue): issue is string => Boolean(issue))
          : []
        const combinedBlocking = new Set(existingBlocking)
        validationInfo.blockingIssues.forEach((issue) => combinedBlocking.add(issue))

        const next: WorkflowSessionResponsePayload = {
          ...base,
          lastValidation: data,
          ...(Array.isArray(data.complianceIssues)
            ? { complianceIssues: data.complianceIssues as Array<Record<string, unknown>> }
            : {}),
          ...(data.reimbursementSummary ? { reimbursementSummary: data.reimbursementSummary } : {}),
          blockingIssues: combinedBlocking.size ? Array.from(combinedBlocking) : base.blockingIssues,
          ...(options?.finalizeResult ? { lastFinalizeResult: options.finalizeResult } : {}),
          ...(normalizedFinalizedId ? { noteId: normalizedFinalizedId } : {}),
          ...(options?.dispatchSummary ? { dispatch: options.dispatchSummary } : {}),
        }

        persistSession(next, extras)
        return next
      })
    },
    [onPreFinalizeResult, persistSession],

  )

  const selectedCodeSet = useMemo(() => {
    const codes = Array.isArray(selectedCodesList) ? selectedCodesList : []
    const identifiers = codes
      .map((codeItem) =>
        typeof codeItem?.code === "string" && codeItem.code.trim().length > 0
          ? codeItem.code.trim().toUpperCase()
          : typeof codeItem?.description === "string" && codeItem.description.trim().length > 0
            ? codeItem.description.trim().toUpperCase()
            : undefined,
      )
      .filter((value): value is string => Boolean(value))
    return new Set(identifiers)
  }, [selectedCodesList])

  const buildSuggestionKey = (item: WizardCodeItem): string | undefined => {
    const code = sanitizeString(item.code)
    if (code) {
      return `code:${code.toUpperCase()}`
    }

    const title = sanitizeString(item.title ?? item.description)
    if (title) {
      return `title:${title.toUpperCase()}`
    }

    return undefined
  }

  const createWizardSuggestion = (
    entry: Record<string, unknown>,
    index: number,
    selectedCodeSet: Set<string>,
  ): WizardCodeItem | null => {
    if (!entry || typeof entry !== "object") {
      return null
    }

    const getString = (...candidates: unknown[]): string | undefined => {
      for (const candidate of candidates) {
        const value = sanitizeString(candidate)
        if (value) {
          return value
        }
      }
      return undefined
    }

    const code = getString(entry.code, entry.codeValue, entry.code_value, entry.cpt, entry.icd, entry.value)
    const description = getString(entry.description, entry.label, entry.title, entry.text, entry.summary)
    const rationale = getString(entry.rationale, entry.reason, entry.details, entry.justification, entry.notes)
    const normalizedCodeKey = code ? code.toUpperCase() : undefined
    const normalizedDescriptionKey = description ? description.toUpperCase() : undefined

    if (
      (normalizedCodeKey && selectedCodeSet.has(normalizedCodeKey)) ||
      (normalizedDescriptionKey && selectedCodeSet.has(normalizedDescriptionKey))
    ) {
      return null
    }

    const registerClassification = (
      target: Set<CodeClassification>,
      value: unknown,
    ) => {
      if (Array.isArray(value)) {
        value.forEach((entryValue) => registerClassification(target, entryValue))
        return
      }
      const normalized = toClassification(value)
      if (normalized) {
        target.add(normalized)
      }
    }

    const classifications = new Set<CodeClassification>()
    registerClassification(classifications, (entry as { classification?: unknown }).classification)
    registerClassification(classifications, (entry as { category?: unknown }).category)
    registerClassification(classifications, (entry as { type?: unknown }).type)

    const rawTags =
      (entry as { tags?: unknown }).tags ??
      (entry as { labels?: unknown }).labels ??
      (entry as { keywords?: unknown }).keywords
    const tags = toTrimmedStringArray(rawTags)
    tags.forEach((tag) => registerClassification(classifications, tag))

    if (!classifications.size) {
      if (code && /^\d{4,5}$/.test(code)) {
        classifications.add("code")
      } else {
        classifications.add("diagnosis")
      }
    }

    const type = getString(
      (entry as { type?: unknown }).type,
      (entry as { codeType?: unknown }).codeType,
      (entry as { category?: unknown }).category,
    )
    const docSupport = normalizeDocSupport(
      (entry as { docSupport?: unknown }).docSupport ??
        (entry as { support?: unknown }).support ??
        (entry as { evidenceLevel?: unknown }).evidenceLevel,
    )
    const confidence = normalizeConfidence(
      (entry as { confidence?: unknown }).confidence ??
        (entry as { score?: unknown }).score ??
        (entry as { confidenceScore?: unknown }).confidenceScore,
    )
    const suggestedBy = getString(
      (entry as { source?: unknown }).source,
      (entry as { suggestedBy?: unknown }).suggestedBy,
      (entry as { origin?: unknown }).origin,
      (entry as { provider?: unknown }).provider,
      (entry as { engine?: unknown }).engine,
    )

    const classificationValues = Array.from(classifications.values())
    const id =
      getString((entry as { id?: unknown }).id) ??
      (code ? `suggestion-${code.replace(/\s+/g, "-")}-${index + 1}` : `suggestion-${index + 1}`)

    const suggestion: WizardCodeItem = {
      id,
      code: code ?? undefined,
      title: description ?? code ?? `Suggestion ${index + 1}`,
      description: description ?? undefined,
      details: rationale ?? description ?? undefined,
      status: "pending",
      codeType: type ?? undefined,
      category: type ?? undefined,
      docSupport: docSupport ?? undefined,
      confidence: confidence ?? undefined,
      aiReasoning: rationale ?? undefined,
      suggestedBy: suggestedBy ?? undefined,
      tags: tags.length ? tags : undefined,
    }

    if (classificationValues.length === 1) {
      suggestion.classification = classificationValues[0]
    } else if (classificationValues.length > 1) {
      suggestion.classification = classificationValues
    }

    return suggestion
  }

  const mapStreamingToWizard = useCallback(
    (suggestions: LiveCodeSuggestion[]): WizardCodeItem[] => {
      const seen = new Set<string>()
      return suggestions.reduce<WizardCodeItem[]>((acc, entry, index) => {
        const suggestion = createWizardSuggestion(entry as unknown as Record<string, unknown>, index, selectedCodeSet)
        if (!suggestion) {
          return acc
        }
        const key = buildSuggestionKey(suggestion)
        if (key && seen.has(key)) {
          return acc
        }
        if (key) {
          seen.add(key)
        }
        acc.push(suggestion)
        return acc
      }, [])
    },
    [selectedCodeSet],
  )

  const streamingCodesAvailable = useMemo(
    () => codesConnection?.status === "open" && Array.isArray(streamingCodeSuggestions) && streamingCodeSuggestions.length > 0,
    [codesConnection?.status, streamingCodeSuggestions],
  )

  const streamingWizardSuggestions = useMemo(
    () => (streamingCodesAvailable ? mapStreamingToWizard(streamingCodeSuggestions ?? []) : []),
    [mapStreamingToWizard, streamingCodeSuggestions, streamingCodesAvailable],
  )

  const initializationInput = useMemo(() => {
    const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
    const sessionNoteId = typeof sessionData?.noteId === "string" ? sessionData.noteId.trim() : ""
    const providedNoteContent = typeof noteContent === "string" ? noteContent : ""
    const sessionNoteContent = typeof sessionData?.noteContent === "string" ? sessionData.noteContent : ""
    const normalizedNote = providedNoteContent || sessionNoteContent || ""
    const patientIdFromProps = typeof patientInfo?.patientId === "string" && patientInfo.patientId.trim().length > 0 ? patientInfo.patientId.trim() : ""
    const sessionPatientId = typeof sessionData?.patientId === "string" && sessionData.patientId.trim().length > 0 ? sessionData.patientId.trim() : ""

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
      sessionId: typeof sessionData?.sessionId === "string" && sessionData.sessionId.trim().length > 0 ? sessionData.sessionId.trim() : "",
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
    sessionData?.sessionId,
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
      selectedCodes: initializationInput.selectedCodes.map((code) => ({
        code: typeof code?.code === "string" ? code.code : null,
        description: typeof code?.description === "string" ? code.description : null,
        category: typeof code?.category === "string" ? code.category : null,
        type: typeof code?.type === "string" ? code.type : null,
      })),
      compliance: initializationInput.complianceList.map((issue) => ({
        id: typeof issue?.id === "string" ? issue.id : null,
        code: typeof issue?.code === "string" ? issue.code : null,
        severity: typeof issue?.severity === "string" ? issue.severity : null,
      })),
      metadata: initializationInput.metadata,
      transcripts: initializationInput.transcripts.map((entry) => ({
        id: entry.id,
        text: entry.text,
        speaker: entry.speaker,
        timestamp: entry.timestamp,
        confidence: entry.confidence,
      })),
      sessionId: initializationInput.sessionId,
    })

    if (lastInitialisationRef.current === fingerprint) {
      return
    }

    lastInitialisationRef.current = fingerprint

    let cancelled = false
    const initialise = async () => {
      const wordCount = initializationInput.normalizedNote.trim().length ? initializationInput.normalizedNote.trim().split(/\s+/).length : 0
      const charCount = initializationInput.normalizedNote.length
      const contextPayload: Record<string, unknown> = {
        noteMetrics: {
          wordCount,
          charCount,
        },
      }

      if (initializationInput.transcripts.length > 0) {
        contextPayload.transcript = initializationInput.transcripts.map((entry) => ({
          id: entry.id,
          text: entry.text,
          speaker: entry.speaker,
          timestamp: entry.timestamp,
          confidence: entry.confidence,
        }))
      }

      if (initializationInput.selectedCodes.length > 0) {
        contextPayload.selectedCodes = initializationInput.selectedCodes.map((code) => ({
          code: typeof code?.code === "string" ? code.code : undefined,
          description: typeof code?.description === "string" ? code.description : undefined,
          category: typeof code?.category === "string" ? code.category : undefined,
          type: typeof code?.type === "string" ? code.type : undefined,
        }))
      }

      const payload: Record<string, unknown> = {
        encounterId,
        patientId: initializationInput.patientIdFromProps || initializationInput.sessionPatientId || null,
        noteId: initializationInput.trimmedNoteId || initializationInput.sessionNoteId || undefined,
        noteContent: initializationInput.normalizedNote,
        selectedCodes: initializationInput.selectedCodes,
        complianceIssues: initializationInput.complianceList,
        patientMetadata: { ...initializationInput.metadata },
        context: contextPayload,
      }

      if (initializationInput.sessionId) {
        payload.sessionId = initializationInput.sessionId
      }

      try {
        const response = await fetchWithAuth("/api/v1/workflow/sessions", {
          method: "POST",
          json: true,
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(`Failed to initialise workflow session (${response.status})`)
        }
        const data = (await response.json()) as WorkflowSessionResponsePayload
        if (!cancelled) {
          setSessionData(data)
          persistSession(data, {
            lastPreFinalize: preFinalizeResultRef.current ?? undefined,
          })
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to initialise the finalization workflow session."
          onError?.(message, error)
        }
      }
    }

    void initialise()

    return () => {
      cancelled = true
    }
  }, [encounterId, fetchWithAuth, initializationInput, isOpen, onError, persistSession])

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

    if (streamingCodesAvailable) {
      setWizardSuggestions(streamingWizardSuggestions)
      return
    }

    let cancelled = false

    const fetchSuggestions = async () => {
      try {
        const response = await fetchWithAuth("/api/ai/codes/suggest", {
          method: "POST",
          jsonBody: { content: trimmedContent, useOfflineMode: true },
        })
        if (!response.ok) {
          throw new Error(`Suggestion request failed (${response.status})`)
        }
        const data = await response.json().catch(() => ({}))
        const rawList = Array.isArray(data?.suggestions) ? data.suggestions : []
        const seen = new Set<string>()
        const mapped: WizardCodeItem[] = []
        rawList.forEach((item: Record<string, unknown>, index: number) => {
          const suggestion = createWizardSuggestion(item ?? {}, index, selectedCodeSet)
          if (!suggestion) {
            return
          }
          const key = buildSuggestionKey(suggestion)
          if (key && seen.has(key)) {
            return
          }
          if (key) {
            seen.add(key)
          }
          mapped.push(suggestion)
        })

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
  }, [fetchWithAuth, isOpen, noteContent, onError, selectedCodeSet, sessionData?.noteContent, streamingCodesAvailable, streamingWizardSuggestions])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (!streamingCodesAvailable) {
      return
    }
    setWizardSuggestions(streamingWizardSuggestions)
  }, [isOpen, streamingCodesAvailable, streamingWizardSuggestions])

  const reimbursementLookup = useMemo(() => {
    const map = new Map<string, number>()
    const summaryCodes = sessionData?.reimbursementSummary?.codes
    if (Array.isArray(summaryCodes)) {
      summaryCodes.forEach((entry) => {
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
      Array.isArray(sessionData?.selectedCodes) && sessionData.selectedCodes.length > 0 ? sessionData.selectedCodes : Array.isArray(selectedCodesList) ? selectedCodesList : [],
    )

    if (reimbursementLookup.size === 0) {
      return base
    }

    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    })

    return base.map((item) => {
      const codeKey = typeof item.code === "string" ? item.code.trim().toUpperCase() : undefined
      if (codeKey && reimbursementLookup.has(codeKey)) {
        const amount = reimbursementLookup.get(codeKey) ?? 0
        return {
          ...item,
          reimbursement: formatter.format(amount),
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
  const attestationRecap =
    sessionData?.attestation ?? sessionSnapshot?.attestation ?? initialSessionSnapshot?.attestation ?? undefined

  const complianceWizardItems = useMemo(
    () =>
      toWizardComplianceItems(
        Array.isArray(sessionData?.complianceIssues) && sessionData.complianceIssues.length > 0 ? sessionData.complianceIssues : Array.isArray(complianceIssues) ? complianceIssues : [],
      ),
    [complianceIssues, sessionData?.complianceIssues],
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
        encounterDate: typeof metadata.encounterDate === "string" ? metadata.encounterDate : undefined,
      }
      return toPatientMetadata(mapped)
    }
    return toPatientMetadata(patientInfo)
  }, [patientInfo, sessionData?.patientMetadata])

  const finalizeRequestSnapshot = useMemo<FinalizeRequest>(() => {
    const contentSource = typeof sessionData?.noteContent === "string" && sessionData.noteContent.trim().length > 0 ? sessionData.noteContent : typeof noteContent === "string" ? noteContent : ""

    const codes = new Set<string>()
    const prevention = new Set<string>()
    const diagnoses = new Set<string>()
    const differentials = new Set<string>()
    const complianceSet = new Set<string>()

    const assignCodes = (item: WizardCodeItem) => {
      const identifier = sanitizeString(item.code) ?? sanitizeString(item.title)
      if (!identifier) {
        return
      }
      const classifications = normalizeClassifications(item)
      if (!classifications.length) {
        if ((item.codeType ?? "").toUpperCase() === "CPT") {
          codes.add(identifier)
        } else {
          diagnoses.add(identifier)
        }
        return
      }
      classifications.forEach((classification) => {
        switch (classification) {
          case "code":
            codes.add(identifier)
            break
          case "prevention":
            prevention.add(identifier)
            break
          case "diagnosis":
            diagnoses.add(identifier)
            break
          case "differential":
            differentials.add(identifier)
            break
        }
      })
    }

    selectedWizardCodes.forEach(assignCodes)
    wizardSuggestions.forEach(assignCodes)
    complianceWizardItems.forEach((item) => {
      const identifier = sanitizeString(item.code) ?? sanitizeString(item.title)
      if (identifier) {
        complianceSet.add(identifier)
      }
    })

    return {
      content: contentSource,
      codes: Array.from(codes),
      prevention: Array.from(prevention),
      diagnoses: Array.from(diagnoses),
      differentials: Array.from(differentials),
      compliance: Array.from(complianceSet),
      patient: patientMetadata,
    }
  }, [complianceWizardItems, noteContent, patientMetadata, selectedWizardCodes, sessionData?.noteContent, wizardSuggestions])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const fingerprint = JSON.stringify({
      content: finalizeRequestSnapshot.content,
      codes: finalizeRequestSnapshot.codes,
      prevention: finalizeRequestSnapshot.prevention,
      diagnoses: finalizeRequestSnapshot.diagnoses,
      differentials: finalizeRequestSnapshot.differentials,
      compliance: finalizeRequestSnapshot.compliance,
    })

    if (preFinalizeFingerprintRef.current === fingerprint) {
      return
    }

    preFinalizeFingerprintRef.current = fingerprint

    let cancelled = false

    const run = async () => {
      try {
        const response = await fetchWithAuth("/api/notes/pre-finalize-check", {
          method: "POST",
          jsonBody: {
            content: finalizeRequestSnapshot.content,
            codes: finalizeRequestSnapshot.codes,
            prevention: finalizeRequestSnapshot.prevention,
            diagnoses: finalizeRequestSnapshot.diagnoses,
            differentials: finalizeRequestSnapshot.differentials,
            compliance: finalizeRequestSnapshot.compliance,
          },
        })
        if (!response.ok) {
          throw new Error(`Pre-finalize check failed (${response.status})`)
        }
        const data = (await response.json()) as PreFinalizeCheckResponse
        if (cancelled) {
          return
        }
        setPreFinalizeResult(data)
        onPreFinalizeResult?.(data)
        setSessionData((prev) => {
          if (!prev) {
            persistSession(sessionDataRef.current, { lastPreFinalize: data })
            return prev
          }
          const validationInfo = buildValidationState(data)
          const existingBlocking = Array.isArray(prev.blockingIssues) ? prev.blockingIssues.map((issue) => sanitizeIssueText(issue)).filter((issue): issue is string => Boolean(issue)) : []
          const combinedBlocking = new Set<string>(existingBlocking)
          validationInfo.blockingIssues.forEach((issue) => combinedBlocking.add(issue))

          const next: WorkflowSessionResponsePayload = {
            ...prev,
            lastValidation: data,
            ...(Array.isArray(data.complianceIssues) ? { complianceIssues: data.complianceIssues as Array<Record<string, unknown>> } : {}),
            ...(data.reimbursementSummary ? { reimbursementSummary: data.reimbursementSummary } : {}),
            blockingIssues: combinedBlocking.size ? Array.from(combinedBlocking) : prev.blockingIssues,
          }

          persistSession(next, { lastPreFinalize: data })
          return next
        })
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to validate the note before finalization."
          onError?.(message, error)
        }
      }
    }

    if (finalizeRequestSnapshot.content?.trim()) {
      void run()
    } else {
      preFinalizeFingerprintRef.current = null
    }

    return () => {
      cancelled = true
    }
  }, [finalizeRequestSnapshot, fetchWithAuth, isOpen, onError, onPreFinalizeResult, persistSession])

  const sessionStepState = useMemo(() => {
    const overrides: WizardStepOverride[] = []
    const blocking: string[] = []
    const rawStates = sessionData?.stepStates
    const listStates: WorkflowStepStateLike[] = Array.isArray(rawStates) ? rawStates : rawStates && typeof rawStates === "object" ? Object.values(rawStates) : []

    listStates.forEach((state) => {
      const stepId = typeof state.step === "number" ? state.step : Number(state.step)
      if (!Number.isFinite(stepId)) {
        return
      }
      const statusKey = typeof state.status === "string" ? state.status.toLowerCase() : ""
      let description: string | undefined
      let normalizedStatus: StepStatus | undefined
      if (statusKey === "completed") {
        description = "Step completed"
        normalizedStatus = "completed"
      } else if (statusKey === "in_progress") {
        description = "In progress"
        normalizedStatus = "in-progress"
      } else if (statusKey === "blocked") {
        description = "Attention required"
        normalizedStatus = "blocked"
      } else if (statusKey === "not_started") {
        description = "Not started"
        normalizedStatus = "pending"
      }

      let progressValue: number | undefined
      if (typeof state.progress === "number" && Number.isFinite(state.progress)) {
        progressValue = Math.max(0, Math.min(100, Math.round(state.progress)))
        const suffix = `${progressValue}%`
        description = description ? `${description} • ${suffix}` : `Progress ${suffix}`
      }

      const blockingList = Array.isArray((state as Record<string, unknown>)?.blockingIssues) ? ((state as Record<string, unknown>).blockingIssues as unknown[]) : []
      const blockingMessages = blockingList.map((entry) => sanitizeIssueText(entry)).filter((entry): entry is string => Boolean(entry))
      if (blockingMessages.length > 0) {
        const blockingText = `${blockingMessages.length} blocking issue${blockingMessages.length === 1 ? "" : "s"}`
        description = description ? `${description} • ${blockingText}` : blockingText
        blockingMessages.forEach((message) => blocking.push(message))
      }

      const override: WizardStepOverride = { id: stepId, description }
      if (normalizedStatus) {
        override.status = normalizedStatus
      }
      if (typeof progressValue === "number") {
        override.progress = progressValue
      }

      overrides.push(override)
    })

    return { overrides, blockingIssues: blocking }
  }, [sessionData?.stepStates])

  const sessionOverrides = sessionStepState.overrides
  const sessionBlockingIssues = sessionStepState.blockingIssues

  const mergedStepOverrides = useMemo(() => {
    const map = new Map<number, WizardStepOverride>()
    if (Array.isArray(stepOverrides)) {
      stepOverrides.forEach((override) => {
        if (override && typeof override.id === "number") {
          map.set(override.id, { ...override })
        }
      })
    }
    sessionOverrides.forEach((override) => {
      if (override && typeof override.id === "number") {
        const existing = map.get(override.id)
        map.set(override.id, { ...existing, ...override })
      }
    })
    validationState.overrides.forEach((override) => {
      if (override && typeof override.id === "number") {
        const existing = map.get(override.id)
        map.set(override.id, { ...existing, ...override })
      }
    })
    return Array.from(map.values())
  }, [sessionOverrides, stepOverrides, validationState.overrides])

  const combinedBlockingIssues = useMemo(() => {
    const result = new Set<string>()
    const register = (list: unknown) => {
      if (!Array.isArray(list)) {
        return
      }
      list
        .map((item) => sanitizeIssueText(item))
        .filter((item): item is string => Boolean(item))
        .forEach((item) => result.add(item))
    }

    register(sessionData?.blockingIssues)
    sessionBlockingIssues.forEach((issue) => result.add(issue))
    validationState.blockingIssues.forEach((issue) => result.add(issue))

    return Array.from(result)
  }, [sessionBlockingIssues, sessionData?.blockingIssues, validationState.blockingIssues])

  const derivedCurrentStep = useMemo(() => {
    if (typeof sessionData?.currentStep === "number" && Number.isFinite(sessionData.currentStep)) {
      return Math.max(1, Math.floor(sessionData.currentStep))
    }
    if (validationState.firstOpenStep && Number.isFinite(validationState.firstOpenStep)) {
      return Math.max(1, Math.floor(validationState.firstOpenStep))
    }
    return 1
  }, [sessionData?.currentStep, validationState.firstOpenStep])


  const [activeWizardStep, setActiveWizardStep] = useState<number>(() =>
    Number.isFinite(derivedCurrentStep) ? derivedCurrentStep : 1,
  )

  useEffect(() => {
    if (Number.isFinite(derivedCurrentStep)) {
      setActiveWizardStep((prev) => (prev === derivedCurrentStep ? prev : derivedCurrentStep))
    }
  }, [derivedCurrentStep])

  useEffect(() => {
    if (!isOpen || !sessionData?.sessionId) {
      return
    }
    if (activeWizardStep !== 3) {
      return
    }
    if (!composeSnapshotFingerprint) {
      return
    }
    if (composeFingerprintRef.current !== composeSnapshotFingerprint || !composeActiveRef.current) {
      handleComposeRequest()
    }
  }, [activeWizardStep, composeSnapshotFingerprint, handleComposeRequest, isOpen, sessionData?.sessionId])

  const submitAttestation = useCallback(
    async (form: AttestationFormPayload): Promise<AttestationSubmitResult> => {
      const activeSessionId =
        sessionDataRef.current?.sessionId ?? sessionData?.sessionId ?? initialSessionSnapshot?.sessionId
      if (!activeSessionId) {
        throw new Error("Create or load a session before recording attestation.")
      }

      const attestedBy = sanitizeString(form.attestedBy)
      const statement = sanitizeString(form.statement)
      const ipAddress = sanitizeString(form.ipAddress)
      const signature = sanitizeString(form.signature)
      const payerChecklistPayload = Array.isArray(form.payerChecklist)
        ? form.payerChecklist
            .map((item, index) => {
              if (!item || typeof item !== "object") {
                return null
              }
              const statusRaw = sanitizeString((item as Record<string, unknown>).status)?.toLowerCase()
              const status: "ready" | "warning" | "blocker" =
                statusRaw === "warning" || statusRaw === "blocker" ? (statusRaw as "warning" | "blocker") : "ready"
              const label = sanitizeString((item as Record<string, unknown>).label)
              const id = sanitizeString((item as Record<string, unknown>).id)
              return {
                id: id ?? `check-${index + 1}`,
                label: label ?? `Checklist item ${index + 1}`,
                status,
              }
            })
            .filter((entry): entry is { id: string; label: string; status: "ready" | "warning" | "blocker" } => Boolean(entry))
        : []

      if (!attestedBy || !statement) {
        throw new Error("Attestation requires the provider name and attestation statement.")
      }

      const latestValidation =
        preFinalizeResultRef.current ??
        ((sessionDataRef.current?.lastValidation as PreFinalizeCheckResponse | null | undefined) ?? null)

      const stepValidation =
        latestValidation && typeof latestValidation.stepValidation === "object"
          ? (latestValidation.stepValidation as Record<string, Record<string, unknown>>)
          : {}

      const codeVerification = stepValidation.codeVerification ?? {}
      const contentReview = stepValidation.contentReview ?? {}
      const complianceReview = stepValidation.complianceChecks ?? {}

      const codesValidated = (codeVerification?.passed as boolean | undefined) !== false
      const documentationVerified = (contentReview?.passed as boolean | undefined) !== false
      const complianceVerified = (complianceReview?.passed as boolean | undefined) !== false

      const estimatedFromValidation =
        typeof latestValidation?.estimatedReimbursement === "number"
          ? latestValidation.estimatedReimbursement
          : undefined
      const estimatedFromSummary =
        typeof reimbursementSummary?.total === "number"
          ? reimbursementSummary.total
          : typeof sessionDataRef.current?.reimbursementSummary?.total === "number"
            ? sessionDataRef.current.reimbursementSummary?.total
            : undefined
      const estimatedReimbursement = estimatedFromSummary ?? estimatedFromValidation ?? 0

      const payerRequirements = new Set<string>()
      combinedBlockingIssues.forEach((issue) => {
        const normalized = sanitizeIssueText(issue)
        if (normalized) {
          payerRequirements.add(normalized)
        }
      })
      if (latestValidation?.issues) {
        flattenIssuesObject(latestValidation.issues).forEach((issue) => payerRequirements.add(issue))
      }

      const billingValidationPayload = {
        codes_validated: codesValidated,
        documentation_level_verified: documentationVerified,
        medical_necessity_confirmed: codesValidated,
        billing_compliance_checked: complianceVerified,
        estimated_reimbursement: estimatedReimbursement,
        payer_specific_requirements: Array.from(payerRequirements),
      }

      const complianceSource = (() => {
        const fromSession = sessionDataRef.current?.complianceIssues
        if (Array.isArray(fromSession) && fromSession.length > 0) {
          return fromSession as Array<Record<string, unknown>>
        }
        if (Array.isArray(latestValidation?.complianceIssues) && latestValidation.complianceIssues.length > 0) {
          return latestValidation.complianceIssues as Array<Record<string, unknown>>
        }
        return []
      })()

      const complianceChecksPayload = complianceSource.map((issue, index) => {
        const record = issue ?? {}
        const type =
          sanitizeString((record as Record<string, unknown>).check_type) ??
          sanitizeString((record as Record<string, unknown>).category) ??
          sanitizeString((record as Record<string, unknown>).type) ??
          `check_${index + 1}`
        const status = sanitizeString((record as Record<string, unknown>).status) ?? "pass"
        const description =
          sanitizeString((record as Record<string, unknown>).description) ??
          sanitizeString((record as Record<string, unknown>).title) ??
          `Compliance check ${index + 1}`
        const required = toTrimmedStringArray(
          (record as Record<string, unknown>).required_actions ??
            (record as Record<string, unknown>).requiredActions ??
            [],
        )
        return {
          check_type: type,
          status,
          description,
          required_actions: required,
        }
      })

      const diagnosisCodes: string[] = []
      const procedureCodes: string[] = []
      let evaluationManagement: string | undefined
      let totalRvu = 0

      selectedWizardCodes.forEach((item) => {
        const code = sanitizeString(item.code)
        if (!code) {
          return
        }
        const type = sanitizeString((item as Record<string, unknown>).codeType ?? item.type)
        const rvuValue =
          typeof item.rvu === "number"
            ? item.rvu
            : typeof item.rvu === "string"
              ? Number(item.rvu)
              : undefined
        if (typeof rvuValue === "number" && Number.isFinite(rvuValue)) {
          totalRvu += rvuValue
        }
        if ((type ?? "").toUpperCase() === "CPT") {
          if (!procedureCodes.includes(code)) {
            procedureCodes.push(code)
          }
          if (!evaluationManagement && code.startsWith("99")) {
            evaluationManagement = code
          }
        } else if (!diagnosisCodes.includes(code)) {
          diagnosisCodes.push(code)
        }
      })

      const primaryDiagnosis =
        diagnosisCodes[0] ?? sanitizeString(selectedWizardCodes[0]?.code ?? selectedWizardCodes[0]?.title)
      const secondaryDiagnoses = diagnosisCodes.slice(1)

      const billingSummaryPayload: Record<string, unknown> = {
        procedures: procedureCodes,
        modifier_codes: [],
        total_rvu: Number.isFinite(totalRvu) ? Number(totalRvu.toFixed(2)) : 0,
        estimated_payment: estimatedReimbursement,
      }
      if (primaryDiagnosis) {
        billingSummaryPayload.primary_diagnosis = primaryDiagnosis
      }
      if (secondaryDiagnoses.length) {
        billingSummaryPayload.secondary_diagnoses = secondaryDiagnoses
      }
      if (evaluationManagement) {
        billingSummaryPayload.evaluation_management_level = evaluationManagement
      }

      const attestationPayload: Record<string, unknown> = {
        physician_attestation: true,
        attestation_text: statement,
        attestedBy,
      }
      if (ipAddress) {
        attestationPayload.attestation_ip_address = ipAddress
      }
      if (signature) {
        attestationPayload.digital_signature = signature
      }

      const requestBody = {
        encounterId,
        sessionId: activeSessionId,
        ip: ipAddress || undefined,
        billing_validation: billingValidationPayload,
        attestation: attestationPayload,
        compliance_checks: complianceChecksPayload,
        billing_summary: billingSummaryPayload,
        payer_checklist: payerChecklistPayload,
      }

      const response = await fetchWithAuth(`/api/v1/workflow/${activeSessionId}/step5/attest`, {
        method: "POST",
        jsonBody: requestBody,
      })

      if (!response.ok) {
        throw new Error(`Attestation failed (${response.status})`)
      }

      const data = await response.json().catch(() => ({}))
      const payload = (data?.session ?? data) as WorkflowSessionResponsePayload
      const responseCanFinalize = typeof data?.canFinalize === "boolean" ? data.canFinalize : undefined

      setSessionData((prev) => {
        if (!payload || typeof payload !== "object") {
          return prev
        }

        const next: WorkflowSessionResponsePayload = { ...(prev ?? {}), ...payload }

        const existingBlocking = Array.isArray(prev?.blockingIssues)
          ? prev.blockingIssues.map((issue) => sanitizeIssueText(issue)).filter((issue): issue is string => Boolean(issue))
          : []
        const incomingBlocking = Array.isArray(payload.blockingIssues)
          ? payload.blockingIssues.map((issue) => sanitizeIssueText(issue)).filter((issue): issue is string => Boolean(issue))
          : []
        const mergedBlocking = new Set<string>([...existingBlocking, ...incomingBlocking])
        if (mergedBlocking.size) {
          next.blockingIssues = Array.from(mergedBlocking)
        }

        const extras: Partial<StoredFinalizationSession> = {}
        const resolvedPreFinalize = sessionSnapshot?.lastPreFinalize ?? preFinalizeResultRef.current ?? undefined
        const resolvedFinalize = sessionSnapshot?.lastFinalizeResult ?? lastFinalizeResultRef.current ?? undefined
        if (resolvedPreFinalize) {
          extras.lastPreFinalize = resolvedPreFinalize
        }
        if (resolvedFinalize) {
          extras.lastFinalizeResult = resolvedFinalize
        }
        if (typeof responseCanFinalize === "boolean") {
          const validationNode =
            next.lastValidation && typeof next.lastValidation === "object"
              ? { ...(next.lastValidation as Record<string, unknown>) }
              : {}
          validationNode.canFinalize = responseCanFinalize
          next.lastValidation = validationNode as any
        }

        persistSession(next, extras)
        return next
      })

      const attestationResult =
        data && typeof data.recap === "object"
          ? (data.recap as Record<string, unknown>)
          : payload?.attestation
      return {
        attestation: attestationResult ? (attestationResult as Record<string, unknown>) : undefined,
        reimbursementSummary: payload?.reimbursementSummary,
        recap: data && typeof data.recap === "object" ? (data.recap as Record<string, unknown>) : undefined,
        canFinalize: responseCanFinalize,
      }
    },
    [
      combinedBlockingIssues,
      encounterId,
      fetchWithAuth,
      initialSessionSnapshot?.sessionId,
      preFinalizeResultRef,
      reimbursementSummary?.total,
      selectedWizardCodes,
      sessionData,
      sessionDataRef,
      sessionSnapshot,
      persistSession,
    ],
  )


  const handleFinalize = useCallback(
    async (request: FinalizeRequest): Promise<FinalizeResult> => {
      const payload = toFinalizeRequestPayload(request, finalizeRequestSnapshot)

      try {
        const response = await fetchWithAuth("/api/notes/finalize", {
          method: "POST",
          jsonBody: payload,
        })

        if (!response.ok) {
          throw new Error(`Finalization failed (${response.status})`)
        }

        const data = (await response.json()) as FinalizeNoteResponse
        const finalizedNoteId =
          typeof data.finalizedNoteId === "string" && data.finalizedNoteId.trim().length > 0
            ? data.finalizedNoteId.trim()
            : undefined
        const resultWithId = finalizedNoteId ? ({ ...data, finalizedNoteId } as FinalizeNoteResponse) : data
        lastFinalizeResultRef.current = resultWithId as FinalizeResult
        applyValidationResult(resultWithId, {
          finalizeResult: resultWithId,
          finalizedNoteId,
        })
        return resultWithId
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to finalize the note."
        onError?.(message, error)
        throw error
      }
    },
    [applyValidationResult, fetchWithAuth, finalizeRequestSnapshot, onError],
  )

  const handleFinalizeAndDispatch = useCallback(
    async (
      request: FinalizeRequest,
      dispatchForm: Record<string, unknown>,
    ): Promise<{ finalizedNoteId?: string; result?: FinalizeResult }> => {
      const payload = toFinalizeRequestPayload(request, finalizeRequestSnapshot)

      try {
        const preResponse = await fetchWithAuth("/api/notes/pre-finalize-check", {
          method: "POST",
          jsonBody: payload,
        })
        if (!preResponse.ok) {
          throw new Error(`Pre-finalize check failed (${preResponse.status})`)
        }
        const preData = (await preResponse.json()) as PreFinalizeCheckResponse
        applyValidationResult(preData)

        if (preData.canFinalize === false) {
          throw new Error("Resolve validation blockers before dispatching the note.")
        }

        const finalizeResponse = await fetchWithAuth("/api/notes/finalize", {
          method: "POST",
          jsonBody: payload,
        })
        if (!finalizeResponse.ok) {
          throw new Error(`Finalization failed (${finalizeResponse.status})`)
        }
        const finalizeData = (await finalizeResponse.json()) as FinalizeNoteResponse
        const finalizedNoteId =
          typeof finalizeData.finalizedNoteId === "string" && finalizeData.finalizedNoteId.trim().length > 0
            ? finalizeData.finalizedNoteId.trim()
            : undefined
        const finalizePayload = finalizedNoteId
          ? ({ ...finalizeData, finalizedNoteId } as FinalizeNoteResponse)
          : finalizeData
        lastFinalizeResultRef.current = finalizePayload as FinalizeResult
        applyValidationResult(finalizePayload, {
          finalizeResult: finalizePayload,
          finalizedNoteId,
        })

        const sessionId = sessionDataRef.current?.sessionId ?? sessionSnapshot?.sessionId
        if (!sessionId) {
          throw new Error("Finalization session is not available for dispatch.")
        }

        const dispatchPayload =
          dispatchForm && typeof dispatchForm === "object" ? { ...dispatchForm } : ({} as Record<string, unknown>)
        if (!("sessionId" in dispatchPayload) || typeof dispatchPayload.sessionId !== "string") {
          dispatchPayload.sessionId = sessionId
        }
        if (!("encounterId" in dispatchPayload) || typeof dispatchPayload.encounterId !== "string") {
          const encounter = sessionDataRef.current?.encounterId ?? encounterId
          if (encounter) {
            dispatchPayload.encounterId = encounter
          }
        }
        if (!("timestamp" in dispatchPayload)) {
          dispatchPayload.timestamp = new Date().toISOString()
        }

        const dispatchResponse = await fetchWithAuth(
          `/api/v1/workflow/${encodeURIComponent(sessionId)}/step6/dispatch`,
          {
            method: "POST",
            jsonBody: dispatchPayload,
          },
        )
        if (!dispatchResponse.ok) {
          throw new Error(`Dispatch failed (${dispatchResponse.status})`)
        }

        const dispatchJson = (await dispatchResponse.json()) as {
          session?: WorkflowSessionResponsePayload | null
          result?: FinalizeResult | null
        }
        const dispatchSession = dispatchJson.session ?? null
        const dispatchSummary =
          (dispatchSession && typeof dispatchSession.dispatch === "object"
            ? (dispatchSession.dispatch as Record<string, unknown>)
            : undefined) ??
          (typeof dispatchForm === "object" && dispatchForm ? dispatchForm : undefined)

        const dispatchResultRaw = dispatchJson.result
          ? ({ ...dispatchJson.result, ...(finalizedNoteId ? { finalizedNoteId } : {}) } as FinalizeNoteResponse)
          : finalizePayload
        const dispatchResult = dispatchResultRaw as FinalizeResult
        applyValidationResult(finalizePayload, {
          finalizeResult: dispatchResultRaw,
          finalizedNoteId,
          dispatchSummary,
          sessionOverride: dispatchSession,
        })

        lastFinalizeResultRef.current = dispatchResult

        return {
          finalizedNoteId,
          result: dispatchResult,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to finalize and dispatch the note."
        onError?.(message, error)
        throw error instanceof Error ? error : new Error(message)
      }
    },
    [applyValidationResult, encounterId, fetchWithAuth, finalizeRequestSnapshot, onError, sessionSnapshot],
  )

  const handleWizardStepChange = useCallback(
    (stepId: number) => {
      setActiveWizardStep(stepId)
      setSessionData((prev) => {
        if (!prev) {
          return prev
        }
        const updated: WorkflowSessionResponsePayload = { ...prev, currentStep: stepId }
        persistSession(updated)
        return updated
      })
    },
    [persistSession],
  )

  const handleClose = useCallback(
    (result?: FinalizeResult) => {
      const payload = result ?? lastFinalizeResultRef.current ?? undefined
      onClose(payload)
    },
    [onClose],
  )

  const renderConnectionBadge = useCallback((label: string, state?: StreamConnectionState) => {
    const status = state?.status ?? "idle"
    let display = "Idle"
    let className = "border-border bg-muted/60 text-muted-foreground"
    if (status === "open") {
      display = "Live"
      className = "border-emerald-200 bg-emerald-100 text-emerald-700"
    } else if (status === "connecting") {
      display = "Connecting"
      className = "border-amber-200 bg-amber-100 text-amber-700"
    } else if (status === "error") {
      display = "Offline"
      className = "border-red-200 bg-red-100 text-red-700"
    } else if (status === "closed") {
      display = "Retrying"
      className = "border-slate-200 bg-slate-200 text-slate-700"
    }
    return (
      <Badge key={label} variant="outline" className={`gap-2 px-3 py-1 text-xs font-medium ${className}`}>
        <span>{label}</span>
        <span>{display}</span>
      </Badge>
    )
  }, [])

  const connectionBanner = (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-muted/40 px-4 py-2">
      {renderConnectionBadge("Codes", codesConnection)}
      {renderConnectionBadge("Compliance", complianceConnection)}
    </div>
  )

  if (!isOpen) {
    return null
  }

  const wizard = (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {connectionBanner}
      <FinalizationWizard
        selectedCodes={selectedWizardCodes}
        suggestedCodes={wizardSuggestions}
        complianceItems={complianceWizardItems}
        noteContent={sessionData?.noteContent ?? noteContent ?? ""}
        patientMetadata={patientMetadata}
        reimbursementSummary={reimbursementSummary}
        transcriptEntries={sanitizedTranscripts}
        blockingIssues={combinedBlockingIssues}
        attestationRecap={attestationRecap}
        stepOverrides={mergedStepOverrides.length ? mergedStepOverrides : undefined}
        initialStep={derivedCurrentStep}
        canFinalize={validationState.canFinalize}
        composeJob={composeJob ?? undefined}
        composeError={composeError ?? undefined}
        onRequestCompose={handleComposeRequest}
        onFinalize={handleFinalize}
        onFinalizeAndDispatch={handleFinalizeAndDispatch}
        onSubmitAttestation={submitAttestation}
        onStepChange={handleWizardStepChange}
        onClose={handleClose}
      />
    </div>
  )

  if (displayMode === "embedded") {
    return wizard
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onClose()} />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">{wizard}</div>
    </div>
  )
}
