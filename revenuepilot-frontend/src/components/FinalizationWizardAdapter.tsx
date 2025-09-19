import { useCallback, useEffect, useMemo, useState } from "react"

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
  stepOverrides,
  noteId,
  fetchWithAuth,
  onPreFinalizeResult,
  onError
}: FinalizationWizardAdapterProps) {
  const [sessionData, setSessionData] = useState<WorkflowSessionResponsePayload | null>(null)

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

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false
    const initialise = async () => {
      const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
      const payload: Record<string, unknown> = {
        encounterId,
        patientId: typeof patientInfo?.patientId === "string" ? patientInfo.patientId.trim() : sessionData?.patientId ?? null,
        noteId: trimmedNoteId || sessionData?.noteId || undefined,
        noteContent: noteContent ?? sessionData?.noteContent ?? "",
        selectedCodes: Array.isArray(selectedCodesList) ? selectedCodesList : [],
        complianceIssues: Array.isArray(complianceIssues) ? complianceIssues : [],
        patientMetadata: { ...patientMetadataPayload }
      }

      if (sessionData?.sessionId) {
        payload.sessionId = sessionData.sessionId
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
  }, [
    complianceIssues,
    encounterId,
    fetchWithAuth,
    isOpen,
    noteContent,
    noteId,
    onError,
    patientInfo?.patientId,
    patientMetadataPayload,
    selectedCodesList,
    sessionData?.sessionId
  ])

  const selectedWizardCodes = useMemo(
    () =>
      toWizardCodeItems(
        Array.isArray(sessionData?.selectedCodes) && sessionData.selectedCodes.length > 0
          ? sessionData.selectedCodes
          : Array.isArray(selectedCodesList)
            ? selectedCodesList
            : []
      ),
    [selectedCodesList, sessionData?.selectedCodes]
  )

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

      const trimmedNoteId = typeof noteId === "string" ? noteId.trim() : ""
      const payloadWithContext: FinalizeRequestWithContext = trimmedNoteId
        ? { ...request, noteId: trimmedNoteId }
        : request

      const providerName =
        sessionData?.patientMetadata && typeof sessionData.patientMetadata === "object" &&
        typeof (sessionData.patientMetadata as Record<string, unknown>).providerName === "string"
          ? ((sessionData.patientMetadata as Record<string, unknown>).providerName as string)
          : undefined

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

      try {
        const attestResponse = await fetchWithAuth(`/api/v1/workflow/${encodeURIComponent(activeSessionId)}/step5/attest`, {
          method: "POST",
          json: true,
          body: JSON.stringify({
            encounterId,
            sessionId: activeSessionId,
            attestedBy: providerName ?? undefined,
            statement: "Attestation confirmed via finalization wizard"
          })
        })

        if (!attestResponse.ok) {
          throw new Error(`Attestation failed (${attestResponse.status})`)
        }

        const attestData = (await attestResponse.json()) as WorkflowAttestationResponsePayload
        setSessionData(attestData.session)

        const dispatchResponse = await fetchWithAuth(`/api/v1/workflow/${encodeURIComponent(activeSessionId)}/step6/dispatch`, {
          method: "POST",
          json: true,
          body: JSON.stringify({
            encounterId,
            sessionId: activeSessionId,
            destination: "ehr",
            deliveryMethod: "wizard"
          })
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
      sessionData?.patientMetadata,
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
          suggestedCodes={[]}
          complianceItems={complianceWizardItems}
          noteContent={sessionData?.noteContent ?? noteContent ?? ""}
          patientMetadata={patientMetadata}
          stepOverrides={mergedStepOverrides.length > 0 ? mergedStepOverrides : stepOverrides}
          onFinalize={handleFinalize}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
