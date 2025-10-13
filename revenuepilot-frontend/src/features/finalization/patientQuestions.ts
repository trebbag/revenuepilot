export type WizardPatientQuestionPriority = "high" | "medium" | "low" | string

export type WizardPatientQuestionStatus =
  | "pending"
  | "in_progress"
  | "answered"
  | "resolved"
  | "dismissed"
  | "sent_to_portal"
  | "forwarded_to_staff"
  | string

export interface WizardPatientQuestionAnswerMetadata extends Record<string, unknown> {
  answerText?: string
  confidenceLevel?: string
  notes?: string | null
  verificationNeeded?: boolean
}

export interface WizardPatientQuestion extends Record<string, unknown> {
  id: number | string
  question: string
  questionText?: string
  source?: string
  priority?: WizardPatientQuestionPriority
  codeRelated?: string | null
  category?: "clinical" | "administrative" | "documentation" | string
  status?: WizardPatientQuestionStatus
  answer?: string | WizardPatientQuestionAnswerMetadata | null
  answerMetadata?: WizardPatientQuestionAnswerMetadata | null
  answeredAt?: string | null
  answeredBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

const INACTIVE_STATUSES = new Set(["answered", "resolved", "dismissed"])

const PRIORITY_MAP: Record<string, WizardPatientQuestionPriority> = {
  high: "high",
  medium: "medium",
  low: "low",
}

function normalizePriority(rawPriority: unknown): WizardPatientQuestionPriority | undefined {
  if (typeof rawPriority !== "string") {
    return undefined
  }

  const normalized = rawPriority.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  return PRIORITY_MAP[normalized] ?? rawPriority
}

function normalizeAnswerMetadata(
  payload: unknown,
): WizardPatientQuestionAnswerMetadata | null | undefined {
  if (!payload || typeof payload !== "object") {
    if (typeof payload === "string") {
      return { answerText: payload }
    }
    return null
  }

  const record = payload as Record<string, unknown>
  const answerText = typeof record.answerText === "string" ? record.answerText : undefined
  const confidenceLevel = typeof record.confidenceLevel === "string" ? record.confidenceLevel : undefined
  const notes =
    record.notes == null
      ? null
      : typeof record.notes === "string"
        ? record.notes
        : String(record.notes)
  const verificationNeeded =
    record.verificationNeeded == null ? undefined : Boolean(record.verificationNeeded)

  return {
    ...record,
    answerText,
    confidenceLevel,
    notes,
    verificationNeeded,
  }
}

export interface NormalizePatientQuestionOptions {
  /** When true, return questions even if marked answered/dismissed. */
  includeInactive?: boolean
}

export function normalizePatientQuestion(
  input: unknown,
  index = 0,
  options: NormalizePatientQuestionOptions = {},
): WizardPatientQuestion | null {
  if (!input || typeof input !== "object") {
    return null
  }

  const record = input as Record<string, unknown>
  const rawId = record.id ?? record.questionId ?? index + 1

  let id: number | string
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    id = rawId
  } else if (typeof rawId === "string" && rawId.trim().length > 0) {
    id = rawId.trim()
  } else {
    id = index + 1
  }

  const textSource =
    typeof record.question === "string" && record.question.trim().length > 0
      ? record.question.trim()
      : typeof record.questionText === "string" && record.questionText.trim().length > 0
        ? record.questionText.trim()
        : ""

  if (!textSource) {
    return null
  }

  const rawStatus = typeof record.status === "string" ? record.status.trim() : undefined
  const normalizedStatus = rawStatus?.toLowerCase()

  if (!options.includeInactive && normalizedStatus && INACTIVE_STATUSES.has(normalizedStatus)) {
    return null
  }

  const normalizedAnswer = normalizeAnswerMetadata(record.answer ?? record.answerMetadata)

  const priority = normalizePriority(record.priority)
  const category = typeof record.category === "string" ? record.category : undefined
  const source = typeof record.source === "string" ? record.source : undefined
  const codeRelated =
    typeof record.codeRelated === "string"
      ? record.codeRelated
      : typeof record.relatedCode === "string"
        ? record.relatedCode
        : null

  const createdAt = typeof record.createdAt === "string" ? record.createdAt : undefined
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : undefined
  const answeredAt = typeof record.answeredAt === "string" ? record.answeredAt : undefined
  const answeredBy = typeof record.answeredBy === "string" ? record.answeredBy : undefined

  const normalized: WizardPatientQuestion = {
    ...(record as WizardPatientQuestion),
    id,
    question: textSource,
    questionText: typeof record.questionText === "string" ? record.questionText : textSource,
    source,
    priority,
    codeRelated,
    category,
    status: rawStatus,
    answer: normalizedAnswer?.answerText ?? (typeof record.answer === "string" ? record.answer : null),
    answerMetadata: normalizedAnswer ?? null,
    createdAt,
    updatedAt,
    answeredAt,
    answeredBy,
  }

  return normalized
}

export function normalizePatientQuestionList(
  input: unknown,
  options: NormalizePatientQuestionOptions = {},
): WizardPatientQuestion[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((entry, index) => normalizePatientQuestion(entry, index, options))
    .filter((entry): entry is WizardPatientQuestion => Boolean(entry))
}

export const PatientQuestionInactiveStatuses = INACTIVE_STATUSES
