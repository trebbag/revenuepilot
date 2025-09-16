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
import { RichTextEditor } from "./RichTextEditor"
import { BeautifiedView } from "./BeautifiedView"
import { FinalizationWizard } from "./FinalizationWizard"

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
  source: 'local' | 'external'
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

const getStoredToken = (): string | null => {
  if (typeof window === "undefined") return null
  const candidates: Array<Storage | undefined> = [
    typeof window.localStorage !== "undefined" ? window.localStorage : undefined,
    typeof window.sessionStorage !== "undefined" ? window.sessionStorage : undefined
  ]
  for (const storage of candidates) {
    if (!storage) continue
    try {
      const token =
        storage.getItem("token") ||
        storage.getItem("accessToken") ||
        storage.getItem("authToken")
      if (token) {
        return token
      }
    } catch {
      // Ignore storage access errors (e.g. privacy mode)
    }
  }
  return null
}

const buildAuthHeaders = (headers?: HeadersInit, opts: { json?: boolean } = {}) => {
  const result = new Headers(headers ?? {})
  if (opts.json && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json")
  }
  const token = getStoredToken()
  if (token && !result.has("Authorization")) {
    result.set("Authorization", `Bearer ${token}`)
  }
  return result
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
}

export function NoteEditor({
  prePopulatedPatient,
  selectedCodes = { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
  selectedCodesList = [],
  onNoteContentChange
}: NoteEditorProps) {
  const [patientInputValue, setPatientInputValue] = useState(prePopulatedPatient?.patientId || "")
  const [patientId, setPatientId] = useState(prePopulatedPatient?.patientId || "")
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null)
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false)

  const [encounterId, setEncounterId] = useState(prePopulatedPatient?.encounterId || "")
  const [encounterValidation, setEncounterValidation] = useState<EncounterValidationState>({
    status: prePopulatedPatient?.encounterId ? 'loading' : 'idle'
  })

  const [noteContent, setNoteContent] = useState("")
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceError, setComplianceError] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [transcriptionIndex, setTranscriptionIndex] = useState(-1)
  const [showFullTranscript, setShowFullTranscript] = useState(false)

  const [visitStarted, setVisitStarted] = useState(false)
  const [visitLoading, setVisitLoading] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [visitSession, setVisitSession] = useState<{ sessionId?: number; status?: string; startTime?: string; endTime?: string }>({})
  const [hasEverStarted, setHasEverStarted] = useState(false)
  const [currentSessionTime, setCurrentSessionTime] = useState(0)
  const [pausedTime, setPausedTime] = useState(0)

  const [showFinalizationWizard, setShowFinalizationWizard] = useState(false)

  const [noteId, setNoteId] = useState<string | null>(null)
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)

  const patientSearchAbortRef = useRef<AbortController | null>(null)
  const patientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const encounterValidationAbortRef = useRef<AbortController | null>(null)
  const encounterValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceAbortRef = useRef<AbortController | null>(null)
  const lastComplianceContentRef = useRef<string>("")
  const noteContentRef = useRef(noteContent)
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSaveLastContentRef = useRef<string>("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const websocketRef = useRef<WebSocket | null>(null)
  const queuedAudioChunksRef = useRef<ArrayBuffer[]>([])
  const patientDropdownCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  type FetchOptions = RequestInit & { json?: boolean }

  const fetchWithAuth = useCallback(
    (input: RequestInfo | URL, init: FetchOptions = {}) => {
      const { json, headers, ...rest } = init
      const mergedHeaders = buildAuthHeaders(headers, { json })
      return fetch(input, { ...rest, headers: mergedHeaders })
    },
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

  const ensureNoteCreated = useCallback(async () => {
    if (noteId) return noteId
    if (!patientId || patientId.trim().length === 0) {
      throw new Error("Patient ID is required before creating a note")
    }
    try {
      const payload = {
        patientId: patientId.trim(),
        encounterId: encounterId.trim().length > 0 ? encounterId.trim() : undefined,
        content: noteContentRef.current
      }
      const response = await fetchWithAuth("/api/notes/create", {
        method: "POST",
        body: JSON.stringify(payload),
        json: true
      })
      if (!response.ok) {
        throw new Error(`Failed to create note (${response.status})`)
      }
      const data = await response.json()
      const createdId = data?.noteId ? String(data.noteId) : null
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
    }
  }, [noteId, patientId, encounterId, fetchWithAuth])

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
      const protocol =
        typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"
      const host = typeof window !== "undefined" ? window.location.host : "localhost"
      const url = `${protocol}://${host}/api/transcribe/stream${
        token ? `?token=${encodeURIComponent(token)}` : ""
      }`
      const ws = token
        ? new WebSocket(url, ["authorization", `Bearer ${token}`])
        : new WebSocket(url)
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
  }, [])

  const handleSelectPatient = useCallback((suggestion: PatientSuggestion) => {
    setSelectedPatient(suggestion)
    setPatientId(suggestion.patientId)
    setPatientInputValue(suggestion.patientId)
    setIsPatientDropdownOpen(false)
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
          body: JSON.stringify(payload),
          json: true,
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
    if (!noteId || !hasEverStarted) {
      return
    }

    const performAutoSave = async () => {
      const content = noteContentRef.current
      if (content === autoSaveLastContentRef.current) return
      try {
        const response = await fetchWithAuth("/api/notes/auto-save", {
          method: "POST",
          body: JSON.stringify({ noteId, content }),
          json: true
        })
        if (!response.ok) {
          throw new Error(`Auto-save failed (${response.status})`)
        }
        autoSaveLastContentRef.current = content
        setLastAutoSaveTime(new Date().toISOString())
        setAutoSaveError(null)
      } catch (error) {
        setAutoSaveError(
          error instanceof Error ? error.message : "Unable to auto-save note"
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
  }, [noteId, hasEverStarted, fetchWithAuth])

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

  // Calculate active issues for button state
  const activeIssues = complianceIssues.filter(issue => !issue.dismissed)
  const criticalIssues = activeIssues.filter(issue => issue.severity === 'critical')
  const hasActiveIssues = activeIssues.length > 0
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

  const handleFinalize = () => {
    setShowFinalizationWizard(true)
  }

  const handleSaveDraft = () => {
    // TODO: Save draft and navigate to drafts page
    console.log("Saving draft and exiting...")
  }

  const canStartVisit = useMemo(() => {
    return (
      patientId.trim().length > 0 &&
      encounterValidation.status === "valid"
    )
  }, [patientId, encounterValidation.status])

  const handleVisitToggle = useCallback(async () => {
    if (visitLoading) return
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
            body: JSON.stringify({ encounter_id: encounterNumeric }),
            json: true
          })
          if (!response.ok) {
            throw new Error(`Failed to start visit (${response.status})`)
          }
          sessionData = await response.json()
        } else {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            body: JSON.stringify({ session_id: visitSession.sessionId, action: "active" }),
            json: true
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
            body: JSON.stringify({ session_id: visitSession.sessionId, action: "paused" }),
            json: true
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
    currentSessionTime
  ])

  const totalDisplayTime = visitStarted ? currentSessionTime : pausedTime
  const isEditorDisabled = !visitStarted
  const hasRecordedTime = totalDisplayTime > 0

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
                  onClick={handleFinalize}
                  disabled={!hasRecordedTime || hasActiveIssues}
                  className={`shadow-sm ${
                    hasActiveIssues 
                      ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                >
                  {hasActiveIssues ? (
                    <AlertTriangle className="w-4 h-4 mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {hasActiveIssues ? 'Issues Must Be Resolved' : 'Save & Finalize Note'}
                </Button>
              </TooltipTrigger>
              {hasActiveIssues && (
                <TooltipContent>
                  <div className="space-y-1">
                    <div className="font-medium text-sm">
                      {activeIssues.length} compliance issue{activeIssues.length !== 1 ? 's' : ''} must be resolved
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {hasCriticalIssues && `${criticalIssues.length} critical issue${criticalIssues.length !== 1 ? 's' : ''} requiring attention`}
                    </div>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={!hasRecordedTime}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Draft & Exit
          </Button>
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
                                      : 0.7 - (index * 0.2)
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
        <FinalizationWizard
          isOpen={showFinalizationWizard}
          onClose={() => setShowFinalizationWizard(false)}
          selectedCodes={selectedCodes}
          selectedCodesList={selectedCodesList}
          complianceIssues={complianceIssues}
          noteContent={noteContent}
          patientInfo={{
            patientId,
            encounterId
          }}
        />
      )}

    </div>
  )
}