import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  FinalizationWizard,
  type FinalizeRequest,
  type FinalizeResult,
  type PatientMetadata,
  type WizardCodeItem,
  type WizardComplianceItem,
  type WizardStepOverride
} from "../features/finalization"
import { useSession } from "../contexts/SessionContext"
import type {
  PreFinalizeCheckResponse,
  StoredFinalizationSession,
  WorkflowSessionResponsePayload
} from "../features/finalization/workflowTypes"

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
}

export type FinalizationWizardLaunchOptions = Omit<
  FinalizationWizardAdapterProps,
  "isOpen" | "onClose"
> & {
  onClose?: FinalizationWizardAdapterProps["onClose"]
}

type CodeCategory = "codes" | "prevention" | "diagnoses" | "differentials"

const CODE_CLASSIFICATION_MAP: Record<CodeCategory, string> = {
  codes: "code",
  prevention: "prevention",
  diagnoses: "diagnosis",
  differentials: "differential"
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
    classification.forEach(entry => register(entry))
  } else {
    register(classification)
  }

  register(item.category)
  register(item.codeType)
  register((item as { type?: unknown }).type)

  if (Array.isArray(item.tags)) {
    item.tags.forEach(tag => register(tag))
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
  info: "low"
}

const ensureStringArray = (value: unknown, fallback: string[]): string[] => {
  if (Array.isArray(value)) {
    const sanitized = value
      .map(entry => (typeof entry === "string" ? entry.trim() : ""))
      .filter(item => item.length > 0)
    return sanitized.length ? Array.from(new Set(sanitized)) : fallback
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : fallback
  }
  return fallback
}

const toFinalizeRequestPayload = (request: FinalizeRequest, fallback: FinalizeRequest) => ({
  content:
    typeof request.content === "string" && request.content.trim().length > 0
      ? request.content
      : fallback.content,
  codes: ensureStringArray(request.codes, fallback.codes),
  prevention: ensureStringArray(request.prevention, fallback.prevention),
  diagnoses: ensureStringArray(request.diagnoses, fallback.diagnoses),
  differentials: ensureStringArray(request.differentials, fallback.differentials),
  compliance: ensureStringArray(request.compliance, fallback.compliance)
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
  onError,
  displayMode = "overlay",
  initialPreFinalizeResult = null
}: FinalizationWizardAdapterProps) {
  const { state: sessionState, actions: sessionActions } = useSession()
  const [sessionData, setSessionData] = useState<WorkflowSessionResponsePayload | null>(null)
  const sessionDataRef = useRef<WorkflowSessionResponsePayload | null>(null)
  const [wizardSuggestions, setWizardSuggestions] = useState<WizardCodeItem[]>([])
  const [preFinalizeResult, setPreFinalizeResult] = useState<PreFinalizeCheckResponse | null>(
    initialPreFinalizeResult
  )
  const preFinalizeResultRef = useRef<PreFinalizeCheckResponse | null>(initialPreFinalizeResult)
  const preFinalizeFingerprintRef = useRef<string | null>(null)

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

  const storedSession = useMemo<StoredFinalizationSession | null>(() => {
    const sessions = sessionState.finalizationSessions
    if (!sessions) {
      return null
    }
    if (sessionData?.sessionId && sessions[sessionData.sessionId]) {
      return sessions[sessionData.sessionId]
    }
    const normalizedEncounter = encounterId?.toLowerCase()
    const match = Object.values(sessions).find(entry => {
      if (!entry || typeof entry !== "object") {
        return false
      }
      const encounter = sanitizeString((entry as StoredFinalizationSession).encounterId)?.toLowerCase()
      return encounter && normalizedEncounter && encounter === normalizedEncounter
    })
    return (match as StoredFinalizationSession | undefined) ?? null
  }, [encounterId, sessionData?.sessionId, sessionState.finalizationSessions])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (!storedSession) {
      return
    }
    setSessionData(prev => (prev ? prev : storedSession))
  }, [isOpen, storedSession])

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

  const persistSession = useCallback(
    (
      session: WorkflowSessionResponsePayload | null | undefined,
      extras?: Partial<StoredFinalizationSession>
    ) => {
      const base = session ?? sessionDataRef.current
      if (!base?.sessionId) {
        return
      }
      const snapshot: StoredFinalizationSession = {
        ...(sessionState.finalizationSessions?.[base.sessionId] ?? {}),
        ...base,
        transcriptEntries: sanitizedTranscripts,
        ...(extras ?? {})
      }
      sessionActions.storeFinalizationSession(base.sessionId, snapshot)
    },
    [sanitizedTranscripts, sessionActions, sessionState.finalizationSessions]
  )

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
          persistSession(data, {
            lastPreFinalize: preFinalizeResultRef.current ?? undefined
          })
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

  const finalizeRequestSnapshot = useMemo<FinalizeRequest>(() => {
    const contentSource =
      typeof sessionData?.noteContent === "string" && sessionData.noteContent.trim().length > 0
        ? sessionData.noteContent
        : typeof noteContent === "string"
          ? noteContent
          : ""

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
      classifications.forEach(classification => {
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
    complianceWizardItems.forEach(item => {
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
      patient: patientMetadata
    }
  }, [
    complianceWizardItems,
    noteContent,
    patientMetadata,
    selectedWizardCodes,
    sessionData?.noteContent,
    wizardSuggestions
  ])

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
      compliance: finalizeRequestSnapshot.compliance
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
            compliance: finalizeRequestSnapshot.compliance
          }
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
        setSessionData(prev => (prev ? { ...prev, lastValidation: data } : prev))
        persistSession(sessionDataRef.current, { lastPreFinalize: data })
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to validate the note before finalization."
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
  }, [
    finalizeRequestSnapshot,
    fetchWithAuth,
    isOpen,
    onError,
    onPreFinalizeResult,
    persistSession
  ])

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
      const payload = toFinalizeRequestPayload(request, finalizeRequestSnapshot)

      try {
        const response = await fetchWithAuth("/api/notes/finalize", {
          method: "POST",
          jsonBody: payload
        })

        if (!response.ok) {
          throw new Error(`Finalization failed (${response.status})`)
        }

        const data = (await response.json()) as FinalizeResult & PreFinalizeCheckResponse
        setPreFinalizeResult(data)
        onPreFinalizeResult?.(data)
        setSessionData(prev => (prev ? { ...prev, lastValidation: data } : prev))
        persistSession(sessionDataRef.current, {
          lastPreFinalize: data,
          lastFinalizeResult: data
        })
        return data
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to finalize the note."
        onError?.(message, error)
        throw error
      }
    },
    [
      fetchWithAuth,
      finalizeRequestSnapshot,
      onError,
      onPreFinalizeResult,
      persistSession
    ]
  )

  const handleWizardStepChange = useCallback(
    (stepId: number) => {
      setSessionData(prev => {
        if (!prev) {
          return prev
        }
        const updated: WorkflowSessionResponsePayload = { ...prev, currentStep: stepId }
        persistSession(updated)
        return updated
      })
    },
    [persistSession]
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

  const wizard = (
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
      onStepChange={handleWizardStepChange}
      onClose={handleClose}
    />
  )

  if (displayMode === "embedded") {
    return <div className="flex h-full w-full flex-col overflow-hidden">{wizard}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onClose()}
      />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">{wizard}</div>
    </div>
  )
}
