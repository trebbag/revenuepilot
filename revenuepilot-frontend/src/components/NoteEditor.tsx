import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Badge } from "./ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import {
  CheckCircle,
  Save,
  Play,
  Square,
  Clock,
  Mic,
  MicOff,
  AlertTriangle,
  Loader2
} from "lucide-react"
import { toast } from "sonner"
import { RichTextEditor } from "./RichTextEditor"
import { BeautifiedView } from "./BeautifiedView"
import {
  FinalizationWizardAdapter,
  type PreFinalizeCheckResponse
} from "./FinalizationWizardAdapter"
import type { FinalizeResult } from "finalization-wizard"
import { apiFetch, apiFetchJson, getStoredToken, resolveWebsocketUrl, type ApiFetchOptions } from "../lib/api"
import { useAuth } from "../contexts/AuthContext"

interface ComplianceIssue {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  category: 'documentation' | 'coding' | 'billing' | 'quality'
  details: string
  suggestion: string
  learnMoreUrl?: string
  dismissed?: boolean
}

interface PatientSuggestion {
  patientId: string
  name?: string
  firstName?: string
  lastName?: string
  dob?: string
  mrn?: string
  age?: number
  gender?: string
  insurance?: string
  lastVisit?: string
  allergies?: string[]
  medications?: string[]
  source: 'local' | 'external'
}

interface PatientDetailsResponse {
  demographics?: {
    patientId?: string | number | null
    mrn?: string | null
    name?: string | null
    firstName?: string | null
    lastName?: string | null
    dob?: string | null
    age?: number | null
    gender?: string | null
    insurance?: string | null
    lastVisit?: string | null
  }
  allergies?: unknown
  medications?: unknown
  encounters?: unknown
}

interface EncounterValidationState {
  status: 'idle' | 'loading' | 'valid' | 'invalid'
  message?: string
  encounter?: {
    encounterId?: number
    patientId?: string | number
    date?: string
    type?: string
    provider?: string
    description?: string
    patient?: Record<string, unknown>
  }
}

interface TranscriptEntry {
  id: string
  text: string
  confidence: number
  isInterim: boolean
  timestamp: number
  speaker?: string
}

const severityFromText = (text: string): ComplianceIssue["severity"] => {
  const lower = text.toLowerCase()
  if (lower.includes("critical") || lower.includes("violation") || lower.includes("missing")) {
    return "critical"
  }
  if (lower.includes("warning") || lower.includes("should") || lower.includes("insufficient")) {
    return "warning"
  }
  return "info"
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

interface NoteEditorProps {
  prePopulatedPatient?: {
    patientId: string
    encounterId: string
  } | null
  selectedCodes?: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  selectedCodesList?: any[]
  onNoteContentChange?: (content: string) => void
  onNavigateToDrafts?: () => void
  testOverrides?: {
    initialRecordedSeconds?: number
  }
}

export function NoteEditor({
  prePopulatedPatient,
  selectedCodes = { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
  selectedCodesList = [],
  onNoteContentChange,
  onNavigateToDrafts,
  testOverrides
}: NoteEditorProps) {
  const auth = useAuth()
  const [patientInputValue, setPatientInputValue] = useState(prePopulatedPatient?.patientId || "")
  const [patientId, setPatientId] = useState(prePopulatedPatient?.patientId || "")
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null)
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false)
  const [patientDetails, setPatientDetails] = useState<PatientDetailsResponse | null>(null)

  const [encounterId, setEncounterId] = useState(prePopulatedPatient?.encounterId || "")
  const [encounterValidation, setEncounterValidation] = useState<EncounterValidationState>({
    status: prePopulatedPatient?.encounterId ? 'loading' : 'idle'
  })

  const specialty = useMemo(() => {
    const userSpecialty = typeof auth.user?.specialty === "string" ? auth.user.specialty.trim() : ""
    if (userSpecialty) {
      return userSpecialty
    }
    const encounterType = encounterValidation.encounter?.type
    if (typeof encounterType === "string" && encounterType.trim().length > 0) {
      return encounterType.trim()
    }
    return null
  }, [auth.user?.specialty, encounterValidation.encounter?.type])

  const payer = useMemo(() => {
    const encounterPatient = encounterValidation.encounter?.patient as
      | { insurance?: string | null; payer?: string | null }
      | undefined
    const encounterInsurance = encounterPatient?.insurance
    if (typeof encounterInsurance === "string" && encounterInsurance.trim().length > 0) {
      return encounterInsurance.trim()
    }
    const encounterPayer = encounterPatient?.payer
    if (typeof encounterPayer === "string" && encounterPayer.trim().length > 0) {
      return encounterPayer.trim()
    }
    const detailInsurance = patientDetails?.demographics?.insurance
    if (typeof detailInsurance === "string" && detailInsurance.trim().length > 0) {
      return detailInsurance.trim()
    }
    if (typeof selectedPatient?.insurance === "string" && selectedPatient.insurance.trim().length > 0) {
      return selectedPatient.insurance.trim()
    }
    const userPayer = (auth.user as { payer?: unknown } | null)?.payer
    if (typeof userPayer === "string" && userPayer.trim().length > 0) {
      return userPayer.trim()
    }
    return null
  }, [encounterValidation.encounter, patientDetails?.demographics?.insurance, selectedPatient?.insurance, auth.user])

  const [noteContent, setNoteContent] = useState("")
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceError, setComplianceError] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [transcriptionIndex, setTranscriptionIndex] = useState(-1)
  const [showFullTranscript, setShowFullTranscript] = useState(false)

  const initialRecordedSeconds = testOverrides?.initialRecordedSeconds ?? 0
  const [visitStarted, setVisitStarted] = useState(false)
  const [visitLoading, setVisitLoading] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [visitSession, setVisitSession] = useState<{ sessionId?: number; status?: string; startTime?: string; endTime?: string }>({})
  const [hasEverStarted, setHasEverStarted] = useState(initialRecordedSeconds > 0)
  const [currentSessionTime, setCurrentSessionTime] = useState(0)
  const [pausedTime, setPausedTime] = useState(initialRecordedSeconds)

  const [showFinalizationWizard, setShowFinalizationWizard] = useState(false)
  const [isFinalized, setIsFinalized] = useState(false)

  const [noteId, setNoteId] = useState<string | null>(null)
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [saveDraftLoading, setSaveDraftLoading] = useState(false)
  const [saveDraftError, setSaveDraftError] = useState<string | null>(null)

  const patientSearchAbortRef = useRef<AbortController | null>(null)
  const patientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const encounterValidationAbortRef = useRef<AbortController | null>(null)
  const encounterValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patientDetailsAbortRef = useRef<AbortController | null>(null)
  const complianceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceAbortRef = useRef<AbortController | null>(null)
  const lastComplianceContentRef = useRef<string>("")
  const noteContentRef = useRef(noteContent)
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSaveLastContentRef = useRef<string>("")
  const noteCreatePromiseRef = useRef<Promise<string> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const websocketRef = useRef<WebSocket | null>(null)
  const queuedAudioChunksRef = useRef<ArrayBuffer[]>([])
  const patientDropdownCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  type FetchOptions = ApiFetchOptions

  const fetchWithAuth = useCallback(
    (input: RequestInfo | URL, init: FetchOptions = {}) => apiFetch(input, init),
    []
  )

  const convertComplianceResponse = useCallback((raw: any): ComplianceIssue[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((item, index) => {
        if (item && typeof item === "object") {
          const rawId = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : undefined
          const titleCandidate =
            typeof item.title === "string" && item.title.trim().length > 0
              ? item.title.trim()
              : typeof item.description === "string" && item.description.trim().length > 0
                ? item.description.trim()
                : undefined
          const title = titleCandidate ?? `Compliance issue ${index + 1}`
          const description =
            typeof item.description === "string" && item.description.trim().length > 0
              ? item.description.trim()
              : title
          const category =
            item.category === "documentation" ||
            item.category === "coding" ||
            item.category === "billing" ||
            item.category === "quality"
              ? item.category
              : "documentation"
          const severity =
            item.severity === "critical" ||
            item.severity === "warning" ||
            item.severity === "info"
              ? item.severity
              : severityFromText(`${title} ${description}`)
          return {
            id: rawId ?? `issue-${slugify(title)}-${index}`,
            severity,
            title,
            description,
            category,
            details:
              typeof item.details === "string" && item.details.trim().length > 0
                ? item.details.trim()
                : description,
            suggestion:
              typeof item.suggestion === "string" && item.suggestion.trim().length > 0
                ? item.suggestion.trim()
                : "Review the note content and update documentation to resolve this issue.",
            learnMoreUrl:
              typeof item.learnMoreUrl === "string" && item.learnMoreUrl.trim().length > 0
                ? item.learnMoreUrl.trim()
                : undefined,
            dismissed: Boolean(item.dismissed)
          } satisfies ComplianceIssue
        }
        if (typeof item === "string" && item.trim().length > 0) {
          const text = item.trim()
          const sentence = text.split(/[.!?]/)[0]?.trim() ?? text
          return {
            id: `issue-${slugify(sentence || text)}-${index}`,
            severity: severityFromText(text),
            title: sentence.length > 0 ? sentence : `Compliance issue ${index + 1}`,
            description: text,
            category: "documentation",
            details: text,
            suggestion: "Review the highlighted area for compliance gaps.",
            dismissed: false
          } satisfies ComplianceIssue
        }
        return null
      })
      .filter((item): item is ComplianceIssue => Boolean(item))
  }, [])

  const convertWizardIssuesToCompliance = useCallback(
    (issues?: Record<string, unknown>): ComplianceIssue[] => {
      if (!issues || typeof issues !== "object") {
        return []
      }

      const normalized: ComplianceIssue[] = []
      Object.entries(issues).forEach(([categoryKey, value]) => {
        if (!Array.isArray(value)) {
          return
        }

        value.forEach((entry, index) => {
          if (typeof entry !== "string") {
            return
          }
          const text = entry.trim()
          if (!text) {
            return
          }

          const category: ComplianceIssue["category"] =
            categoryKey === "compliance"
              ? "quality"
              : categoryKey === "codes" ||
                  categoryKey === "diagnoses" ||
                  categoryKey === "differentials" ||
                  categoryKey === "prevention"
                ? "coding"
                : "documentation"

          normalized.push({
            id: `wizard-${categoryKey}-${slugify(text)}-${index}`,
            severity: severityFromText(text),
            title: text,
            description: text,
            details: text,
            suggestion: "Review and address this item before export.",
            category,
            dismissed: false
          })
        })
      })

      return normalized
    },
    []
  )

  const ensureNoteCreated = useCallback(
    async (contentOverride?: string) => {
      if (noteId) return noteId
      if (noteCreatePromiseRef.current) {
        return noteCreatePromiseRef.current
      }
      const trimmedPatientId = patientId.trim()
      if (!trimmedPatientId) {
        throw new Error("Patient ID is required before creating a note")
      }

      const payload = {
        patientId: trimmedPatientId,
        encounterId: encounterId.trim().length > 0 ? encounterId.trim() : undefined,
        content:
          typeof contentOverride === "string" ? contentOverride : noteContentRef.current
      }

      const createPromise = (async () => {
        try {
          const response = await fetchWithAuth("/api/notes/create", {
            method: "POST",
            jsonBody: payload
          })
          if (!response.ok) {
            throw new Error(`Failed to create note (${response.status})`)
          }
          const data = await response.json()
          const createdId =
            data?.noteId != null
              ? String(data.noteId)
              : data?.note_id != null
                ? String(data.note_id)
                : null
          if (!createdId) {
            throw new Error("Note identifier missing from response")
          }
          setNoteId(createdId)
          setAutoSaveError(null)
          return createdId
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to create a draft note"
          setAutoSaveError(message)
          throw error
        } finally {
          noteCreatePromiseRef.current = null
        }
      })()

      noteCreatePromiseRef.current = createPromise
      return createPromise
    },
    [noteId, patientId, encounterId, fetchWithAuth],
  )

  const stopAudioStream = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.ondataavailable = null
        recorder.stop()
      } catch (error) {
        console.error("Failed to stop recorder", error)
      }
    }
    mediaRecorderRef.current = null

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch (error) {
          console.error("Failed to stop track", error)
        }
      })
    }
    mediaStreamRef.current = null

    const socket = websocketRef.current
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      } catch (error) {
        console.error("Failed to close websocket", error)
      }
    }
    websocketRef.current = null
    queuedAudioChunksRef.current = []
    setIsRecording(false)
  }, [])

  const startAudioStream = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setTranscriptionError("Microphone access is not supported in this browser.")
      return false
    }
    setTranscriptionError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      queuedAudioChunksRef.current = []

      const token = getStoredToken()
      const wsTarget = new URL(resolveWebsocketUrl("/api/transcribe/stream"))
      if (token) {
        wsTarget.searchParams.set("token", token)
      }
      const protocols = token ? ["authorization", `Bearer ${token}`] : undefined
      const ws = protocols
        ? new WebSocket(wsTarget.toString(), protocols)
        : new WebSocket(wsTarget.toString())
      websocketRef.current = ws

      ws.onopen = () => {
        if (queuedAudioChunksRef.current.length) {
          for (const chunk of queuedAudioChunksRef.current) {
            ws.send(chunk)
          }
          queuedAudioChunksRef.current = []
        }
      }

      ws.onmessage = (event) => {
        try {
          const payload =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : JSON.parse(new TextDecoder().decode(event.data))
          if (!payload || typeof payload !== "object" || !payload.transcript) return
          const text = String(payload.transcript)
          const entry: TranscriptEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            confidence:
              typeof payload.confidence === "number"
                ? payload.confidence
                : typeof payload.confidence === "string"
                  ? Number.parseFloat(payload.confidence) || 0
                  : 0,
            isInterim: Boolean(payload.isInterim),
            timestamp: Date.now(),
            speaker:
              typeof payload.speakerLabel === "string" && payload.speakerLabel.trim().length > 0
                ? payload.speakerLabel.trim()
                : undefined
          }
          setTranscriptEntries(prev => [...prev, entry])
        } catch (error) {
          console.error("Failed to parse transcript payload", error)
        }
      }

      ws.onerror = () => {
        setTranscriptionError("Unable to maintain transcription connection.")
      }

      ws.onclose = () => {
        websocketRef.current = null
      }

      recorder.ondataavailable = async (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return
        try {
          const buffer = await event.data.arrayBuffer()
          const socket = websocketRef.current
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(buffer)
          } else {
            queuedAudioChunksRef.current.push(buffer)
          }
        } catch (error) {
          console.error("Failed to process audio chunk", error)
        }
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (error) {
            console.error("Failed to stop track", error)
          }
        })
      }

      recorder.start(1000)
      setIsRecording(true)
      return true
    } catch (error) {
      console.error("Unable to start audio stream", error)
      setTranscriptionError(
        error instanceof Error ? error.message : "Unable to access microphone"
      )
      stopAudioStream()
      return false
    }
  }, [stopAudioStream])

  const handlePatientInputChange = useCallback((value: string) => {
    setPatientInputValue(value)
    setPatientId(value.trim())
    setSelectedPatient(null)
    setPatientDetails(null)
    patientDetailsAbortRef.current?.abort()
  }, [])

  const handleSelectPatient = useCallback((suggestion: PatientSuggestion) => {
    setSelectedPatient(suggestion)
    setPatientId(suggestion.patientId)
    setPatientInputValue(suggestion.patientId)
    setIsPatientDropdownOpen(false)
    setPatientDetails(null)
    patientDetailsAbortRef.current?.abort()
  }, [])

  const openPatientDropdown = useCallback(() => {
    if (patientDropdownCloseTimeoutRef.current) {
      clearTimeout(patientDropdownCloseTimeoutRef.current)
      patientDropdownCloseTimeoutRef.current = null
    }
    setIsPatientDropdownOpen(true)
  }, [])

  const scheduleClosePatientDropdown = useCallback(() => {
    if (patientDropdownCloseTimeoutRef.current) {
      clearTimeout(patientDropdownCloseTimeoutRef.current)
    }
    patientDropdownCloseTimeoutRef.current = window.setTimeout(() => {
      setIsPatientDropdownOpen(false)
    }, 150)
  }, [])

  useEffect(() => {
    noteContentRef.current = noteContent
  }, [noteContent])

  useEffect(() => {
    if (
      !noteId &&
      patientId.trim().length > 0 &&
      (noteContentRef.current?.trim()?.length ?? 0) > 0
    ) {
      void ensureNoteCreated(noteContentRef.current).catch(() => {})
    }
  }, [patientId, noteId, ensureNoteCreated])

  useEffect(() => {
    if (prePopulatedPatient?.patientId) {
      setPatientId(prePopulatedPatient.patientId)
      setPatientInputValue(prePopulatedPatient.patientId)
    }
    if (prePopulatedPatient?.encounterId) {
      setEncounterId(prePopulatedPatient.encounterId)
    }
  }, [prePopulatedPatient])

  useEffect(() => {
    if (!patientInputValue || patientInputValue.trim().length < 2) {
      setPatientSuggestions([])
      setPatientSearchError(null)
      patientSearchAbortRef.current?.abort()
      setIsPatientDropdownOpen(false)
      return
    }

    if (patientSearchTimeoutRef.current) {
      clearTimeout(patientSearchTimeoutRef.current)
    }

    const controller = new AbortController()
    patientSearchAbortRef.current?.abort()
    patientSearchAbortRef.current = controller

    patientSearchTimeoutRef.current = window.setTimeout(async () => {
      setPatientSearchLoading(true)
      setPatientSearchError(null)
      try {
        const query = encodeURIComponent(patientInputValue.trim())
        const response = await fetchWithAuth(`/api/patients/search?q=${query}&limit=10`, {
          signal: controller.signal
        })
        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`)
        }
        const data = await response.json()
        const local: PatientSuggestion[] = Array.isArray(data?.patients)
          ? data.patients.map((patient: any) => ({
              patientId: String(patient?.patientId ?? patient?.id ?? ""),
              name: typeof patient?.name === "string" ? patient.name : undefined,
              firstName: typeof patient?.firstName === "string" ? patient.firstName : undefined,
              lastName: typeof patient?.lastName === "string" ? patient.lastName : undefined,
              dob: typeof patient?.dob === "string" ? patient.dob : undefined,
              mrn: typeof patient?.mrn === "string" ? patient.mrn : undefined,
              age: typeof patient?.age === "number" ? patient.age : undefined,
              gender: typeof patient?.gender === "string" ? patient.gender : undefined,
              insurance:
                typeof patient?.insurance === "string" && patient.insurance.trim().length > 0
                  ? patient.insurance.trim()
                  : undefined,
              lastVisit:
                typeof patient?.lastVisit === "string" && patient.lastVisit.trim().length > 0
                  ? patient.lastVisit.trim()
                  : undefined,
              allergies: Array.isArray(patient?.allergies)
                ? patient.allergies
                    .map((item: unknown) =>
                      typeof item === "string"
                        ? item.trim()
                        : typeof item === "number"
                          ? String(item)
                          : ""
                    )
                    .filter((item: string) => item.length > 0)
                : undefined,
              medications: Array.isArray(patient?.medications)
                ? patient.medications
                    .map((item: unknown) =>
                      typeof item === "string"
                        ? item.trim()
                        : typeof item === "number"
                          ? String(item)
                          : ""
                    )
                    .filter((item: string) => item.length > 0)
                : undefined,
              source: "local"
            }))
          : []
        const external: PatientSuggestion[] = Array.isArray(data?.externalPatients)
          ? data.externalPatients.map((patient: any) => ({
              patientId: String(patient?.patientId ?? patient?.id ?? patient?.identifier ?? ""),
              name: typeof patient?.name === "string" ? patient.name : undefined,
              firstName: typeof patient?.firstName === "string" ? patient.firstName : undefined,
              lastName: typeof patient?.lastName === "string" ? patient.lastName : undefined,
              dob: typeof patient?.dob === "string" ? patient.dob : undefined,
              mrn: typeof patient?.mrn === "string" ? patient.mrn : undefined,
              age: typeof patient?.age === "number" ? patient.age : undefined,
              gender: typeof patient?.gender === "string" ? patient.gender : undefined,
              insurance:
                typeof patient?.insurance === "string" && patient.insurance.trim().length > 0
                  ? patient.insurance.trim()
                  : undefined,
              lastVisit:
                typeof patient?.lastVisit === "string" && patient.lastVisit.trim().length > 0
                  ? patient.lastVisit.trim()
                  : undefined,
              allergies: Array.isArray(patient?.allergies)
                ? patient.allergies
                    .map((item: unknown) =>
                      typeof item === "string"
                        ? item.trim()
                        : typeof item === "number"
                          ? String(item)
                          : ""
                    )
                    .filter((item: string) => item.length > 0)
                : undefined,
              medications: Array.isArray(patient?.medications)
                ? patient.medications
                    .map((item: unknown) =>
                      typeof item === "string"
                        ? item.trim()
                        : typeof item === "number"
                          ? String(item)
                          : ""
                    )
                    .filter((item: string) => item.length > 0)
                : undefined,
              source: "external"
            }))
          : []
        const combined = [...local, ...external].filter((suggestion) => suggestion.patientId)
        setPatientSuggestions(combined.slice(0, 10))
        setIsPatientDropdownOpen(true)
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setPatientSuggestions([])
        setPatientSearchError(
          error instanceof Error ? error.message : "Unable to search patients"
        )
      } finally {
        setPatientSearchLoading(false)
      }
    }, 300)

    return () => {
      if (patientSearchTimeoutRef.current) {
        clearTimeout(patientSearchTimeoutRef.current)
      }
      controller.abort()
    }
  }, [patientInputValue, fetchWithAuth])

  useEffect(() => {
    const trimmed = patientId.trim()
    patientDetailsAbortRef.current?.abort()

    if (!trimmed) {
      setPatientDetails(null)
      return
    }

    const numericId = Number(trimmed)
    if (!Number.isFinite(numericId)) {
      setPatientDetails(null)
      return
    }

    const controller = new AbortController()
    patientDetailsAbortRef.current = controller

    const parseStringList = (value: unknown): string[] => {
      if (!value) {
        return []
      }
      if (Array.isArray(value)) {
        return value
          .map(item => {
            if (typeof item === "string") {
              return item.trim()
            }
            if (typeof item === "number") {
              return String(item)
            }
            return ""
          })
          .filter((item): item is string => item.length > 0)
      }
      return []
    }

    const loadPatientDetails = async () => {
      try {
        const data = await apiFetchJson<PatientDetailsResponse>(`/api/patients/${numericId}`, {
          signal: controller.signal,
          returnNullOnEmpty: true
        })
        if (controller.signal.aborted) {
          return
        }
        if (!data) {
          setPatientDetails(null)
          return
        }

        setPatientDetails(data)

        setSelectedPatient(prev => {
          const demographics = data.demographics ?? {}
          const allergies = parseStringList(data.allergies)
          const medications = parseStringList(data.medications)
          const resolvedId =
            demographics.patientId != null && `${demographics.patientId}`.trim().length > 0
              ? `${demographics.patientId}`.trim()
              : prev?.patientId ?? trimmed
          return {
            patientId: resolvedId,
            name:
              typeof demographics.name === "string" && demographics.name.trim().length > 0
                ? demographics.name.trim()
                : prev?.name,
            firstName:
              typeof demographics.firstName === "string" && demographics.firstName.trim().length > 0
                ? demographics.firstName.trim()
                : prev?.firstName,
            lastName:
              typeof demographics.lastName === "string" && demographics.lastName.trim().length > 0
                ? demographics.lastName.trim()
                : prev?.lastName,
            dob:
              typeof demographics.dob === "string" && demographics.dob.trim().length > 0
                ? demographics.dob.trim()
                : prev?.dob,
            mrn:
              typeof demographics.mrn === "string" && demographics.mrn.trim().length > 0
                ? demographics.mrn.trim()
                : prev?.mrn,
            age:
              typeof demographics.age === "number" && Number.isFinite(demographics.age)
                ? demographics.age
                : prev?.age,
            gender:
              typeof demographics.gender === "string" && demographics.gender.trim().length > 0
                ? demographics.gender.trim()
                : prev?.gender,
            insurance:
              typeof demographics.insurance === "string" && demographics.insurance.trim().length > 0
                ? demographics.insurance.trim()
                : prev?.insurance,
            lastVisit:
              typeof demographics.lastVisit === "string" && demographics.lastVisit.trim().length > 0
                ? demographics.lastVisit.trim()
                : prev?.lastVisit,
            allergies: allergies.length > 0 ? allergies : prev?.allergies,
            medications: medications.length > 0 ? medications : prev?.medications,
            source: prev?.source ?? "local"
          }
        })
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return
        }
        console.error("Failed to load patient details", error)
        setPatientDetails(null)
      }
    }

    void loadPatientDetails()

    return () => {
      controller.abort()
    }
  }, [patientId])

  useEffect(() => {
    return () => {
      patientDetailsAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!encounterId || encounterId.trim().length === 0) {
      setEncounterValidation({ status: "idle" })
      encounterValidationAbortRef.current?.abort()
      return
    }

    if (encounterValidationTimeoutRef.current) {
      clearTimeout(encounterValidationTimeoutRef.current)
    }

    const controller = new AbortController()
    encounterValidationAbortRef.current?.abort()
    encounterValidationAbortRef.current = controller

    encounterValidationTimeoutRef.current = window.setTimeout(async () => {
      setEncounterValidation({ status: "loading" })
      try {
        const numericId = Number(encounterId)
        if (!Number.isFinite(numericId)) {
          throw new Error("Encounter ID must be numeric")
        }
        const response = await fetchWithAuth(`/api/encounters/validate/${numericId}`, {
          signal: controller.signal
        })
        if (!response.ok) {
          throw new Error(`Validation failed (${response.status})`)
        }
        const data = await response.json()
        if (data?.valid) {
          const encounterPatientId = data?.encounter?.patient?.patientId ?? data?.encounter?.patientId
          if (encounterPatientId && !patientId) {
            setPatientId(String(encounterPatientId))
            setPatientInputValue(String(encounterPatientId))
          } else if (
            encounterPatientId &&
            patientId &&
            String(encounterPatientId) !== String(patientId)
          ) {
            setEncounterValidation({
              status: "invalid",
              encounter: data?.encounter,
              message: "Encounter is associated with a different patient"
            })
            return
          }
          const summaryParts = [
            typeof data?.encounter?.date === "string" ? data.encounter.date : null,
            typeof data?.encounter?.type === "string" ? data.encounter.type : null,
            typeof data?.encounter?.provider === "string" ? data.encounter.provider : null
          ].filter(Boolean)
          setEncounterValidation({
            status: "valid",
            encounter: data?.encounter,
            message: summaryParts.length ? summaryParts.join(" • ") : "Encounter validated"
          })
        } else {
          const errors: string[] = Array.isArray(data?.errors)
            ? data.errors.filter((item: any) => typeof item === "string")
            : []
          setEncounterValidation({
            status: "invalid",
            encounter: data?.encounter,
            message: errors.length ? errors.join(", ") : "Encounter not found"
          })
        }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setEncounterValidation({
          status: "invalid",
          message:
            error instanceof Error ? error.message : "Unable to validate encounter"
        })
      }
    }, 400)

    return () => {
      if (encounterValidationTimeoutRef.current) {
        clearTimeout(encounterValidationTimeoutRef.current)
      }
      controller.abort()
    }
  }, [encounterId, patientId, fetchWithAuth])

  useEffect(() => {
    if (complianceTimeoutRef.current) {
      clearTimeout(complianceTimeoutRef.current)
    }

    if (!noteContent || noteContent.trim().length === 0) {
      lastComplianceContentRef.current = ""
      setComplianceIssues([])
      setComplianceError(null)
      return
    }

    complianceTimeoutRef.current = window.setTimeout(async () => {
      if (noteContentRef.current === lastComplianceContentRef.current) return
      const controller = new AbortController()
      complianceAbortRef.current?.abort()
      complianceAbortRef.current = controller
      setComplianceLoading(true)
      setComplianceError(null)
      try {
        const payload: Record<string, unknown> = {
          text: noteContentRef.current,
          specialty: specialty ?? undefined,
          payer: payer ?? undefined
        }
        if (noteId) {
          payload.note_id = noteId
        }
        const response = await fetchWithAuth("/api/compliance/analyze", {
          method: "POST",
          jsonBody: payload,
          signal: controller.signal
        })
        if (!response.ok) {
          throw new Error(`Compliance analysis failed (${response.status})`)
        }
        const data = await response.json()
        const normalized = convertComplianceResponse(
          Array.isArray(data?.compliance) ? data.compliance : data?.issues ?? data?.results ?? data
        )
        setComplianceIssues((prev) => {
          const dismissed = new Map(prev.map((issue) => [issue.id, issue.dismissed]))
          return normalized.map((issue) => ({
            ...issue,
            dismissed: dismissed.get(issue.id) ?? issue.dismissed ?? false
          }))
        })
        lastComplianceContentRef.current = noteContentRef.current
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setComplianceError(
          error instanceof Error ? error.message : "Compliance analysis unavailable"
        )
      } finally {
        setComplianceLoading(false)
      }
    }, 2000)

    return () => {
      if (complianceTimeoutRef.current) {
        clearTimeout(complianceTimeoutRef.current)
      }
      complianceAbortRef.current?.abort()
    }
  }, [noteContent, specialty, payer, noteId, fetchWithAuth, convertComplianceResponse])

  useEffect(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current)
      autoSaveIntervalRef.current = null
    }
    if (isFinalized) {
      return
    }

    const trimmedPatientId = patientId.trim()
    if (!trimmedPatientId) {
      return
    }

    const performAutoSave = async () => {
      const content = noteContentRef.current
      if (content === autoSaveLastContentRef.current) return
      try {
        const ensuredId = noteId ?? (await ensureNoteCreated(content))
        if (!ensuredId) {
          return
        }
        const numericId = Number(ensuredId)
        const payload: Record<string, unknown> = {
          note_id: Number.isFinite(numericId) ? numericId : ensuredId,
          content
        }
        const response = await fetchWithAuth("/api/notes/auto-save", {
          method: "PUT",
          jsonBody: payload
        })
        if (!response.ok) {
          let message = `Auto-save failed (${response.status})`
          try {
            const errBody = await response.json()
            const detail =
              typeof errBody?.message === "string" && errBody.message.trim().length > 0
                ? errBody.message
                : typeof errBody?.detail === "string" && errBody.detail.trim().length > 0
                  ? errBody.detail
                  : ""
            if (detail) {
              message = detail
            }
          } catch {
            // ignore body parsing errors
          }
          throw new Error(message)
        } else {
          await response.json().catch(() => ({}))
        }
        autoSaveLastContentRef.current = content
        setLastAutoSaveTime(new Date().toISOString())
        setAutoSaveError(null)
        if (!noteId) {
          setNoteId(String(ensuredId))
        }
      } catch (error) {
        setAutoSaveError(
          error instanceof Error ? error.message : "Unable to auto-save note",
        )
      }
    }

    void performAutoSave()
    autoSaveIntervalRef.current = window.setInterval(performAutoSave, 30_000)

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }
  }, [noteId, patientId, fetchWithAuth, ensureNoteCreated, isFinalized])

  useEffect(() => {
    return () => {
      patientSearchAbortRef.current?.abort()
      encounterValidationAbortRef.current?.abort()
      complianceAbortRef.current?.abort()
      if (patientDropdownCloseTimeoutRef.current) {
        clearTimeout(patientDropdownCloseTimeoutRef.current)
      }
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }
      noteCreatePromiseRef.current = null
      stopAudioStream()
    }
  }, [stopAudioStream])

  useEffect(() => {
    if (!visitStarted || !isRecording) return
    const interval = window.setInterval(() => {
      setCurrentSessionTime(time => time + 1)
    }, 1000)
    return () => {
      clearInterval(interval)
    }
  }, [visitStarted, isRecording])

  useEffect(() => {
    if (!transcriptEntries.length) {
      setTranscriptionIndex(-1)
    } else {
      setTranscriptionIndex(transcriptEntries.length - 1)
    }
  }, [transcriptEntries])

  const handleDismissIssue = (issueId: string) => {
    setComplianceIssues(prev =>
      prev.map(issue =>
        issue.id === issueId ? { ...issue, dismissed: true } : issue
      )
    )
  }

  const handleRestoreIssue = (issueId: string) => {
    setComplianceIssues(prev =>
      prev.map(issue =>
        issue.id === issueId ? { ...issue, dismissed: false } : issue
      )
    )
  }

  const applyWizardIssues = useCallback(
    (issues?: Record<string, unknown>) => {
      const normalized = convertWizardIssuesToCompliance(issues)
      setComplianceIssues(normalized)
    },
    [convertWizardIssuesToCompliance]
  )

  const handlePreFinalizeResult = useCallback(
    (result: PreFinalizeCheckResponse) => {
      applyWizardIssues(result?.issues)
    },
    [applyWizardIssues]
  )

  const handleFinalizationError = useCallback((message: string) => {
    if (!message) return
    toast.error("Finalization failed", {
      description: message
    })
  }, [])

  const handleFinalizationClose = useCallback(
    (result?: FinalizeResult) => {
      setShowFinalizationWizard(false)
      if (!result) {
        return
      }

      setIsFinalized(true)
      stopAudioStream()
      setVisitStarted(false)
      setVisitSession(prev => ({
        ...prev,
        status: "finalized",
        endTime: new Date().toISOString()
      }))
      setVisitError(null)
      setPausedTime(currentSessionTime)

      const finalizedContent =
        typeof result.finalizedContent === "string" && result.finalizedContent.trim().length > 0
          ? result.finalizedContent
          : noteContentRef.current

      if (finalizedContent && finalizedContent !== noteContentRef.current) {
        noteContentRef.current = finalizedContent
        setNoteContent(finalizedContent)
        if (onNoteContentChange) {
          onNoteContentChange(finalizedContent)
        }
        autoSaveLastContentRef.current = finalizedContent
        lastComplianceContentRef.current = finalizedContent
      }

      applyWizardIssues(result.issues)

      toast.success("Note finalized", {
        description: result.exportReady
          ? "The note has been finalized and is ready for export."
          : "The note was finalized, but some items still require review."
      })
    },
    [
      applyWizardIssues,
      currentSessionTime,
      onNoteContentChange,
      stopAudioStream
    ]
  )

  const patientDisplayName = useMemo(() => {
    if (selectedPatient) {
      if (typeof selectedPatient.name === "string" && selectedPatient.name.trim().length > 0) {
        return selectedPatient.name.trim()
      }
      const combined = `${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim()
      if (combined.length > 0) {
        return combined
      }
    }
    return patientId.trim().length > 0 ? patientId.trim() : undefined
  }, [patientId, selectedPatient])

  const patientAgeValue = useMemo(() => {
    if (typeof selectedPatient?.age === "number" && Number.isFinite(selectedPatient.age)) {
      return selectedPatient.age
    }
    return undefined
  }, [selectedPatient?.age])

  const patientSexValue = useMemo(() => {
    if (typeof selectedPatient?.gender === "string" && selectedPatient.gender.trim().length > 0) {
      return selectedPatient.gender.trim()
    }
    return undefined
  }, [selectedPatient?.gender])

  const encounterDateValue = useMemo(() => {
    if (typeof visitSession?.startTime === "string" && visitSession.startTime.trim().length > 0) {
      return visitSession.startTime.trim()
    }
    return undefined
  }, [visitSession?.startTime])

  const totalDisplayTime = visitStarted ? currentSessionTime : pausedTime
  const isEditorDisabled = isFinalized || !visitStarted
  const hasRecordedTime = totalDisplayTime > 0

  // Calculate active issues for button state
  const activeIssues = complianceIssues.filter(issue => !issue.dismissed)
  const criticalIssues = activeIssues.filter(issue => issue.severity === 'critical')
  const hasActiveIssues = activeIssues.length > 0
  const finalizeButtonDisabled = isFinalized || !hasRecordedTime || hasActiveIssues
  const hasCriticalIssues = criticalIssues.length > 0

  const recentTranscription = useMemo(() => {
    if (!transcriptEntries.length) return []
    return transcriptEntries.slice(Math.max(0, transcriptEntries.length - 3))
  }, [transcriptEntries])

  const totalTranscriptWords = useMemo(() => {
    return transcriptEntries.reduce((sum, entry) => {
      if (!entry.text) return sum
      const words = entry.text.trim().split(/\s+/).filter(Boolean).length
      return sum + words
    }, 0)
  }, [transcriptEntries])

  const averageTranscriptConfidence = useMemo(() => {
    if (!transcriptEntries.length) return null
    const sum = transcriptEntries.reduce((total, entry) => total + entry.confidence, 0)
    return sum / transcriptEntries.length
  }, [transcriptEntries])

  const totalTranscribedLines = transcriptEntries.length
  const currentTranscriptCount = transcriptionIndex >= 0 ? transcriptionIndex + 1 : 0
  const averageConfidencePercent =
    averageTranscriptConfidence === null
      ? null
      : Math.round(Math.min(1, Math.max(0, averageTranscriptConfidence)) * 100)

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleFinalize = useCallback(async () => {
    if (isFinalized) {
      toast.info("Note already finalized", {
        description: "Editing is locked after finalization."
      })
      return
    }

    try {
      await ensureNoteCreated()
      setShowFinalizationWizard(true)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to open the finalization wizard."
      toast.error("Unable to open finalization wizard", {
        description: message
      })
    }
  }, [ensureNoteCreated, isFinalized])

  const handleSaveDraft = useCallback(async () => {
    if (saveDraftLoading) {
      return
    }

    if (isFinalized) {
      toast.info("Note already finalized", {
        description: "Finalized notes cannot be saved as drafts."
      })
      return
    }

    const trimmedPatientId = patientId.trim()
    if (!trimmedPatientId) {
      const message = "Patient ID is required before saving a draft."
      setSaveDraftError(message)
      toast.error("Unable to save draft", { description: message })
      return
    }

    const previousAutoSaveTime = lastAutoSaveTime
    const optimisticTimestamp = new Date().toISOString()

    setSaveDraftLoading(true)
    setSaveDraftError(null)
    setLastAutoSaveTime(optimisticTimestamp)

    try {
      const content = noteContentRef.current ?? ""
      const ensuredId = await ensureNoteCreated(content)
      if (!ensuredId) {
        throw new Error("Unable to determine draft identifier")
      }

      const numericId = Number(ensuredId)
      const payload: Record<string, unknown> = {
        note_id: Number.isFinite(numericId) ? numericId : ensuredId,
        content
      }

      const response = await fetchWithAuth("/api/notes/auto-save", {
        method: "PUT",
        jsonBody: payload
      })

      if (!response.ok) {
        let message = `Failed to save draft (${response.status})`
        try {
          const errorBody = await response.json()
          const detail =
            typeof errorBody?.message === "string" && errorBody.message.trim().length > 0
              ? errorBody.message
              : typeof errorBody?.detail === "string" && errorBody.detail.trim().length > 0
                ? errorBody.detail
                : ""
          if (detail) {
            message = detail
          }
        } catch {
          // Ignore parsing errors
        }
        throw new Error(message)
      }

      await response.json().catch(() => ({}))

      autoSaveLastContentRef.current = content
      setAutoSaveError(null)
      if (!noteId) {
        setNoteId(String(ensuredId))
      }

      if (visitSession.sessionId) {
        try {
          const sessionResponse = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            jsonBody: { session_id: visitSession.sessionId, action: "complete" }
          })
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json().catch(() => null)
            if (sessionData) {
              setVisitSession(prev => ({ ...prev, ...sessionData }))
            }
          }
        } catch (error) {
          console.error("Failed to update visit session after draft save", error)
        }
      }

      stopAudioStream()
      setVisitStarted(false)
      setPausedTime(currentSessionTime)

      try {
        const encounterValue = encounterId.trim()
        await fetchWithAuth("/api/activity/log", {
          method: "POST",
          jsonBody: {
            eventType: "draft_saved",
            details: {
              manual: true,
              patientId: trimmedPatientId,
              encounterId: encounterValue || undefined,
              noteId: ensuredId,
              source: "note-editor"
            }
          }
        })
      } catch (error) {
        console.error("Failed to log draft save activity", error)
      }

      toast.success("Draft saved", {
        description: "Draft saved and available in drafts overview."
      })
      onNavigateToDrafts?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save draft"
      setSaveDraftError(message)
      setAutoSaveError(message)
      setLastAutoSaveTime(previousAutoSaveTime ?? null)
      toast.error("Unable to save draft", {
        description: message
      })
    } finally {
      setSaveDraftLoading(false)
    }
  }, [
    saveDraftLoading,
    isFinalized,
    patientId,
    lastAutoSaveTime,
    noteContentRef,
    ensureNoteCreated,
    fetchWithAuth,
    noteId,
    visitSession.sessionId,
    setVisitSession,
    stopAudioStream,
    setVisitStarted,
    currentSessionTime,
    setPausedTime,
    encounterId,
    onNavigateToDrafts,
    setAutoSaveError
  ])

  const canStartVisit = useMemo(() => {
    if (isFinalized) {
      return false
    }
    return (
      patientId.trim().length > 0 &&
      encounterValidation.status === "valid"
    )
  }, [patientId, encounterValidation.status, isFinalized])

  const handleVisitToggle = useCallback(async () => {
    if (visitLoading) return
    if (isFinalized) {
      setVisitError("Note has been finalized and cannot be modified.")
      return
    }
    if (!visitStarted) {
      if (!canStartVisit) {
        setVisitError("Validate patient and encounter before starting a visit.")
        return
      }
      setVisitLoading(true)
      setVisitError(null)
      try {
        const encounterNumeric = Number(
          encounterValidation.encounter?.encounterId ?? encounterId
        )
        if (!Number.isFinite(encounterNumeric)) {
          throw new Error("Encounter ID must be numeric")
        }
        let sessionData: any = null
        if (!visitSession.sessionId) {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "POST",
            jsonBody: { encounter_id: encounterNumeric }
          })
          if (!response.ok) {
            throw new Error(`Failed to start visit (${response.status})`)
          }
          sessionData = await response.json()
        } else {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            jsonBody: { session_id: visitSession.sessionId, action: "active" }
          })
          if (!response.ok) {
            throw new Error(`Failed to resume visit (${response.status})`)
          }
          sessionData = await response.json()
        }
        if (sessionData) {
          setVisitSession(prev => ({ ...prev, ...sessionData }))
        }
        if (!hasEverStarted) {
          setHasEverStarted(true)
          setCurrentSessionTime(0)
          setPausedTime(0)
          setTranscriptEntries([])
        } else {
          setCurrentSessionTime(pausedTime)
        }
        await ensureNoteCreated()
        setVisitStarted(true)
        const started = await startAudioStream()
        if (!started) {
          setVisitError("Microphone access is required for live transcription.")
        }
      } catch (error) {
        setVisitError(
          error instanceof Error ? error.message : "Unable to start visit"
        )
        stopAudioStream()
        setVisitStarted(false)
      } finally {
        setVisitLoading(false)
      }
    } else {
      setVisitLoading(true)
      try {
        if (visitSession.sessionId) {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            jsonBody: { session_id: visitSession.sessionId, action: "paused" }
          })
          if (response.ok) {
            const data = await response.json().catch(() => null)
            if (data) {
              setVisitSession(prev => ({ ...prev, ...data }))
            }
          }
        }
      } catch (error) {
        setVisitError(error instanceof Error ? error.message : "Unable to pause visit")
      } finally {
        stopAudioStream()
        setVisitStarted(false)
        setPausedTime(currentSessionTime)
        setVisitLoading(false)
      }
    }
  }, [
    visitLoading,
    visitStarted,
    canStartVisit,
    encounterValidation.encounter?.encounterId,
    encounterId,
    fetchWithAuth,
    visitSession.sessionId,
    hasEverStarted,
    pausedTime,
    ensureNoteCreated,
    startAudioStream,
    stopAudioStream,
    currentSessionTime,
    isFinalized
  ])

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div className="border-b bg-background p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="patient-id">Patient ID</Label>
            <div className="relative">
              <Input
                id="patient-id"
                value={patientInputValue}
                onChange={(e) => handlePatientInputChange(e.target.value)}
                onFocus={openPatientDropdown}
                onBlur={scheduleClosePatientDropdown}
                placeholder="Search patients by name or ID"
                autoComplete="off"
              />
              {isPatientDropdownOpen && patientInputValue.trim().length >= 2 && (
                <div
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg"
                  onMouseEnter={openPatientDropdown}
                  onMouseLeave={scheduleClosePatientDropdown}
                >
                  {patientSuggestions.map(suggestion => {
                    const descriptionParts = [
                      suggestion.name ?? [suggestion.firstName, suggestion.lastName].filter(Boolean).join(" "),
                      suggestion.dob ? `DOB: ${suggestion.dob}` : null,
                      suggestion.mrn ? `MRN: ${suggestion.mrn}` : null
                    ].filter(Boolean)
                    return (
                      <button
                        key={`${suggestion.source}-${suggestion.patientId}`}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                        onMouseDown={event => {
                          event.preventDefault()
                          handleSelectPatient(suggestion)
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">
                          {suggestion.patientId}
                        </span>
                        {descriptionParts.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {descriptionParts.join(" • ")}
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {suggestion.source === "local" ? "Internal" : "External"}
                        </span>
                      </button>
                    )
                  })}
                  {patientSearchLoading && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Searching...
                    </div>
                  )}
                  {!patientSearchLoading && patientSuggestions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No patients found
                    </div>
                  )}
                </div>
              )}
            </div>
            {patientSearchError && (
              <p className="text-xs text-destructive">{patientSearchError}</p>
            )}
            {selectedPatient && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedPatient.name || `${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim() || selectedPatient.patientId}
              </p>
            )}
          </div>

          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="encounter-id">Encounter ID</Label>
            <Input
              id="encounter-id"
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              placeholder="Enter Encounter ID"
            />
            {encounterValidation.status === 'loading' && (
              <p className="text-xs text-muted-foreground">Validating encounter…</p>
            )}
            {encounterValidation.status === 'valid' && encounterValidation.message && (
              <p className="text-xs text-emerald-600">{encounterValidation.message}</p>
            )}
            {encounterValidation.status === 'invalid' && encounterValidation.message && (
              <p className="text-xs text-destructive">{encounterValidation.message}</p>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          {/* Primary Actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    void handleFinalize()
                  }}
                  disabled={finalizeButtonDisabled}
                  className={`shadow-sm ${
                    isFinalized
                      ? 'bg-emerald-600/10 text-emerald-700 cursor-default'
                      : finalizeButtonDisabled
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                >
                  {isFinalized ? (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  ) : hasActiveIssues ? (
                    <AlertTriangle className="w-4 h-4 mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {isFinalized
                    ? 'Note Finalized'
                    : hasActiveIssues
                      ? 'Issues Must Be Resolved'
                      : 'Save & Finalize Note'}
                </Button>
              </TooltipTrigger>
              {(hasActiveIssues || isFinalized) && (
                <TooltipContent>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {isFinalized ? (
                      <div>This note has been finalized and is now read-only.</div>
                    ) : (
                      <>
                        <div className="font-medium text-sm text-foreground">
                          {activeIssues.length} compliance issue{activeIssues.length !== 1 ? 's' : ''} must be resolved
                        </div>
                        {hasCriticalIssues && (
                          <div>
                            {criticalIssues.length} critical issue{criticalIssues.length !== 1 ? 's' : ''} requiring attention
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          
          <Button
            variant="outline"
            onClick={() => {
              void handleSaveDraft()
            }}
            disabled={!hasRecordedTime || saveDraftLoading || isFinalized}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {saveDraftLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saveDraftLoading ? "Saving Draft…" : "Save Draft & Exit"}
          </Button>
          {saveDraftError && (
            <p className="text-xs text-destructive" role="alert">
              {saveDraftError}
            </p>
          )}
          <div className="text-xs text-muted-foreground">
            {lastAutoSaveTime
              ? `Auto-saved ${new Date(lastAutoSaveTime).toLocaleTimeString()}`
              : "Auto-save pending"}
            {autoSaveError && (
              <span className="ml-2 text-destructive">{autoSaveError}</span>
            )}
          </div>

          {/* Start Visit with Recording Indicator */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleVisitToggle}
              disabled={visitLoading || (!visitStarted && !canStartVisit)}
              variant={visitStarted ? "destructive" : "default"}
              className={!visitStarted ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm" : ""}
            >
              {visitLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {visitStarted ? "Stopping..." : "Starting..."}
                </>
              ) : !visitStarted ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Visit
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Stop Visit
                </>
              )}
            </Button>

            {visitError && (
              <p className="text-xs text-destructive">{visitError}</p>
            )}

            {/* Show indicators when visit has ever been started */}
            {hasEverStarted && (
              <div className="flex items-center gap-3 text-destructive">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono font-medium min-w-[3rem] tabular-nums">
                    {formatTime(totalDisplayTime)}
                  </span>
                </div>
                
                {/* Audio Wave Animation - show when visit has ever been started */}
                {hasEverStarted && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex items-center gap-0.5 h-6 cursor-pointer"
                            onClick={() => setShowFullTranscript(true)}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                              <div
                                key={i}
                                className={`w-0.5 rounded-full ${isRecording ? 'bg-destructive' : 'bg-muted-foreground'}`}
                                style={{
                                  height: isRecording ? `${8 + (i % 4) * 3}px` : `${6 + (i % 3) * 2}px`,
                                  animation: isRecording ? `audioWave${i} ${1.2 + (i % 3) * 0.3}s ease-in-out infinite` : 'none',
                                  animationDelay: isRecording ? `${i * 0.1}s` : '0s'
                                }}
                              />
                            ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="center"
                          className="max-w-sm p-3 bg-popover border-border"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-destructive animate-pulse' : 'bg-muted-foreground'}`}></div>
                              {isRecording ? 'Live Transcription Preview' : 'Transcription Preview (Paused)'}
                            </div>
                            <div className="bg-muted/50 rounded-md p-2 border-l-2 border-destructive space-y-1">
                              {recentTranscription.map((entry, index) => (
                                <div
                                  key={entry.id}
                                  className={`text-xs leading-relaxed ${
                                    index === recentTranscription.length - 1
                                      ? 'text-foreground font-medium'
                                      : 'text-muted-foreground'
                                  }`}
                                  style={{
                                    opacity:
                                      index === recentTranscription.length - 1
                                        ? 1
                                        : 0.7 - index * 0.2
                                  }}
                                >
                                  {entry.text}
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                              Click audio wave to view full transcript
                              {!isRecording && (
                                <div className="mt-1 text-muted-foreground/80">
                                  Recording paused - transcript available
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {transcriptionError && (
                      <p className="text-xs text-destructive">{transcriptionError}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Rich Text Editor */}
      <div className="flex-1">
        <RichTextEditor
          disabled={isEditorDisabled}
          complianceIssues={complianceIssues}
          onDismissIssue={handleDismissIssue}
          onRestoreIssue={handleRestoreIssue}
          onContentChange={(content) => {
            setNoteContent(content)
            if (onNoteContentChange) {
              onNoteContentChange(content)
            }
            if (!noteId && patientId.trim().length > 0) {
              void ensureNoteCreated(content).catch(() => {})
            }
          }}
        />
      </div>

      {/* Full Transcript Modal */}
      <Dialog open={showFullTranscript} onOpenChange={setShowFullTranscript}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 bg-background border-border">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <DialogTitle className="text-lg font-medium">Full Transcript</DialogTitle>
                <DialogDescription className="sr-only">
                  Real-time transcription of your patient encounter showing the complete conversation history.
                </DialogDescription>
                <div className="flex items-center gap-2">
                  {isRecording ? (
                    <>
                      <Mic className="w-4 h-4 text-destructive" />
                      <Badge variant="destructive" className="text-xs">
                        <div className="w-1.5 h-1.5 bg-destructive-foreground rounded-full animate-pulse mr-1"></div>
                        Recording
                      </Badge>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">
                        Paused
                      </Badge>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-1 text-sm ${isRecording ? 'text-destructive' : 'text-muted-foreground'}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-mono tabular-nums">
                    {formatTime(totalDisplayTime)}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                {isRecording 
                  ? "Real-time transcription of your patient encounter. The transcript updates automatically as the conversation continues."
                  : "Transcription of your patient encounter. Recording is currently paused - click 'Start Visit' to resume recording and live transcription."
                }
              </div>
              
              <div className="space-y-3">
                {transcriptEntries.map((entry, index) => {
                  const isRecent =
                    index >= Math.max(0, transcriptionIndex - 2) && index <= transcriptionIndex
                  const isCurrent = index === transcriptionIndex && isRecording
                  const rawText = entry.text ?? ""
                  let speakerLabel = entry.speaker?.trim()
                  let content = rawText
                  if (!speakerLabel && rawText.includes(":")) {
                    const [potentialSpeaker, ...rest] = rawText.split(":")
                    if (rest.length) {
                      speakerLabel = potentialSpeaker.trim()
                      content = rest.join(":").trim()
                    }
                  }
                  if (!speakerLabel || speakerLabel.length === 0) {
                    speakerLabel = "Speaker"
                  }
                  if (!content || content.length === 0) {
                    content = rawText
                  }

                  return (
                    <div
                      key={entry.id}
                      className={`flex gap-3 p-3 rounded-lg transition-all duration-300 ${
                        isCurrent
                          ? 'bg-destructive/10 border border-destructive/20 shadow-sm'
                          : isRecent
                            ? 'bg-accent/50'
                            : 'bg-muted/30'
                      }`}
                      style={{
                        opacity: index <= transcriptionIndex ? 1 : 0.4
                      }}
                    >
                      <div className={`font-medium text-sm min-w-16 ${
                        speakerLabel.toLowerCase() === 'doctor' ? 'text-primary' : 'text-blue-600'
                      }`}>
                        {speakerLabel}:
                      </div>
                      <div className={`text-sm leading-relaxed flex-1 ${
                        isCurrent ? 'font-medium' : ''
                      }`}>
                        {content}
                        {isCurrent && isRecording && (
                          <span className="inline-block w-2 h-4 bg-destructive ml-1 animate-pulse"></span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!transcriptEntries.length && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No transcript available yet. Start the visit to capture the conversation.
                  </div>
                )}
              </div>
              
              {isRecording && (
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                    Listening and transcribing...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="border-t border-border p-4 bg-muted/30 shrink-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>
                {currentTranscriptCount} of {totalTranscribedLines} lines transcribed
              </div>
              <div className="flex items-center gap-4">
                <div>Words: {totalTranscriptWords.toLocaleString()}</div>
                <div>
                  Confidence: {averageConfidencePercent !== null ? `${averageConfidencePercent}%` : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {showFinalizationWizard && (
        <FinalizationWizardAdapter
          isOpen={showFinalizationWizard}
          onClose={handleFinalizationClose}
          selectedCodes={selectedCodes}
          selectedCodesList={selectedCodesList}
          complianceIssues={complianceIssues}
          noteContent={noteContent}
          patientInfo={{
            patientId: patientId.trim().length > 0 ? patientId.trim() : undefined,
            encounterId,
            name: patientDisplayName ?? null,
            age: patientAgeValue ?? null,
            sex: patientSexValue ?? null,
            encounterDate: encounterDateValue ?? null
          }}
          transcriptEntries={transcriptEntries}
          fetchWithAuth={fetchWithAuth}
          noteId={noteId}
          onPreFinalizeResult={handlePreFinalizeResult}
          onError={handleFinalizationError}
        />
      )}

    </div>
  )
}