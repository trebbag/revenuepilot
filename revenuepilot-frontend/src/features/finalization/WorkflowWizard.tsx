import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Settings,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { ProgressIndicator } from "./ProgressIndicator"
import { NoteEditor } from "./NoteEditor"
import { StepContent } from "./StepContent"
import { DualRichTextEditor } from "./DualRichTextEditor"

type CodeStatus = "pending" | "confirmed" | "completed" | "in-progress"

export type StepStatus = "pending" | "in-progress" | "completed" | "blocked"

export type CodeClassification = "code" | "prevention" | "diagnosis" | "differential"

export interface WizardCodeItem extends Record<string, unknown> {
  id?: number | string
  code?: string
  title?: string
  status?: CodeStatus
  details?: string
  description?: string
  codeType?: string
  docSupport?: string
  stillValid?: boolean
  confidence?: number
  aiReasoning?: string
  evidence?: string[]
  gaps?: string[]
  suggestedBy?: string
  classification?: CodeClassification | CodeClassification[] | string | string[]
  category?: string
  tags?: string[]
}

export interface WizardComplianceItem extends Record<string, unknown> {
  id?: number | string
  code?: string
  title?: string
  description?: string
  status?: CodeStatus
  category?: string
  severity?: "low" | "medium" | "high"
}

export interface PatientMetadata extends Record<string, unknown> {
  patientId?: string
  encounterId?: string
  name?: string
  age?: number
  sex?: string
  dob?: string
  encounterDate?: string
  providerName?: string
}

export interface VisitTranscriptEntry extends Record<string, unknown> {
  id?: number | string
  speaker?: string
  text?: string
  timestamp?: number | string
  confidence?: number
}

export interface WizardPatientQuestion {
  id: number
  question: string
  source: string
  priority: "high" | "medium" | "low"
  codeRelated: string
  category: "clinical" | "administrative" | "documentation"
}

export interface WizardProgressStep {
  id: number
  title: string
  status: "pending" | "in-progress" | "completed" | "blocked"
}

export interface ComposeJobStep {
  id?: number
  stage?: string | null
  status?: string | null
  progress?: number | null
}

export interface ComposeJobState {
  composeId: number
  status: string
  stage?: string | null
  progress?: number | null
  steps?: ComposeJobStep[]
  result?: Record<string, unknown> | null
  validation?: {
    ok?: boolean
    issues?: Record<string, unknown>
    detail?: Record<string, unknown>
    [key: string]: unknown
  } | null
  message?: string | null
}

export type WizardStepType =
  | "selected-codes"
  | "suggested-codes"
  | "loading"
  | "dual-editor"
  | "attestation"
  | "placeholder"
  | "dispatch"

interface NormalizedWizardCodeItem extends WizardCodeItem {
  id: number
  title: string
  status: CodeStatus
  details: string
  codeType: string
  category: "ICD-10" | "CPT" | "Public Health"
  evidence: string[]
  gaps: string[]
  classifications: CodeClassification[]
}

interface NormalizedComplianceItem extends WizardComplianceItem {
  id: number
  title: string
  description: string
  status: CodeStatus
}

export interface WizardStepData {
  id: number
  title: string
  description: string
  type: WizardStepType
  stepType?: "selected" | "suggested"
  totalSelected?: number
  totalSuggestions?: number
  items?: NormalizedWizardCodeItem[]
  progressSteps?: WizardProgressStep[]
  status?: StepStatus
  progress?: number
  originalContent?: string
  beautifiedContent?: string
  patientSummaryContent?: string
  patientQuestions?: WizardPatientQuestion[]
}

export interface WizardStepOverride extends Partial<Omit<WizardStepData, "id">> {
  id: number
}

export interface FinalizeRequest {
  content: string
  codes: string[]
  prevention: string[]
  diagnoses: string[]
  differentials: string[]
  compliance: string[]
  patient?: PatientMetadata
}

export interface FinalizeResult {
  finalizedContent: string
  codesSummary: Array<Record<string, unknown>>
  reimbursementSummary: {
    total: number
    codes: Array<Record<string, unknown>>
  }
  exportReady: boolean
  issues: Record<string, string[]>
  [key: string]: unknown
}

export interface AttestationFormPayload {
  attestedBy: string
  statement: string
  ipAddress?: string
  signature?: string
}

export interface AttestationSubmitResult {
  attestation?: Record<string, unknown>
  reimbursementSummary?: { total?: number; codes?: Array<Record<string, unknown>> }
}

export interface FinalizationWizardProps {
  selectedCodes?: WizardCodeItem[]
  suggestedCodes?: WizardCodeItem[]
  complianceItems?: WizardComplianceItem[]
  noteContent?: string
  patientMetadata?: PatientMetadata
  reimbursementSummary?: { total?: number; codes?: Array<Record<string, unknown>> }
  transcriptEntries?: VisitTranscriptEntry[]
  blockingIssues?: string[]
  attestationRecap?: Record<string, unknown>
  stepOverrides?: WizardStepOverride[]
  initialStep?: number
  canFinalize?: boolean
  onClose?: (result?: FinalizeResult) => void
  onFinalize?: (request: FinalizeRequest) => Promise<FinalizeResult | void> | FinalizeResult | void
  onFinalizeAndDispatch?: (
    request: FinalizeRequest,
    dispatchForm: Record<string, unknown>,
  ) =>
    | Promise<{ finalizedNoteId?: string; result?: FinalizeResult } | void>
    | { finalizedNoteId?: string; result?: FinalizeResult }
    | void
  onSubmitAttestation?:
    | ((payload: AttestationFormPayload) => Promise<AttestationSubmitResult | void> | AttestationSubmitResult | void)
    | undefined
  onStepChange?: (stepId: number, step: WizardStepData) => void
  composeJob?: ComposeJobState | null
  composeError?: string | null
  onRequestCompose?: (options?: { force?: boolean }) => void
}

const COMPOSE_PROGRESS_SEQUENCE: Array<Pick<WizardProgressStep, "id" | "title">> = [
  { id: 1, title: "Analyzing Content" },
  { id: 2, title: "Enhancing Structure" },
  { id: 3, title: "Beautifying Language" },
  { id: 4, title: "Final Review" },
]

const COMPOSE_STAGE_TITLE_MAP: Record<string, string> = {
  analyzing: "Analyzing Content",
  enhancing_structure: "Enhancing Structure",
  beautifying_language: "Beautifying Language",
  final_review: "Final Review",
}

const STATUS_ORDER: CodeStatus[] = ["pending", "in-progress", "confirmed", "completed"]

function toNumberId(value: number | string | undefined, index: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = Number(value)
  if (Number.isFinite(parsed)) return parsed
  return index + 1
}

function inferCodeType(code?: string, explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit
  }

  if (!code) {
    return "ICD-10"
  }

  if (/^\d{4,5}$/.test(code)) {
    return "CPT"
  }

  if (/^[A-Z][0-9A-Z]/i.test(code)) {
    return "ICD-10"
  }

  return "ICD-10"
}

function normalizeClassificationValue(value: string | undefined): CodeClassification | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (normalized.includes("differential")) return "differential"
  if (normalized.includes("prevent")) return "prevention"
  if (normalized.includes("diagn")) return "diagnosis"
  if (normalized.includes("code") || normalized.includes("procedure")) return "code"
  return undefined
}

function normalizeClassifications(item: WizardCodeItem): CodeClassification[] {
  const values = new Set<CodeClassification>()

  const raw = item.classification
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (typeof entry === "string") {
        const normalized = normalizeClassificationValue(entry)
        if (normalized) values.add(normalized)
      }
    })
  } else if (typeof raw === "string") {
    const normalized = normalizeClassificationValue(raw)
    if (normalized) values.add(normalized)
  }

  const category = typeof item.category === "string" ? item.category.toLowerCase() : ""
  const categoryClassification = normalizeClassificationValue(category)
  if (categoryClassification) {
    values.add(categoryClassification)
  }

  if (Array.isArray(item.tags)) {
    item.tags.forEach((tag) => {
      if (typeof tag === "string") {
        const normalized = normalizeClassificationValue(tag)
        if (normalized) values.add(normalized)
      }
    })
  }

  if (item.codeType === "CPT") {
    values.add("code")
  } else if ((item.codeType || "").toUpperCase() === "ICD-10") {
    values.add("diagnosis")
  }

  if (item.code && /^\d{4,5}$/.test(item.code)) {
    values.add("code")
  }

  if (!values.size) {
    values.add("diagnosis")
  }

  return Array.from(values.values())
}

function normalizeStatus(status?: string): CodeStatus {
  if (status && STATUS_ORDER.includes(status as CodeStatus)) {
    return status as CodeStatus
  }
  return "pending"
}

function normalizeCodeItems(items?: WizardCodeItem[]): NormalizedWizardCodeItem[] {
  if (!items || !Array.isArray(items)) {
    return []
  }

  return items.map((item, index) => {
    const id = toNumberId(item.id, index)
    const title = item.title || (item.code ? `${item.code}` : `Item ${index + 1}`)
    const status = normalizeStatus(item.status as string | undefined)
    const details = item.details || item.description || ""
    const codeType = inferCodeType(item.code, item.codeType)
    const category = codeType === "CPT" ? "CPT" : "ICD-10"
    const evidence = Array.isArray(item.evidence) ? item.evidence : []
    const gaps = Array.isArray(item.gaps) ? item.gaps : []
    const classifications = normalizeClassifications(item)

    return {
      ...item,
      id,
      title,
      status,
      details,
      codeType,
      category,
      evidence,
      gaps,
      classifications,
    }
  })
}

function normalizeComplianceItems(items?: WizardComplianceItem[]): NormalizedComplianceItem[] {
  if (!items || !Array.isArray(items)) {
    return []
  }

  return items.map((item, index) => {
    const id = toNumberId(item.id, index)
    const title = item.title || item.code || `Compliance ${index + 1}`
    const description = item.description || ""
    const status = normalizeStatus(item.status as string | undefined)

    return {
      ...item,
      id,
      title,
      description,
      status,
    }
  })
}

function createOverridesMap(overrides?: WizardStepOverride[]): Map<number, WizardStepOverride> {
  const map = new Map<number, WizardStepOverride>()
  if (!overrides) return map
  overrides.forEach((entry) => {
    if (entry && typeof entry.id === "number") {
      map.set(entry.id, entry)
    }
  })
  return map
}

function getPatientName(metadata?: PatientMetadata): string {
  return metadata?.name || "Patient"
}

function getDefaultNoteContent(metadata?: PatientMetadata): string {
  const name = getPatientName(metadata)
  const date = metadata?.encounterDate || new Date().toLocaleDateString()
  return `PATIENT: ${name}\nDATE: ${date}\n\nCHIEF COMPLAINT:\nChest pain for 2 days.\n\nHISTORY OF PRESENT ILLNESS:\nPatient reports chest pain. Started 2 days ago. Pain is sharp. Located in precordial region. Intermittent. Worsens with activity. Smoking history 1 pack per day for 30 years.\n\nPHYSICAL EXAMINATION:\nGENERAL: Alert, oriented, comfortable at rest\nCARDIOVASCULAR: Regular rate and rhythm, no murmurs, no peripheral edema\nRESPIRATORY: Clear to auscultation bilaterally\nEXTREMITIES: No cyanosis, clubbing, or edema\n\nASSESSMENT:\nChest pain, likely musculoskeletal. Given smoking history and age, cardiac evaluation warranted.\n\nPLAN:\n1. EKG to rule out cardiac abnormalities\n2. Basic metabolic panel and lipid profile\n3. Consider stress testing if symptoms persist\n4. Smoking cessation counseling provided`
}

function createComposeProgressState(activeId?: number | null): WizardProgressStep[] {
  return COMPOSE_PROGRESS_SEQUENCE.map((step) => ({
    ...step,
    status: activeId === step.id ? "in-progress" : "pending",
  }))
}

function normalizeBulletSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (!collapsed) {
    return ""
  }

  if (/^[-•]/.test(collapsed)) {
    const content = collapsed.replace(/^[-•]\s*/, "").trim()
    if (!content) {
      return "•"
    }
    const formatted = /^[A-Za-z]/.test(content)
      ? content.charAt(0).toUpperCase() + content.slice(1)
      : content
    return `• ${formatted}`
  }

  if (/^\d+\./.test(collapsed)) {
    const match = collapsed.match(/^(\d+\.)\s*(.*)$/)
    if (match) {
      const body = match[2]
      const formatted = body ? body.charAt(0).toUpperCase() + body.slice(1) : ""
      return `${match[1]} ${formatted}`.trim()
    }
    return collapsed
  }

  if (!/^[A-Za-z]/.test(collapsed)) {
    return collapsed
  }

  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1)
}

function normalizeSentence(line: string): string {
  const collapsed = line.replace(/\s+/g, " ").trim()
  if (!collapsed) {
    return ""
  }

  if (/^[-•]/.test(collapsed) || /^\d+\./.test(collapsed)) {
    return normalizeBulletSentence(collapsed)
  }

  if (!/^[A-Za-z]/.test(collapsed)) {
    return collapsed
  }

  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1)
}

function formatNoteForEnhancement(note: string): string {
  const lines = note.split(/\r?\n/)
  const formatted: string[] = []
  let previousWasHeading = false

  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      return
    }

    const isHeading = /^[A-Za-z][A-Za-z\s\/]+:$/.test(trimmed)

    if (isHeading) {
      const normalizedHeading = trimmed.replace(/\s+/g, " ").toUpperCase()
      if (formatted.length && formatted[formatted.length - 1] !== "") {
        formatted.push("")
      }
      formatted.push(normalizedHeading)
      previousWasHeading = true
      return
    }

    const normalized = normalizeSentence(trimmed)
    if (previousWasHeading) {
      formatted.push(normalized)
      previousWasHeading = false
      return
    }

    formatted.push(normalized)
    previousWasHeading = false
  })

  return formatted.join("\n")
}

function cleanSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (!trimmed) {
    return ""
  }

  const capitalized = /^[A-Za-z]/.test(trimmed)
    ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    : trimmed

  if (/[.!?:;)]$/.test(capitalized)) {
    return capitalized
  }

  return `${capitalized}.`
}

function buildCodeJustifications(
  codes: NormalizedWizardCodeItem[],
  metadata?: PatientMetadata,
): string[] {
  if (!codes.length) {
    return ["• No billing codes were selected during this workflow."]
  }

  const seen = new Set<string>()
  const patientName = getPatientName(metadata)

  return codes.reduce<string[]>((acc, item, index) => {
    const identifier = item.code ? item.code.trim() : ""
    const key = (identifier || item.title || String(item.id)).toLowerCase()
    if (seen.has(key)) {
      return acc
    }
    seen.add(key)

    const descriptorParts = []
    if (identifier) {
      descriptorParts.push(identifier)
    }
    if (item.title && (!identifier || item.title.toLowerCase() !== identifier.toLowerCase())) {
      descriptorParts.push(item.title)
    }
    const descriptor = descriptorParts.length ? descriptorParts.join(" – ") : item.title || `Code ${index + 1}`

    const evidenceSources = [
      typeof item.docSupport === "string" ? item.docSupport : undefined,
      typeof item.details === "string" ? item.details : undefined,
      typeof item.description === "string" ? item.description : undefined,
      typeof item.aiReasoning === "string" ? item.aiReasoning : undefined,
      Array.isArray(item.evidence) && item.evidence.length ? item.evidence.join("; ") : undefined,
      Array.isArray(item.gaps) && item.gaps.length ? item.gaps[0] : undefined,
    ]

    const rawReason = evidenceSources.find((entry) => typeof entry === "string" && entry.trim().length > 0)
    const reason = rawReason
      ? cleanSentence(rawReason)
      : `Documented findings for ${patientName} support this selection.`

    acc.push(`• ${descriptor}: ${reason}`)
    return acc
  }, [])
}

function deriveTranscriptHighlights(transcripts: VisitTranscriptEntry[]): string[] {
  if (!Array.isArray(transcripts) || !transcripts.length) {
    return []
  }

  return transcripts
    .filter((entry) => typeof entry?.text === "string" && entry.text.trim().length > 0)
    .slice(0, 3)
    .map((entry) => {
      const speaker = entry.speaker && entry.speaker.trim().length > 0 ? `${entry.speaker.trim()}: ` : ""
      return `• ${speaker}${entry.text.trim()}`
    })
}

function buildPatientSummaryDocument(
  note: string,
  metadata: PatientMetadata | undefined,
  codeJustifications: string[],
  transcripts: VisitTranscriptEntry[],
): string {
  const name = getPatientName(metadata)
  const date = metadata?.encounterDate || new Date().toLocaleDateString()
  const paragraphs = note
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const keyPoints = paragraphs.slice(0, 6).map((block) => `• ${block}`)
  const highlights = deriveTranscriptHighlights(transcripts)
  const billingPoints = codeJustifications.map((entry) => `• ${entry.replace(/^•\s*/, "")}`)

  let summary = `VISIT SUMMARY FOR: ${name}\nDATE: ${date}`
  summary += "\n\nWHAT WE DISCUSSED:\n"
  summary += keyPoints.length ? keyPoints.join("\n") : "• Please review the clinical note for visit details."

  if (highlights.length) {
    summary += "\n\nCONVERSATION HIGHLIGHTS:\n"
    summary += highlights.join("\n")
  }

  if (billingPoints.length) {
    summary += "\n\nBILLING CODES & REASONS:\n"
    summary += billingPoints.join("\n")
  }

  summary += "\n\nNEXT STEPS:\n• Follow the care plan outlined above.\n• Contact the clinic if symptoms change or new concerns arise."

  return summary
}

function composeEnhancedArtifacts(
  note: string,
  metadata: PatientMetadata | undefined,
  codes: NormalizedWizardCodeItem[],
  transcripts: VisitTranscriptEntry[],
): { professionalNote: string; patientSummary: string; codeJustifications: string[] } {
  const baseNote = note && note.trim().length > 0 ? note : getDefaultNoteContent(metadata)
  const formatted = formatNoteForEnhancement(baseNote)
  const codeJustifications = buildCodeJustifications(codes, metadata)
  const professionalNote = `${formatted}\n\nCODING JUSTIFICATION:\n${codeJustifications.join("\n")}`
  const patientSummary = buildPatientSummaryDocument(formatted, metadata, codeJustifications, transcripts)

  return { professionalNote, patientSummary, codeJustifications }
}

function buildBeautifiedContent(
  note: string,
  metadata: PatientMetadata | undefined,
  codes: NormalizedWizardCodeItem[] = [],
  transcripts: VisitTranscriptEntry[] = [],
): string {
  return composeEnhancedArtifacts(note, metadata, codes, transcripts).professionalNote
}

function buildPatientSummary(
  note: string,
  metadata: PatientMetadata | undefined,
  codes: NormalizedWizardCodeItem[] = [],
  transcripts: VisitTranscriptEntry[] = [],
): string {
  return composeEnhancedArtifacts(note, metadata, codes, transcripts).patientSummary
}

function performFinalValidation(original: string, enhanced: string, summary: string): boolean {
  if (!enhanced || !summary) {
    return false
  }

  const normalizedOriginal = formatNoteForEnhancement(original)
  const originalSegments = normalizedOriginal
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const enhancedLower = enhanced.toLowerCase()

  const preservesContent = originalSegments.every((segment) => enhancedLower.includes(segment.toLowerCase()))

  return preservesContent && summary.trim().length > 0
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function runComposeEnhancement({
  note,
  metadata,
  codes,
  transcripts,
}: {
  note: string
  metadata: PatientMetadata | undefined
  codes: NormalizedWizardCodeItem[]
  transcripts: VisitTranscriptEntry[]
}): Promise<{ professionalNote: string; patientSummary: string; codeJustifications: string[] }> {
  await delay(160)
  return composeEnhancedArtifacts(note, metadata, codes, transcripts)
}

function formatComplianceSummary(count: number): string {
  if (!count) {
    return "Final review, billing verification, and attestation"
  }

  if (count === 1) {
    return "Review 1 compliance item prior to attestation"
  }

  return `Review ${count} compliance items prior to attestation`
}

interface BillingAttestationStepProps {
  step: WizardStepData
  reimbursementSummary?: { total?: number; codes?: Array<Record<string, unknown>> }
  blockingIssues: string[]
  warnings: string[]
  attestation?: Record<string, unknown> | null
  onSubmit: (payload: AttestationFormPayload) => Promise<AttestationSubmitResult | void>
  onPrevious: () => void
  onNext: () => void
  canFinalize: boolean
}

function BillingAttestationStep({
  step,
  reimbursementSummary,
  blockingIssues,
  warnings,
  attestation,
  onSubmit,
  onPrevious,
  onNext,
  canFinalize,
}: BillingAttestationStepProps) {
  const { t } = useTranslation()
  const attestationDetails = useMemo(() => {
    if (!attestation || typeof attestation !== "object") {
      return {
        attestedBy: "",
        statement: "",
        estimated:
          typeof reimbursementSummary?.total === "number" ? reimbursementSummary.total : undefined,
      }
    }

    const record = attestation as Record<string, unknown>
    const attestationNode =
      record.attestation && typeof record.attestation === "object"
        ? (record.attestation as Record<string, unknown>)
        : record

    const getString = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = attestationNode[key] ?? record[key]
        if (typeof value === "string" && value.trim()) {
          return value.trim()
        }
      }
      return undefined
    }

    const attestedBy = getString("attestedBy", "attested_by") ?? ""
    const statement = getString("attestationText", "attestation_text", "statement") ?? ""

    const billingNode = (() => {
      const direct = record.billingValidation
      if (direct && typeof direct === "object") return direct as Record<string, unknown>
      const snake = record.billing_validation
      if (snake && typeof snake === "object") return snake as Record<string, unknown>
      return undefined
    })()

    const estimatedRaw = billingNode
      ? billingNode.estimatedReimbursement ?? billingNode.estimated_reimbursement ?? billingNode.estimated_payment
      : undefined

    let estimated: number | undefined
    if (typeof estimatedRaw === "number" && Number.isFinite(estimatedRaw)) {
      estimated = estimatedRaw
    } else if (typeof estimatedRaw === "string") {
      const parsed = Number(estimatedRaw)
      if (Number.isFinite(parsed)) {
        estimated = parsed
      }
    }

    if (typeof estimated !== "number" && typeof reimbursementSummary?.total === "number") {
      estimated = reimbursementSummary.total
    }

    return { attestedBy, statement, estimated }
  }, [attestation, reimbursementSummary?.total])

  const [form, setForm] = useState(() => ({
    attestedBy: attestationDetails.attestedBy ?? "",
    statement: attestationDetails.statement ?? "",
    ipAddress: "",
    signature: "",
  }))
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionSucceeded, setSubmissionSucceeded] = useState(
    Boolean(attestationDetails.attestedBy && attestationDetails.statement),
  )

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      attestedBy: attestationDetails.attestedBy || prev.attestedBy,
      statement: attestationDetails.statement || prev.statement,
    }))
  }, [attestationDetails.attestedBy, attestationDetails.statement])

  useEffect(() => {
    if (attestationDetails.attestedBy && attestationDetails.statement) {
      setSubmissionSucceeded(true)
    }
  }, [attestationDetails.attestedBy, attestationDetails.statement])

  const formattedEstimated = useMemo(() => {
    if (typeof attestationDetails.estimated !== "number") {
      return undefined
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Math.max(0, attestationDetails.estimated))
  }, [attestationDetails.estimated])

  const checklistItems = useMemo(() => {
    const items: Array<{ id: string; label: string; status: "ready" | "warning" | "blocker" }> = []

    if (Array.isArray(reimbursementSummary?.codes)) {
      reimbursementSummary.codes.forEach((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return
        }
        const record = entry as Record<string, unknown>
        const code = typeof record.code === "string" && record.code.trim() ? record.code.trim() : undefined
        const description =
          typeof record.description === "string" && record.description.trim() ? record.description.trim() : undefined
        const amountValue =
          typeof record.amount === "number"
            ? record.amount
            : typeof record.amountFormatted === "string"
              ? record.amountFormatted
              : undefined
        const labelParts = [code, description].filter((part): part is string => Boolean(part))
        const baseLabel = labelParts.length ? labelParts.join(" – ") : code ?? `Code ${index + 1}`
        const label =
          typeof amountValue === "number"
            ? `${baseLabel} (${new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2,
              }).format(amountValue)})`
            : typeof amountValue === "string"
              ? `${baseLabel} (${amountValue})`
              : baseLabel
        items.push({ id: `code-${index}`, label, status: "ready" })
      })
    }

    warnings.forEach((warning, index) => {
      items.push({ id: `warning-${index}`, label: warning, status: "warning" })
    })

    blockingIssues.forEach((issue, index) => {
      items.push({ id: `blocker-${index}`, label: issue, status: "blocker" })
    })

    return items
  }, [reimbursementSummary?.codes, warnings, blockingIssues])

  const handleChange = useCallback((field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSubmissionSucceeded(false)
  }, [])

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      if (submitting) {
        return
      }
      setSubmitting(true)
      setSubmitError(null)
      try {
        await onSubmit({
          attestedBy: form.attestedBy,
          statement: form.statement,
          ipAddress: form.ipAddress,
          signature: form.signature,
        })
        setSubmissionSucceeded(true)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to submit attestation."
        setSubmitError(message || "Unable to submit attestation.")
        setSubmissionSucceeded(false)
      } finally {
        setSubmitting(false)
      }
    },
    [form.attestedBy, form.statement, form.ipAddress, form.signature, onSubmit, submitting],
  )

  const nextDisabled =
    submitting || !form.attestedBy.trim() || !form.statement.trim() || !submissionSucceeded || !canFinalize

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full overflow-y-auto"
      style={{
        background: "linear-gradient(135deg, #fafcff 0%, #f3f7ff 45%, #f0f5ff 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-white/90 backdrop-blur-md border border-white/40 rounded-3xl shadow-xl shadow-slate-900/10 p-8 space-y-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <ClipboardList className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-800">{step.title}</h2>
                <p className="text-sm text-slate-600">{step.description}</p>
              </div>
            </div>
            {formattedEstimated && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                <div className="font-semibold">{t("workflow.estimatedReimbursement")}</div>
                <div>{formattedEstimated}</div>
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-6 shadow-inner">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                <Check size={16} className="text-emerald-600" /> Payer checklist
              </h3>
              <ul className="mt-4 space-y-3">
                {checklistItems.length === 0 ? (
                  <li className="flex items-start gap-3 text-sm text-slate-500">
                    <CheckCircle2 className="mt-0.5 text-emerald-500" size={16} />
                    {"No payer warnings or blockers detected."}
                  </li>
                ) : (
                  checklistItems.map((item) => {
                    const icon =
                      item.status === "ready" ? (
                        <CheckCircle2 className="text-emerald-600" size={18} />
                      ) : item.status === "warning" ? (
                        <AlertTriangle className="text-amber-500" size={18} />
                      ) : (
                        <AlertCircle className="text-red-500" size={18} />
                      )
                    return (
                      <li key={item.id} className="flex items-start gap-3 text-sm text-slate-700">
                        {icon}
                        <span>{item.label}</span>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>

            <form className="rounded-2xl border border-slate-200/60 bg-white/90 p-6 shadow" onSubmit={handleSubmit}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {t("workflow.attestationHeading")}
              </h3>
              <div className="mt-4 space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t("workflow.attestedByLabel")}</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={form.attestedBy}
                    onChange={(event) => handleChange("attestedBy", event.target.value)}
                    placeholder={t("workflow.attestedByPlaceholder") ?? ""}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t("workflow.statementLabel")}</span>
                  <textarea
                    className="min-h-[96px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={form.statement}
                    onChange={(event) => handleChange("statement", event.target.value)}
                    placeholder={t("workflow.statementPlaceholder") ?? ""}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">{t("workflow.ipLabel")}</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={form.ipAddress}
                      onChange={(event) => handleChange("ipAddress", event.target.value)}
                      placeholder="203.0.113.1"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">{t("workflow.signatureLabel")}</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={form.signature}
                      onChange={(event) => handleChange("signature", event.target.value)}
                      placeholder="sig-123"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {submissionSucceeded
                    ? t("workflow.attestationSummary")
                    : t("workflow.submitAttestation")}
                </div>
                <button
                  type="submit"
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition ${
                    submitting
                      ? "cursor-not-allowed bg-slate-400"
                      : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  }`}
                  disabled={submitting}
                >
                  {submitting ? t("workflow.submitting") : t("workflow.submitAttestation")}
                </button>
              </div>
              {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
            </form>
          </div>

          {attestationDetails.attestedBy || attestationDetails.statement ? (
            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                <CheckCircle2 className="text-emerald-600" size={18} /> {t("workflow.attestationSummary")}
              </h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>
                  <span className="font-medium text-slate-600">{t("workflow.attestedByLabel")}:</span>{" "}
                  {attestationDetails.attestedBy || t("workflow.unknown")}
                </li>
                <li>
                  <span className="font-medium text-slate-600">{t("workflow.statementLabel")}:</span>{" "}
                  {attestationDetails.statement || t("workflow.unknown")}
                </li>
                {formattedEstimated && (
                  <li>
                    <span className="font-medium text-slate-600">{t("workflow.estimatedReimbursement")}:</span>{" "}
                    {formattedEstimated}
                  </li>
                )}
              </ul>
            </div>
          ) : null}

          {!canFinalize && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {"Resolve validation blockers before continuing to dispatch."}
            </div>
          )}
        </motion.div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onPrevious}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
          >
            <ChevronLeft size={16} />
            Previous Step
          </button>
          <div className="text-xs text-slate-500">Step {step.id} of 6</div>
          <button
            type="button"
            onClick={() => {
              if (nextDisabled) {
                return
              }
              onNext()
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition ${
              nextDisabled
                ? "cursor-not-allowed bg-slate-400"
                : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            }`}
            disabled={nextDisabled}
          >
            Next Step <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export function FinalizationWizard({
  selectedCodes = [],
  suggestedCodes = [],
  complianceItems = [],
  noteContent: incomingNoteContent = "",
  patientMetadata,
  reimbursementSummary,
  transcriptEntries,
  blockingIssues,
  attestationRecap: incomingAttestationRecap,
  stepOverrides,
  initialStep = 1,
  canFinalize = true,
  onClose,
  onFinalize,
  onFinalizeAndDispatch,
  onSubmitAttestation,
  onStepChange,
  composeJob,
  composeError,
  onRequestCompose,
}: FinalizationWizardProps) {
  const normalizedSelected = useMemo(() => normalizeCodeItems(selectedCodes), [selectedCodes])
  const normalizedSuggested = useMemo(() => normalizeCodeItems(suggestedCodes), [suggestedCodes])
  const normalizedCompliance = useMemo(() => normalizeComplianceItems(complianceItems), [complianceItems])
  const normalizedTranscript = useMemo(() => {
    if (!Array.isArray(transcriptEntries)) {
      return [] as VisitTranscriptEntry[]
    }

    return transcriptEntries
      .map((entry, index) => {
        const text = typeof entry?.text === "string" ? entry.text.trim() : ""
        if (!text) return null

        const speaker = typeof entry?.speaker === "string" && entry.speaker.trim().length > 0 ? entry.speaker.trim() : undefined

        let timestamp: number | string | undefined
        if (typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)) {
          timestamp = entry.timestamp
        } else if (typeof entry?.timestamp === "string" && entry.timestamp.trim().length > 0) {
          timestamp = entry.timestamp.trim()
        }

        const confidence = typeof entry?.confidence === "number" && Number.isFinite(entry.confidence) ? Math.max(0, Math.min(1, entry.confidence)) : undefined

        return {
          id: entry?.id ?? index + 1,
          speaker,
          text,
          timestamp,
          confidence,
        } as VisitTranscriptEntry
      })
      .filter((entry): entry is VisitTranscriptEntry => Boolean(entry))
  }, [transcriptEntries])
  const overridesMap = useMemo(() => createOverridesMap(stepOverrides), [stepOverrides])
  const payerWarnings = useMemo(() => {
    const warnings = new Set<string>()

    const register = (value: unknown) => {
      if (typeof value !== "string") return
      const trimmed = value.trim()
      if (trimmed) {
        warnings.add(trimmed)
      }
    }

    const collectWarnings = (item: NormalizedWizardCodeItem) => {
      if (!item) return
      if (Array.isArray(item.gaps)) {
        item.gaps.forEach(register)
      }
      const extras = item as unknown as {
        warnings?: unknown
        validationFlags?: { warnings?: unknown }
      }
      if (Array.isArray(extras?.warnings)) {
        extras.warnings.forEach(register)
      }
      if (Array.isArray(extras?.validationFlags?.warnings)) {
        extras.validationFlags.warnings.forEach(register)
      }
    }

    normalizedSelected.forEach(collectWarnings)
    normalizedSuggested.forEach(collectWarnings)

    return Array.from(warnings)
  }, [normalizedSelected, normalizedSuggested])

  const defaultNoteRef = useRef(incomingNoteContent || getDefaultNoteContent(patientMetadata))
  const [noteContent, setNoteContent] = useState<string>(defaultNoteRef.current)
  const [beautifiedContent, setBeautifiedContent] = useState<string>(() =>
    buildBeautifiedContent(defaultNoteRef.current, patientMetadata, normalizedSelected, normalizedTranscript),
  )
  const [summaryContent, setSummaryContent] = useState<string>(() =>
    buildPatientSummary(defaultNoteRef.current, patientMetadata, normalizedSelected, normalizedTranscript),
  )
  const sanitizedInitialStep = Number.isFinite(initialStep) && initialStep >= 1 ? Math.floor(initialStep) : 1
  const [currentStep, setCurrentStep] = useState<number>(() => sanitizedInitialStep)
  const lastInitialStepRef = useRef<number>(sanitizedInitialStep)
  const [activeItemData, setActiveItemData] = useState<NormalizedWizardCodeItem | null>(null)
  const [isShowingEvidence, setIsShowingEvidence] = useState(false)
  const [patientQuestions, setPatientQuestions] = useState<WizardPatientQuestion[]>([])
  const [showPatientQuestions, setShowPatientQuestions] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null)
  const [finalizeStage, setFinalizeStage] = useState<"idle" | "processing" | "completed">("idle")
  const [composeProgress, setComposeProgress] = useState<WizardProgressStep[]>(() => createComposeProgressState())
  const [composeComplete, setComposeComplete] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [isComposeRunning, setIsComposeRunning] = useState(false)
  const [composeRetryKey, setComposeRetryKey] = useState(0)
  const composeRunRef = useRef(0)
  const [attestationSnapshot, setAttestationSnapshot] = useState<Record<string, unknown> | null>(() =>
    incomingAttestationRecap && typeof incomingAttestationRecap === "object"
      ? { ...(incomingAttestationRecap as Record<string, unknown>) }
      : null,
  )

  useEffect(() => {
    const nextInitial = Number.isFinite(initialStep) && initialStep >= 1 ? Math.floor(initialStep) : 1
    if (lastInitialStepRef.current !== nextInitial) {
      lastInitialStepRef.current = nextInitial
      setCurrentStep(nextInitial)
    }
  }, [initialStep])

  const composeJobState = composeJob ?? null
  const composeStatus = (composeJobState?.status ?? "").toLowerCase()
  const composeValidation = composeJobState?.validation ?? null
  const composeResult = composeJobState?.result ?? null

  useEffect(() => {
    if (!composeResult || typeof composeResult !== "object") {
      return
    }
    const beautified = typeof composeResult.beautifiedNote === "string" ? composeResult.beautifiedNote : undefined
    if (beautified && beautified !== beautifiedContent) {
      setBeautifiedContent(beautified)
    }
    const summary = typeof composeResult.patientSummary === "string" ? composeResult.patientSummary : undefined
    if (summary && summary !== summaryContent) {
      setSummaryContent(summary)
    }
  }, [beautifiedContent, composeResult, summaryContent])

  useEffect(() => {
    if (finalizeResult) {
      return
    }

    setFinalizeResult(null)
    setFinalizeError(null)
    setFinalizeStage("idle")
  }, [finalizeResult, normalizedSelected, normalizedSuggested, normalizedCompliance, noteContent])

  useEffect(() => {
    const nextDefault = incomingNoteContent || getDefaultNoteContent(patientMetadata)
    if (incomingNoteContent && incomingNoteContent !== noteContent) {
      setNoteContent(incomingNoteContent)
    } else if (!incomingNoteContent && noteContent === defaultNoteRef.current) {
      setNoteContent(nextDefault)
    }
    defaultNoteRef.current = nextDefault
  }, [incomingNoteContent, patientMetadata, noteContent])

  useEffect(() => {
    const artifacts = composeEnhancedArtifacts(noteContent, patientMetadata, normalizedSelected, normalizedTranscript)
    if (!composeResult || typeof composeResult !== "object") {
      setBeautifiedContent((prev) => (prev === artifacts.professionalNote ? prev : artifacts.professionalNote))
      setSummaryContent((prev) => (prev === artifacts.patientSummary ? prev : artifacts.patientSummary))
    }
  }, [composeResult, noteContent, patientMetadata, normalizedSelected, normalizedTranscript])

  useEffect(() => {
    if (incomingAttestationRecap && typeof incomingAttestationRecap === "object") {
      setAttestationSnapshot((prev) => {
        const next = incomingAttestationRecap as Record<string, unknown>
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) {
          return prev
        }
        return { ...next }
      })
    }
  }, [incomingAttestationRecap])

  useEffect(() => {
    if (!normalizedSelected.length && !normalizedSuggested.length && currentStep < 3) {
      setCurrentStep(3)
    }
  }, [currentStep, normalizedSelected.length, normalizedSuggested.length])

  const fallbackValidationOk = useMemo(
    () => performFinalValidation(noteContent, beautifiedContent, summaryContent),
    [noteContent, beautifiedContent, summaryContent],
  )

  const isComposeRunning =
    composeStatus === "queued" || composeStatus === "in_progress" || composeStatus === "in-progress"

  const composeBlocked =
    composeStatus === "failed" || composeStatus === "blocked" || composeValidation?.ok === false

  const composeErrorMessage = useMemo(() => {
    if (composeError) {
      return composeError
    }
    if (composeValidation && composeValidation.ok === false) {
      const issues = composeValidation.issues as Record<string, unknown> | undefined
      if (issues) {
        const messages = Object.values(issues)
          .flat()
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        if (messages.length) {
          return messages.join(" • ")
        }
      }
      return composeJobState?.message ?? "Validation identified blocking issues."
    }
    if (composeBlocked) {
      return composeJobState?.message ?? "AI enhancement was unable to complete. Please review and retry."
    }
    return null
  }, [composeBlocked, composeError, composeJobState?.message, composeValidation])

  let composeReady = false
  if (!composeJobState) {
    composeReady = fallbackValidationOk
  } else if (composeValidation?.ok === true) {
    composeReady = true
  } else if (composeValidation?.ok === false) {
    composeReady = false
  } else if (composeStatus === "completed") {
    composeReady = fallbackValidationOk
  }

  const composeProgress = useMemo<WizardProgressStep[]>(() => {
    if (Array.isArray(composeJobState?.steps) && composeJobState.steps.length) {
      return composeJobState.steps.map((step, index) => {
        const id = Number.isFinite(step?.id as number) ? Number(step?.id) : index + 1
        const stageKey = typeof step?.stage === "string" ? step.stage : ""
        const title =
          COMPOSE_STAGE_TITLE_MAP[stageKey] ?? COMPOSE_PROGRESS_SEQUENCE[index]?.title ?? `Stage ${id}`
        const rawStatus = typeof step?.status === "string" ? step.status.toLowerCase() : ""
        let status: WizardProgressStep["status"] = "pending"
        if (rawStatus === "completed") {
          status = "completed"
        } else if (rawStatus === "in_progress" || rawStatus === "in-progress") {
          status = "in-progress"
        } else if (rawStatus === "blocked" || rawStatus === "failed") {
          status = "blocked"
        }
        return { id, title, status }
      })
    }
    if (composeStatus === "completed") {
      return COMPOSE_PROGRESS_SEQUENCE.map((step) => ({ ...step, status: "completed" as const }))
    }
    if (composeBlocked) {
      return COMPOSE_PROGRESS_SEQUENCE.map((step, index) => ({
        ...step,
        status: index + 1 === COMPOSE_PROGRESS_SEQUENCE.length ? "blocked" : "completed",
      }))
    }
    if (isComposeRunning) {
      const stageKey = composeJobState?.stage
      const stageIndex = stageKey ? Object.keys(COMPOSE_STAGE_TITLE_MAP).indexOf(stageKey) + 1 : undefined
      return createComposeProgressState(stageIndex)
    }
    if (composeJobState) {
      return createComposeProgressState()
    }
    return createComposeProgressState(currentStep === 3 ? 1 : undefined)
  }, [composeBlocked, composeJobState, composeStatus, currentStep, isComposeRunning])

  const steps = useMemo<WizardStepData[]>(() => {
    const complianceDescription = formatComplianceSummary(normalizedCompliance.length)
    const outstandingBlocking = blockingIssues?.filter((issue) => typeof issue === "string" && issue.trim().length > 0) ?? []
    const finalizeDescription = finalizeStage === "processing"
      ? "Finalizing note and preparing export package..."
      : finalizeResult
        ? finalizeResult.exportReady
          ? "Note finalized and ready for export"
          : "Finalized with outstanding issues that need review"
        : !canFinalize
          ? "Resolve validation blockers before dispatching the note"
          : outstandingBlocking.length
            ? `Review ${outstandingBlocking.length} blocking issue${outstandingBlocking.length === 1 ? "" : "s"} before dispatch`
            : "Final confirmation and submission"

    const defaultStatusForStep = (stepId: number): StepStatus => {
      if (currentStep > stepId) {
        return "completed"
      }
      if (currentStep === stepId) {
        return "in-progress"
      }
      return "pending"
    }

    const baseSteps: WizardStepData[] = [
      {
        id: 1,
        title: "Code Review",
        description: "Review and validate your selected diagnostic codes",
        type: "selected-codes",
        stepType: "selected",
        totalSelected: normalizedSelected.length,
        totalSuggestions: normalizedSuggested.length,
        items: normalizedSelected,
        status: defaultStatusForStep(1),
      },
      {
        id: 2,
        title: "Suggestion Review",
        description: "Evaluate AI-recommended diagnostic codes",
        type: "suggested-codes",
        stepType: "suggested",
        totalSelected: normalizedSelected.length,
        totalSuggestions: normalizedSuggested.length,
        items: normalizedSuggested,
        status: defaultStatusForStep(2),
      },
      {
        id: 3,
        title: "Compose",
        description: "AI beautification and enhancement",
        type: "loading",
        progressSteps: composeProgress,
        status: composeErrorMessage
          ? "blocked"
          : composeReady
            ? "completed"
            : isComposeRunning
              ? "in-progress"
              : defaultStatusForStep(3),
      },
      {
        id: 4,
        title: "Compare & Edit",
        description: "Compare original draft with beautified version",
        type: "dual-editor",
        originalContent: noteContent,
        beautifiedContent,
        patientSummaryContent: summaryContent,
        status: defaultStatusForStep(4),
      },
      {
        id: 5,
        title: "Billing & Attest",
        description: complianceDescription,
        type: "attestation",
        status: defaultStatusForStep(5),
      },
      {
        id: 6,
        title: "Sign & Dispatch",
        description: finalizeDescription,
        type: "dispatch",
        status: defaultStatusForStep(6),
      },
    ]

    if (!overridesMap.size) {
      return baseSteps
    }

    return baseSteps.map((step) => {
      const override = overridesMap.get(step.id)
      return override ? { ...step, ...override } : step
    })
  }, [
    normalizedSelected,
    normalizedSuggested,
    normalizedCompliance.length,
    noteContent,
    beautifiedContent,
    summaryContent,
    overridesMap,
    isFinalizing,
    finalizeResult,
    canFinalize,
    blockingIssues,
    currentStep,
    composeProgress,
    composeReady,
    composeErrorMessage,
  ])

  useEffect(() => {
    if (!steps.length) return
    const hasCurrent = steps.some((step) => step.id === currentStep)
    if (!hasCurrent) {
      setCurrentStep(steps[0].id)
    }
  }, [steps, currentStep])

  const currentStepData = useMemo(() => steps.find((step) => step.id === currentStep) ?? steps[0], [steps, currentStep])

  const goToStep = useCallback(
    (stepId: number) => {
      if (!steps.length) return
      if (currentStep === 3) {
        if (isComposeRunning) {
          return
        }
        if (!composeReady && stepId !== 3) {
          return
        }
      }
      if (stepId === 6 && !canFinalize) {
        return
      }
      const fallback = steps[0]
      const target = steps.find((step) => step.id === stepId) || fallback
      setCurrentStep(target.id)
    },

    [steps, currentStep, isComposeRunning, composeComplete, canFinalize],
  )

  useEffect(() => {
    if (!currentStepData) return
    onStepChange?.(currentStepData.id, currentStepData)
  }, [currentStepData, onStepChange])

  const generatePatientQuestions = useCallback((stepsData: WizardStepData[]): WizardPatientQuestion[] => {
    const questions: WizardPatientQuestion[] = []
    const selectedStep = stepsData.find((step) => step.id === 1)
    selectedStep?.items?.forEach((item, itemIndex) => {
      item.gaps.forEach((gap, gapIndex) => {
        const idBase = item.id || itemIndex + 1
        const questionId = Number.isFinite(idBase) ? Number(`${idBase}${gapIndex}`) : Date.now() + gapIndex
        const lowerGap = gap.toLowerCase()
        const priority: WizardPatientQuestion["priority"] = lowerGap.includes("smok") ? "high" : lowerGap.includes("lab") || lowerGap.includes("lipid") ? "medium" : "medium"
        questions.push({
          id: Number.isFinite(questionId) ? questionId : itemIndex * 100 + gapIndex,
          question: gap.endsWith("?") ? gap : `Can you clarify: ${gap}?`,
          source: `Code Gap: ${item.title}`,
          priority,
          codeRelated: item.code || item.title,
          category: "clinical",
        })
      })
    })

    const suggestedStep = stepsData.find((step) => step.id === 2)
    suggestedStep?.items?.forEach((item, itemIndex) => {
      if (item.classifications.includes("prevention")) {
        const idBase = item.id || itemIndex + 1
        const questionId = Number.isFinite(idBase) ? Number(`${idBase}90`) : Date.now() + itemIndex
        questions.push({
          id: Number.isFinite(questionId) ? questionId : itemIndex * 200,
          question: `What preventive documentation supports ${item.title}?`,
          source: `Prevention Opportunity: ${item.title}`,
          priority: "low",
          codeRelated: item.code || item.title,
          category: "clinical",
        })
      }
    })

    return questions
  }, [])

  useEffect(() => {
    if (!steps.length) return
    if (currentStep === 1 || currentStep === 2) {
      setPatientQuestions(generatePatientQuestions(steps))
    }
  }, [currentStep, steps, generatePatientQuestions])

  const handleNoteChange = useCallback(
    (value: string) => {
      setNoteContent(value)
    },
    [],
  )

  const handleInsertTextToNote = useCallback(
    (text: string) => {
      if (!text) return
      let insertPosition = noteContent.length

      const lowerText = text.toLowerCase()
      if (lowerText.includes("smoking") || lowerText.includes("cigarette")) {
        const historyIndex = noteContent.indexOf("HISTORY OF PRESENT ILLNESS:")
        if (historyIndex !== -1) {
          const sectionEnd = noteContent.indexOf("\n\n", historyIndex)
          insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length
        }
      } else if (lowerText.includes("weight") || lowerText.includes("bmi")) {
        const examIndex = noteContent.indexOf("PHYSICAL EXAMINATION:")
        if (examIndex !== -1) {
          const sectionEnd = noteContent.indexOf("\n\n", examIndex)
          insertPosition = sectionEnd !== -1 ? sectionEnd : noteContent.length
        }
      } else if (lowerText.includes("family history")) {
        const assessmentIndex = noteContent.indexOf("ASSESSMENT:")
        if (assessmentIndex !== -1) {
          insertPosition = assessmentIndex
        }
      }

      const formattedText = `\n\nADDITIONAL INFORMATION:\n${text}`
      const newContent = noteContent.slice(0, insertPosition) + formattedText + noteContent.slice(insertPosition)
      handleNoteChange(newContent)
    },
    [noteContent, handleNoteChange],
  )

  const highlightRanges = useMemo(() => {
    if (!activeItemData || !noteContent || !isShowingEvidence) return []

    const evidenceTexts = Array.isArray(activeItemData.evidence) ? activeItemData.evidence : []

    return evidenceTexts.reduce<
      Array<{
        start: number
        end: number
        className: string
        label: string
        text: string
      }>
    >((acc, evidenceText, index) => {
      const startIndex = noteContent.toLowerCase().indexOf(evidenceText.toLowerCase())
      if (startIndex !== -1) {
        acc.push({
          start: startIndex,
          end: startIndex + evidenceText.length,
          className: index % 3 === 0 ? "highlight-blue" : index % 3 === 1 ? "highlight-emerald" : "highlight-amber",
          label: `Evidence ${index + 1}`,
          text: evidenceText,
        })
      }
      return acc
    }, [])
  }, [activeItemData, noteContent, isShowingEvidence])

  const buildFinalizeRequest = useCallback((): FinalizeRequest => {
    const codes = new Set<string>()
    const prevention = new Set<string>()
    const diagnoses = new Set<string>()
    const differentials = new Set<string>()
    const complianceSet = new Set<string>()

    const assignCodes = (item: NormalizedWizardCodeItem) => {
      const identifier = item.code || item.title
      if (!identifier) return
      if (!item.classifications.length) {
        if (item.codeType === "CPT") {
          codes.add(identifier)
        } else {
          diagnoses.add(identifier)
        }
        return
      }

      item.classifications.forEach((classification) => {
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

    normalizedSelected.forEach(assignCodes)
    normalizedSuggested.forEach(assignCodes)
    normalizedCompliance.forEach((item) => {
      const identifier = item.code || item.title
      if (identifier) {
        complianceSet.add(identifier)
      }
    })

    return {
      content: noteContent,
      codes: Array.from(codes),
      prevention: Array.from(prevention),
      diagnoses: Array.from(diagnoses),
      differentials: Array.from(differentials),
      compliance: Array.from(complianceSet),
      patient: patientMetadata,
    }
  }, [noteContent, normalizedSelected, normalizedSuggested, normalizedCompliance, patientMetadata])

  const buildDispatchForm = useCallback((): Record<string, unknown> => {
    const timestamp = new Date().toISOString()
    return {
      destination: "ehr",
      deliveryMethod: "internal",
      timestamp,
      final_review: {
        all_steps_completed: true,
        physician_final_approval: true,
        quality_review_passed: true,
        compliance_verified: true,
        ready_for_dispatch: true,
      },
      dispatch_options: {
        send_to_emr: true,
        generate_patient_summary: true,
        schedule_followup: false,
        send_to_billing: true,
        notify_referrals: false,
      },
      dispatch_status: {
        dispatch_initiated: true,
        dispatch_completed: false,
        dispatch_timestamp: timestamp,
      },
      post_dispatch_actions: [],
    }
  }, [])
  const handleAttestationSubmit = useCallback(
    async (form: AttestationFormPayload) => {
      const payload: AttestationFormPayload = {
        attestedBy: form.attestedBy.trim(),
        statement: form.statement.trim(),
        ipAddress: form.ipAddress?.trim() || undefined,
        signature: form.signature?.trim() || undefined,
      }

      if (!payload.attestedBy || !payload.statement) {
        throw new Error("Attestation requires name and statement")
      }

      const result = await Promise.resolve(onSubmitAttestation?.(payload))

      if (result && result.attestation && typeof result.attestation === "object") {
        setAttestationSnapshot({ ...(result.attestation as Record<string, unknown>) })
      } else if (!onSubmitAttestation) {
        setAttestationSnapshot({
          attestation: {
            attestedBy: payload.attestedBy,
            attestationText: payload.statement,
          },
          billingValidation: {
            estimatedReimbursement: reimbursementSummary?.total,
          },
        })
      }

      return result
    },
    [onSubmitAttestation, reimbursementSummary?.total],
  )

  const handleFinalize = useCallback(async () => {
    const request = buildFinalizeRequest()
    const dispatchPayload = buildDispatchForm()
    setIsFinalizing(true)
    setFinalizeError(null)
    setFinalizeStage("processing")
    try {
      if (onFinalizeAndDispatch) {
        const response = await Promise.resolve(onFinalizeAndDispatch(request, dispatchPayload))
        if (response && typeof response === "object" && "result" in response && response.result) {
          setFinalizeResult(response.result)
        } else if (!finalizeResult) {
          setFinalizeResult({
            finalizedContent: request.content.trim(),
            codesSummary: request.codes.map((code) => ({ code })),
            reimbursementSummary: {
              total: reimbursementSummary?.total ?? 0,
              codes: reimbursementSummary?.codes ?? [],
            },
            exportReady: true,
            issues: {},
          })
        }
      } else {
        const result = await Promise.resolve(onFinalize?.(request))
        if (result) {
          setFinalizeResult(result)
        } else {
          setFinalizeResult({
            finalizedContent: request.content.trim(),
            codesSummary: request.codes.map((code) => ({ code })),
            reimbursementSummary: { total: 0, codes: [] },
            exportReady: true,
            issues: {},
          })
        }
      }
      setFinalizeStage("completed")
    } catch (error) {
      setFinalizeError(error instanceof Error ? error.message : "Failed to finalize note. Please try again.")
      setFinalizeStage("idle")
    } finally {
      setIsFinalizing(false)
    }
  }, [
    buildDispatchForm,
    buildFinalizeRequest,
    finalizeResult,
    onFinalize,
    onFinalizeAndDispatch,
    reimbursementSummary?.codes,
    reimbursementSummary?.total,
  ])

  const finalizeDisabled = isFinalizing || !canFinalize

  const dispatchButtonLabel = isFinalizing
    ? "Finalizing & Dispatching..."
    : finalizeResult
      ? "Dispatch Finalized Note"
      : "Finalize & Dispatch"

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden relative">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.8 }}
        style={{
          background: "linear-gradient(135deg, #fdfdff 0%, #fcfcff 25%, #fafaff 50%, #f9f9ff 75%, #fdfdff 100%)",
        }}
      />
      <motion.div className="relative z-10 h-full flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <motion.div
          className="border-b border-white/20 shadow-sm relative"
          style={{
            background: "linear-gradient(135deg, #fefefe 0%, #fdfdfd 50%, #fcfcfc 100%)",
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
        >
          <ProgressIndicator steps={steps} currentStep={currentStepData?.id ?? 1} onStepClick={goToStep} />
          {onClose && (
            <button
              type="button"
              onClick={() => onClose(finalizeResult ?? undefined)}
              className="absolute top-6 right-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            >
              <X size={16} />
              Close
            </button>
          )}
        </motion.div>

        <motion.div className="flex-1 flex overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}>
          {currentStepData?.type === "loading" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)",
              }}
            >
              <div className="text-center max-w-md">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                    <Settings size={32} className="text-white" />
                  </motion.div>
                </div>
                <h2 className="text-xl font-semibold text-slate-800 mb-2">
                  {composeErrorMessage
                    ? "Enhancement Paused"
                    : composeReady
                      ? "Enhancement Ready"
                      : "AI Enhancement in Progress"}
                </h2>
                <p className="text-slate-600 mb-8">
                  {composeErrorMessage
                    ? "We ran into a validation issue. Review the details below to retry the enhancement."
                    : composeReady
                      ? "All steps are complete. Review the enhancements, then continue to compare and edit."
                      : "Analyzing your draft, transcripts, and codes to produce polished documentation."}
                </p>

                <div className="space-y-4">
                  {currentStepData.progressSteps?.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.2 }}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        step.status === "completed"
                          ? "bg-emerald-50 border border-emerald-200"
                          : step.status === "in-progress"
                            ? "bg-blue-50 border border-blue-200"
                            : step.status === "blocked"
                              ? "bg-red-50 border border-red-200"
                              : "bg-slate-50 border border-slate-200"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          step.status === "completed" ? "bg-emerald-500" : step.status === "in-progress" ? "bg-blue-500" : "bg-slate-300"
                        }`}
                      >
                        {step.status === "completed" ? (
                          <Check size={14} className="text-white" />
                        ) : step.status === "in-progress" ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                          />
                        ) : step.status === "blocked" ? (
                          <AlertTriangle size={14} className="text-red-600" />
                        ) : (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                      <span className={`font-medium ${step.status === "completed" ? "text-emerald-700" : step.status === "in-progress" ? "text-blue-700" : "text-slate-600"}`}>{step.title}</span>
                    </motion.div>
                  ))}
                </div>

                {isComposeRunning && !composeErrorMessage && (
                  <div className="mt-6 flex items-center justify-center gap-2 text-blue-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">Working with the latest note, transcript, and selected codes…</span>
                  </div>
                )}

                {composeErrorMessage && (
                  <div className="mt-6 space-y-3">
                    <p className="text-sm text-red-600">{composeErrorMessage}</p>
                    <motion.button
                      type="button"
                      onClick={() => onRequestCompose?.({ force: true })}
                      disabled={isComposeRunning}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      whileHover={isComposeRunning ? undefined : { scale: 1.03 }}
                      whileTap={isComposeRunning ? undefined : { scale: 0.97 }}
                    >
                      Retry Enhancement
                    </motion.button>
                  </div>
                )}

                {composeReady && !composeErrorMessage && (
                  <p className="mt-6 text-sm font-medium text-emerald-600">
                    Enhancement complete. Final review passed and your comparison is ready.
                  </p>
                )}

                <motion.button
                  onClick={() => {
                    if (!composeReady || isComposeRunning || composeErrorMessage) {
                      return
                    }
                    goToStep(4)
                  }}
                  disabled={!composeReady || isComposeRunning || Boolean(composeErrorMessage)}
                  className={`mt-8 px-6 py-3 rounded-lg font-medium text-white transition-all ${
                    !composeReady || isComposeRunning || composeErrorMessage
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  }`}
                  whileHover={
                    !composeReady || isComposeRunning || composeErrorMessage ? undefined : { scale: 1.05 }
                  }
                  whileTap={
                    !composeReady || isComposeRunning || composeErrorMessage ? undefined : { scale: 0.95 }
                  }
                >
                  Continue to Compare & Edit
                </motion.button>
              </div>
            </motion.div>
          ) : currentStepData?.type === "dual-editor" ? (
            <DualRichTextEditor
              originalContent={currentStepData.originalContent || ""}
              aiEnhancedContent={currentStepData.beautifiedContent || ""}
              patientSummaryContent={currentStepData.patientSummaryContent || ""}
              patientMetadata={patientMetadata}
              transcriptEntries={normalizedTranscript}
              selectedCodes={normalizedSelected}
              suggestedCodes={normalizedSuggested}
              reimbursementSummary={reimbursementSummary}
              onAcceptAllChanges={() => {
                handleNoteChange(beautifiedContent)
              }}
              onReBeautify={() => {
                if (onRequestCompose) {
                  onRequestCompose({ force: true })
                  return
                }
                const refreshed = composeEnhancedArtifacts(
                  noteContent,
                  patientMetadata,
                  normalizedSelected,
                  normalizedTranscript,
                )
                setBeautifiedContent(refreshed.professionalNote)
                setSummaryContent(refreshed.patientSummary)
              }}
              onContentChange={(content, version) => {
                if (version === "original") {
                  handleNoteChange(content)
                } else if (version === "enhanced") {
                  setBeautifiedContent(content)
                } else {
                  setSummaryContent(content)
                }
              }}
              onNavigateNext={() => {
                goToStep(5)
              }}
              onNavigatePrevious={() => {
                goToStep(3)
              }}
            />
          ) : currentStepData?.type === "attestation" ? (
            <BillingAttestationStep
              step={currentStepData}
              reimbursementSummary={reimbursementSummary}
              blockingIssues={blockingIssues ?? []}
              warnings={payerWarnings}
              attestation={attestationSnapshot}
              onSubmit={handleAttestationSubmit}
              onPrevious={() => goToStep(4)}
              onNext={() => goToStep(6)}
              canFinalize={canFinalize}
            />
          ) : currentStepData?.type === "placeholder" || currentStepData?.type === "dispatch" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)",
              }}
            >
              <div className="text-center max-w-md space-y-6">
                <div className="w-24 h-24 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-2xl font-bold">
                  {currentStepData.id}
                </div>

                <div className="space-y-3">
                  <h2 className="text-xl font-semibold text-slate-800">{currentStepData.title}</h2>
                  <p className="text-slate-600">{currentStepData.description}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
                  {currentStepData.type === "dispatch" ? (
                    <>
                      {isFinalizing ? (
                        <div className="flex items-center justify-center gap-3 text-slate-600">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Finalizing note...</span>
                        </div>
                      ) : finalizeError ? (
                        <p className="text-sm text-red-600">{finalizeError}</p>
                      ) : finalizeResult ? (
                        <div className="text-left space-y-2">
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Status:</span> {finalizeResult.exportReady ? "Ready for export" : "Review outstanding issues"}
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Codes Finalized:</span> {finalizeResult.codesSummary?.length ?? 0}
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Estimated Reimbursement:</span> ${(finalizeResult.reimbursementSummary?.total ?? 0).toFixed(2)}
                          </p>
                          {finalizeResult.exportReady && <p className="text-sm font-semibold text-emerald-600">Step completed • 100%</p>}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">This step is under construction.</p>
                      )}
                    </>
                  ) : normalizedCompliance.length ? (
                    <div className="space-y-2 text-left">
                      <p className="text-sm text-slate-600">Outstanding compliance items:</p>
                      <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                        {normalizedCompliance.slice(0, 5).map((item) => (
                          <li key={item.id}>{item.title}</li>
                        ))}
                        {normalizedCompliance.length > 5 && <li className="italic text-slate-500">+{normalizedCompliance.length - 5} more</li>}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">This step is under construction.</p>
                  )}
                </div>

                <div className="flex justify-center gap-4">
                  <motion.button
                    onClick={() => goToStep(Math.max(currentStepData.id - 1, 1))}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-all disabled:opacity-60"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={currentStepData.id <= 1 || isFinalizing}
                  >
                    Back
                  </motion.button>

                  {currentStepData.type === "dispatch" ? (
                    <div className="flex flex-col items-center">
                      <motion.button
                        onClick={handleFinalize}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={finalizeDisabled}
                      >
                        {dispatchButtonLabel}
                      </motion.button>
                      {!canFinalize && <p className="mt-2 text-sm text-red-600 text-center">Complete validation requirements before finalizing.</p>}
                    </div>
                  ) : (
                    <motion.button
                      onClick={() => goToStep(currentStepData.id + 1)}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={currentStepData.id >= steps.length}
                    >
                      Next
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
                className="w-1/2 bg-white border-r border-slate-200/50 shadow-sm"
              >
                <NoteEditor
                  content={noteContent}
                  onChange={handleNoteChange}
                  highlightRanges={highlightRanges}
                  disabled={isShowingEvidence}
                  questionsCount={currentStepData?.id === 1 || currentStepData?.id === 2 ? patientQuestions.length : 0}
                  onShowQuestions={() => setShowPatientQuestions(true)}
                  onInsertText={handleInsertTextToNote}
                />
              </motion.div>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
                className="w-1/2 relative overflow-hidden flex flex-col bg-white"
              >
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 1.0 }}
                  style={{
                    background:
                      activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0
                        ? "linear-gradient(135deg, #fffef9 0%, #fffcf5 25%, #fffaf0 50%, #fef9ec 75%, #fffef9 100%)"
                        : "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)",
                  }}
                >
                  <motion.div
                    className="absolute inset-0"
                    animate={{
                      background:
                        activeItemData && activeItemData.gaps && activeItemData.gaps.length > 0
                          ? [
                              "radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)",
                              "radial-gradient(circle at 60% 40%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)",
                              "radial-gradient(circle at 45% 60%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)",
                              "radial-gradient(circle at 70% 30%, rgba(161, 98, 7, 0.1) 0%, transparent 50%)",
                              "radial-gradient(circle at 50% 80%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)",
                              "radial-gradient(circle at 30% 70%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)",
                              "radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)",
                            ]
                          : [
                              "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)",
                              "radial-gradient(circle at 60% 40%, rgba(79, 70, 229, 0.06) 0%, transparent 50%)",
                              "radial-gradient(circle at 40% 60%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
                              "radial-gradient(circle at 70% 30%, rgba(147, 51, 234, 0.06) 0%, transparent 50%)",
                              "radial-gradient(circle at 50% 80%, rgba(126, 34, 206, 0.04) 0%, transparent 50%)",
                              "radial-gradient(circle at 25% 45%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
                              "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)",
                            ],
                      backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
                    }}
                    transition={{
                      background: {
                        duration: 14,
                        repeat: Infinity,
                        ease: "easeInOut",
                        times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1],
                      },
                      backgroundPosition: {
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear",
                      },
                    }}
                    style={{
                      backgroundSize: "300% 300%",
                    }}
                  />
                </motion.div>

                <motion.div className="relative z-20 flex-1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}>
                  <AnimatePresence mode="wait">
                    {currentStepData && (
                      <StepContent
                        key={currentStepData.id}
                        step={currentStepData}
                        onNext={() => goToStep(currentStepData.id + 1)}
                        onPrevious={() => goToStep(currentStepData.id - 1)}
                        onActiveItemChange={(item) => setActiveItemData(item as unknown as NormalizedWizardCodeItem)}
                        onShowEvidence={setIsShowingEvidence}
                        patientQuestions={patientQuestions}
                        onUpdatePatientQuestions={setPatientQuestions}
                        showPatientTray={showPatientQuestions}
                        onShowPatientTray={setShowPatientQuestions}
                        onInsertToNote={handleInsertTextToNote}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}

export const WorkflowWizard = FinalizationWizard
