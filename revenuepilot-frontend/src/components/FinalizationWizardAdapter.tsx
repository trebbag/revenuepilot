import { useCallback, useMemo } from "react"

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
  init?: (RequestInit & { json?: boolean }) | undefined
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

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

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
      code: code,
      title: description ?? code ?? `Code ${index + 1}`,
      description: description,
      details: rationale,
      status: "confirmed",
      codeType: type ?? (classification === "code" ? "CPT" : "ICD-10"),
      classification,
      category,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
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
  stepOverrides,
  noteId,
  fetchWithAuth,
  onPreFinalizeResult,
  onError
}: FinalizationWizardAdapterProps) {
  const selectedWizardCodes = useMemo(
    () => toWizardCodeItems(Array.isArray(selectedCodesList) ? selectedCodesList : []),
    [selectedCodesList]
  )

  const complianceWizardItems = useMemo(
    () => toWizardComplianceItems(Array.isArray(complianceIssues) ? complianceIssues : []),
    [complianceIssues]
  )

  const patientMetadata = useMemo(() => toPatientMetadata(patientInfo), [patientInfo])

  const handleFinalize = useCallback(
    async (request: FinalizeRequest): Promise<FinalizeResult> => {
      const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
      const payloadWithContext: FinalizeRequestWithContext = trimmedNoteId
        ? { ...request, noteId: trimmedNoteId }
        : request

      try {
        const response = await fetchWithAuth("/api/notes/pre-finalize-check", {
          method: "POST",
          body: JSON.stringify(payloadWithContext),
          json: true
        })

        if (!response.ok) {
          throw new Error(`Pre-finalization check failed (${response.status})`)
        }

        const data = (await response.json()) as PreFinalizeCheckResponse
        onPreFinalizeResult?.(data)

        if (!data?.canFinalize) {
          const issueMessages: string[] = []
          if (data?.issues && typeof data.issues === "object") {
            for (const value of Object.values(data.issues)) {
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
            : "Unable to validate the note before finalization."
        onError?.(message, error)
        throw error
      }

      try {
        const response = await fetchWithAuth("/api/notes/finalize", {
          method: "POST",
          body: JSON.stringify(payloadWithContext),
          json: true
        })

        if (!response.ok) {
          let errorMessage = `Finalization failed (${response.status})`
          try {
            const errorBody = await response.json()
            if (typeof errorBody?.detail === "string" && errorBody.detail.trim().length > 0) {
              errorMessage = errorBody.detail
            }
          } catch {
            // Ignore JSON parse errors and fall back to the default message
          }
          throw new Error(errorMessage)
        }

        const data = (await response.json()) as FinalizeResult
        return data
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to finalize the note."
        onError?.(message, error)
        throw error
      }
    },
    [fetchWithAuth, noteId, onError, onPreFinalizeResult]
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
          suggestedCodes={[]}
          complianceItems={complianceWizardItems}
          noteContent={noteContent ?? ""}
          patientMetadata={patientMetadata}
          stepOverrides={stepOverrides}
          onFinalize={handleFinalize}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
