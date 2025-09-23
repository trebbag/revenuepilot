import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
  type MutableRefObject,
} from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Badge } from "./ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { ScrollArea } from "./ui/scroll-area"
import { CheckCircle, Save, Play, Square, Clock, Mic, MicOff, AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { RichTextEditor } from "./RichTextEditor"
import { BeautifiedView, type BeautifyResultState, type EhrExportState } from "./BeautifiedView"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { type FinalizationWizardLaunchOptions, type PreFinalizeCheckResponse } from "./FinalizationWizardAdapter"
import type { FinalizeResult } from "../features/finalization"
import { apiFetch, apiFetchJson, getStoredToken, resolveWebsocketUrl, type ApiFetchOptions } from "../lib/api"
import { useAuth } from "../contexts/AuthContext"
import { useSession } from "../contexts/SessionContext"
import type { StoredFinalizationSession } from "../features/finalization/workflowTypes"
import useContextStage from "../hooks/useContextStage"

export interface ComplianceIssue {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  category: "documentation" | "coding" | "billing" | "quality"
  details: string
  suggestion: string
  learnMoreUrl?: string
  confidence?: number | null
  ruleReferences?: {
    ruleId?: string
    citations?: { title?: string; url?: string; citation?: string }[]
  }[]
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
  source: "local" | "external"
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
  status: "idle" | "loading" | "valid" | "invalid"
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

type TranscriptSpeakerRole = "clinician" | "patient" | "other"

interface TranscriptEntry {
  id: string
  text: string
  confidence?: number | null
  timestamp: number
  speaker: string
  speakerRole: TranscriptSpeakerRole
}

const TRANSCRIPT_RECENT_WINDOW_MS = 60_000
const TRANSCRIPTION_CONNECTION_ERROR = "Unable to maintain transcription connection."

const SPEAKER_STYLES: Record<TranscriptSpeakerRole, { badge: string; dot: string; text: string }> = {
  clinician: {
    badge: "bg-blue-100 text-blue-700 border border-blue-200",
    dot: "bg-blue-500",
    text: "text-blue-700",
  },
  patient: {
    badge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  other: {
    badge: "bg-slate-200 text-slate-700 border border-slate-300",
    dot: "bg-slate-400",
    text: "text-slate-700",
  },
}

function normaliseSpeakerRole(value: unknown): TranscriptSpeakerRole {
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase()
    if (normalised.startsWith("clin")) return "clinician"
    if (normalised.startsWith("prov")) return "clinician"
    if (normalised.startsWith("doc")) return "clinician"
    if (normalised.startsWith("pat")) return "patient"
    if (normalised.startsWith("pt")) return "patient"
  }
  return "other"
}

function formatSpeakerLabel(role: TranscriptSpeakerRole): string {
  switch (role) {
    case "clinician":
      return "Clinician"
    case "patient":
      return "Patient"
    default:
      return "Other"
  }
}

function coerceTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const numeric = Number.parseFloat(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return Date.now()
}

function parseConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number.parseFloat(value)
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.min(1, numeric))
    }
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const TRANSCRIPT_ARRAY_KEYS = [
  "entries",
  "transcriptEntries",
  "segments",
  "items",
  "values",
  "messages",
  "chunks",
  "deltas",
  "results",
  "samples",
  "history",
  "lines",
  "parts",
  "alternatives",
]

const TRANSCRIPT_OBJECT_KEYS = [
  "entry",
  "segment",
  "message",
  "delta",
  "result",
  "payload",
  "data",
  "detail",
  "details",
  "current",
]

const TRANSCRIPT_TEXT_KEYS = [
  "text",
  "transcript",
  "value",
  "content",
  "message",
  "line",
  "utterance",
  "snippet",
  "body",
]

const TRANSCRIPT_TIMESTAMP_KEYS = [
  "timestamp",
  "ts",
  "time",
  "offset",
  "start",
  "startTime",
  "startMs",
  "startedAt",
  "started_at",
  "createdAt",
  "updatedAt",
  "receivedAt",
  "timeMs",
  "timestampMs",
  "offsetMs",
  "begin",
  "beginMs",
]

const TRANSCRIPT_CONFIDENCE_KEYS = [
  "confidence",
  "confidenceScore",
  "accuracy",
  "probability",
  "score",
  "confidence_percent",
  "likelihood",
]

const TRANSCRIPT_ROLE_KEYS = [
  "speakerRole",
  "role",
  "speaker",
  "participant",
  "channel",
  "actor",
  "speakerTag",
  "speaker_type",
  "speakerType",
  "source",
]

const TRANSCRIPT_LABEL_KEYS = [
  "speakerLabel",
  "speaker_label",
  "speakerName",
  "speaker_name",
  "displayName",
  "name",
  "label",
  "speaker",
  "role",
  "participant",
  "source",
]

const TRANSCRIPT_ID_KEYS = [
  "id",
  "entryId",
  "segmentId",
  "eventId",
  "cursor",
  "cursorId",
  "cursor_id",
  "sequence",
  "seq",
  "index",
  "messageId",
  "token",
  "uuid",
  "guid",
  "lineId",
]

type TranscriptNormalizationMode = "append" | "replace" | "clear"

interface TranscriptNormalizationResult {
  entries: TranscriptEntry[]
  mode: TranscriptNormalizationMode
  snap: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeEventName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalised = value.trim().toLowerCase()
  if (!normalised) {
    return null
  }
  return normalised.replace(/[^a-z0-9]+/g, "_")
}

function buildTranscriptEntryFromSource(
  source: unknown,
  counterRef: MutableRefObject<number>,
): TranscriptEntry | null {
  if (typeof source === "string") {
    const trimmed = source.trim()
    if (!trimmed) {
      return null
    }
    const timestamp = Date.now()
    counterRef.current += 1
    return {
      id: `transcript-${timestamp}-${counterRef.current}`,
      text: trimmed,
      timestamp,
      speaker: formatSpeakerLabel("other"),
      speakerRole: "other",
    }
  }

  if (!isPlainObject(source)) {
    return null
  }

  const record = source

  let text = ""
  for (const key of TRANSCRIPT_TEXT_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim().length > 0) {
      text = value.trim()
      break
    }
    if (Array.isArray(value)) {
      const combined = value
        .map((item) => {
          if (typeof item === "string") {
            return item.trim()
          }
          if (isPlainObject(item) && typeof item.word === "string") {
            return item.word.trim()
          }
          return ""
        })
        .filter(Boolean)
        .join(" ")
      if (combined.trim().length > 0) {
        text = combined.trim()
        break
      }
    }
  }

  if (!text) {
    const words = record.words
    if (Array.isArray(words)) {
      const combined = words
        .map((item) => {
          if (typeof item === "string") {
            return item.trim()
          }
          if (isPlainObject(item) && typeof item.word === "string") {
            return item.word.trim()
          }
          return ""
        })
        .filter(Boolean)
        .join(" ")
      if (combined.trim().length > 0) {
        text = combined.trim()
      }
    }
  }

  text = text.trim()
  if (!text) {
    return null
  }

  let timestampValue: unknown
  for (const key of TRANSCRIPT_TIMESTAMP_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      timestampValue = record[key]
      break
    }
  }
  if (timestampValue === undefined) {
    if (record.end !== undefined && record.end !== null) {
      timestampValue = record.end
    } else if (record.endTime !== undefined && record.endTime !== null) {
      timestampValue = record.endTime
    }
  }
  const timestamp = coerceTimestamp(timestampValue)

  let confidenceValue: unknown
  for (const key of TRANSCRIPT_CONFIDENCE_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      confidenceValue = record[key]
      break
    }
  }
  const confidence = parseConfidence(confidenceValue)

  let roleValue: unknown
  for (const key of TRANSCRIPT_ROLE_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      roleValue = record[key]
      break
    }
  }
  const role = normaliseSpeakerRole(roleValue)

  let speakerLabel: string | null = null
  for (const key of TRANSCRIPT_LABEL_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim().length > 0) {
      speakerLabel = value.trim()
      break
    }
  }
  if (!speakerLabel || speakerLabel.trim().toLowerCase() === role) {
    speakerLabel = formatSpeakerLabel(role)
  }

  let idValue: unknown
  for (const key of TRANSCRIPT_ID_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      idValue = record[key]
      break
    }
  }
  if (idValue === undefined && record.timestampId !== undefined && record.timestampId !== null) {
    idValue = record.timestampId
  }

  let entryId: string
  if (typeof idValue === "string" && idValue.trim().length > 0) {
    entryId = idValue.trim()
  } else if (typeof idValue === "number" && Number.isFinite(idValue)) {
    entryId = `transcript-${idValue}`
  } else {
    counterRef.current += 1
    entryId = `transcript-${timestamp}-${counterRef.current}`
  }

  const entry: TranscriptEntry = {
    id: entryId,
    text,
    timestamp,
    speaker: speakerLabel,
    speakerRole: role,
  }
  if (confidence !== null) {
    entry.confidence = confidence
  }
  return entry
}

function normalizeTranscriptStreamPayload(
  payload: unknown,
  counterRef: MutableRefObject<number>,
): TranscriptNormalizationResult {
  const result: TranscriptNormalizationResult = { entries: [], mode: "append", snap: false }

  if (payload === null || payload === undefined) {
    return result
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim()
    if (!trimmed) {
      return result
    }
    try {
      return normalizeTranscriptStreamPayload(JSON.parse(trimmed), counterRef)
    } catch {
      const entry = buildTranscriptEntryFromSource(trimmed, counterRef)
      if (entry) {
        result.entries = [entry]
        result.snap = true
      }
      return result
    }
  }

  if (payload instanceof ArrayBuffer) {
    const decoded = new TextDecoder().decode(payload)
    return normalizeTranscriptStreamPayload(decoded, counterRef)
  }

  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView
    const sliced = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    const decoded = new TextDecoder().decode(sliced)
    return normalizeTranscriptStreamPayload(decoded, counterRef)
  }

  if (!isPlainObject(payload)) {
    const entry = buildTranscriptEntryFromSource(payload, counterRef)
    if (entry) {
      result.entries = [entry]
      result.snap = true
    }
    return result
  }

  const root = payload
  const data = isPlainObject(root.data) ? (root.data as Record<string, unknown>) : root
  const sources: Record<string, unknown>[] = [root]
  if (data !== root) {
    sources.push(data)
  }

  const entryMap = new Map<string, TranscriptEntry>()
  const seen = new Set<unknown>()

  const collect = (value: unknown, depth = 0) => {
    if (value === null || value === undefined || depth > 4) {
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item, depth + 1)
      }
      return
    }
    if (isPlainObject(value)) {
      if (seen.has(value)) {
        return
      }
      seen.add(value)

      const direct = buildTranscriptEntryFromSource(value, counterRef)
      if (direct) {
        entryMap.set(direct.id, direct)
      }

      for (const key of TRANSCRIPT_ARRAY_KEYS) {
        const child = value[key]
        if (Array.isArray(child)) {
          for (const item of child) {
            collect(item, depth + 1)
          }
        }
      }

      for (const key of TRANSCRIPT_OBJECT_KEYS) {
        const child = value[key]
        if (!child) {
          continue
        }
        if (Array.isArray(child)) {
          for (const item of child) {
            collect(item, depth + 1)
          }
        } else {
          collect(child, depth + 1)
        }
      }
      return
    }

    const entry = buildTranscriptEntryFromSource(value, counterRef)
    if (entry) {
      entryMap.set(entry.id, entry)
    }
  }

  collect(data)
  if (data !== root) {
    collect(root)
  }

  if (entryMap.size > 0) {
    result.entries = Array.from(entryMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    result.snap = true
  }

  const eventNames = [
    normalizeEventName(root.event),
    normalizeEventName(data.event),
    normalizeEventName((root as Record<string, unknown>).type),
    normalizeEventName((data as Record<string, unknown>).type),
    normalizeEventName((root as Record<string, unknown>).action),
    normalizeEventName((data as Record<string, unknown>).action),
  ].filter((name): name is string => Boolean(name))

  const hasResetFlag = sources.some((value) => value.reset === true || value.clear === true)
  const hasReplaceFlag = sources.some((value) => value.replace === true || value.snapshot === true || value.history === true)
  const hasSnapFlag = sources.some((value) => value.snap === true || value.shouldSnap === true)

  if (hasSnapFlag && !result.snap) {
    result.snap = true
  }

  if (!result.snap && eventNames.some((name) => name.endsWith("_end") || name.endsWith("_complete"))) {
    result.snap = true
  }

  const isResetEvent =
    hasResetFlag || eventNames.some((name) => name.includes("reset") || name.includes("clear"))

  const isSnapshotEvent =
    hasReplaceFlag || eventNames.some((name) => name.includes("snapshot") || name.includes("history"))

  if (isResetEvent && result.entries.length === 0) {
    result.mode = "clear"
  } else if (isSnapshotEvent || (isResetEvent && result.entries.length > 0)) {
    result.mode = "replace"
  }

  return result
}

async function decodeWebsocketData(data: unknown): Promise<unknown> {
  if (typeof data === "string") {
    const trimmed = data.trim()
    if (!trimmed) {
      return null
    }
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const text = await data.text()
    return decodeWebsocketData(text)
  }

  if (data instanceof ArrayBuffer) {
    const decoded = new TextDecoder().decode(data)
    return decodeWebsocketData(decoded)
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    const sliced = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    const decoded = new TextDecoder().decode(sliced)
    return decodeWebsocketData(decoded)
  }

  return data
}

export type StreamConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error"

export interface StreamConnectionState {
  status: StreamConnectionStatus
  attempts: number
  lastError?: string | null
  lastConnectedAt?: number | null
  nextRetryDelayMs?: number | null
}

export interface LiveCodeSuggestion {
  id: string
  code?: string
  description?: string
  rationale?: string
  type?: string
  confidence?: number | null
  category?: string | null
  receivedAt: number
  source?: string | null
}

export interface CollaborationPresence {
  id: string
  name?: string
  role?: string
  status?: string
  lastSeen?: number
}

export interface CollaborationStreamState {
  participants: CollaborationPresence[]
  conflicts: string[]
  status?: string | null
  connection: StreamConnectionState
}

interface InitialNoteData {
  noteId: string
  content: string
  patientId?: string
  encounterId?: string
  patientName?: string
}

const normalizeCodeValueForCompliance = (value: unknown): string | null => {
  if (value && typeof value === "object" && "code" in (value as Record<string, unknown>)) {
    return normalizeCodeValueForCompliance((value as { code?: unknown }).code)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

const createComplianceSignature = (content: string, codes: string[]): string => {
  const normalizedContent = typeof content === "string" ? content : ""
  const sortedCodes = [...codes]
    .filter((code) => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim())
    .sort()
  return JSON.stringify({ content: normalizedContent, codes: sortedCodes })
}

const hashTranscriptEntries = (entries: TranscriptEntry[]): string => {
  let hash = 0
  for (const entry of entries) {
    const timestamp = Number.isFinite(entry.timestamp) ? Math.round(entry.timestamp) : 0
    const basis = `${entry.id ?? ""}|${timestamp}|${entry.speakerRole}|${entry.text ?? ""}`
    for (let index = 0; index < basis.length; index += 1) {
      hash = (hash * 31 + basis.charCodeAt(index)) | 0
    }
  }
  return (hash >>> 0).toString(36)
}

const createTranscriptCursor = (entries: TranscriptEntry[]): string | null => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null
  }

  const tail = entries.slice(-5)
  const summary = {
    total: entries.length,
    tail: tail.map((entry) => ({
      id: entry.id,
      ts: Number.isFinite(entry.timestamp) ? Math.round(entry.timestamp) : 0,
      speaker: entry.speakerRole,
      len: entry.text.length,
    })),
    hash: hashTranscriptEntries(tail),
  }

  return JSON.stringify(summary)
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

type NoteViewMode = "draft" | "beautified"

type AutoSaveTrigger = "debounced" | "interval" | "manual"

interface PerformAutoSaveOptions {
  reason?: AutoSaveTrigger
  contentOverride?: string
  noteIdOverride?: string
  force?: boolean
}

type VisitSessionStatus = "active" | "paused" | "completed"

interface VisitSessionState {
  sessionId?: number
  encounterId?: number | string
  patientId?: string
  status?: VisitSessionStatus
  startTime?: string
  endTime?: string | null
  durationSeconds?: number
  lastResumedAt?: string | null
}

const parseSessionTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = /(Z|z|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

const AUTO_SAVE_DEBOUNCE_MS = 5_000
const STREAM_HISTORY_LIMIT = 50

interface NoteEditorProps {
  prePopulatedPatient?: {
    patientId: string
    encounterId: string
  } | null
  initialNoteData?: InitialNoteData
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
  initialViewMode?: NoteViewMode
  viewMode?: NoteViewMode
  onViewModeChange?: (mode: NoteViewMode) => void
  beautifiedNote?: BeautifyResultState | null
  onBeautifiedNoteChange?: (state: BeautifyResultState | null) => void
  ehrExportState?: EhrExportState | null
  onEhrExportStateChange?: (state: EhrExportState | null) => void
  recentFinalization?: {
    result: FinalizeResult
    noteId?: string | null
    encounterId?: string | null
    patientId?: string | null
  } | null
  onRecentFinalizationHandled?: () => void
  onOpenFinalization?: (options: FinalizationWizardLaunchOptions) => void
  onComplianceStreamUpdate?: (issues: ComplianceIssue[], state: StreamConnectionState) => void
  onCodeStreamUpdate?: (suggestions: LiveCodeSuggestion[], state: StreamConnectionState) => void
  onCollaborationStreamUpdate?: (state: CollaborationStreamState) => void
  onContextStageChange?: (info: NoteContextStageInfo | null) => void
  onTranscriptCursorChange?: (cursor: string | null) => void
}

export interface NoteContextStageInfo {
  correlationId: string | null
  bestStage: string | null
  contextGeneratedAt: string | null
}

export function NoteEditor({
  prePopulatedPatient,
  initialNoteData,
  selectedCodes = { codes: 0, prevention: 0, diagnoses: 0, differentials: 0 },
  selectedCodesList = [],
  onNoteContentChange,
  onNavigateToDrafts,
  testOverrides,
  initialViewMode = "draft",
  viewMode,
  onViewModeChange,
  beautifiedNote,
  onBeautifiedNoteChange,
  ehrExportState,
  onEhrExportStateChange,
  recentFinalization,
  onRecentFinalizationHandled,
  onOpenFinalization,
  onComplianceStreamUpdate,
  onCodeStreamUpdate,
  onCollaborationStreamUpdate,
  onContextStageChange,
  onTranscriptCursorChange,
}: NoteEditorProps) {
  const auth = useAuth()
  const { state: sessionState } = useSession()
  const [patientInputValue, setPatientInputValue] = useState(initialNoteData?.patientId || initialNoteData?.patientName || prePopulatedPatient?.patientId || "")
  const [patientId, setPatientId] = useState(initialNoteData?.patientId || prePopulatedPatient?.patientId || "")
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null)

  const normalizedPatientId = useMemo(() => patientId.trim(), [patientId])
  const patientIdForContext = normalizedPatientId.length > 0 ? normalizedPatientId : undefined
  const contextStageState = useContextStage(null, { patientId: patientIdForContext })

  useEffect(() => {
    if (!onContextStageChange) {
      return
    }
    if (!patientIdForContext) {
      onContextStageChange(null)
      return
    }
    onContextStageChange({
      correlationId: contextStageState.correlationId,
      bestStage: contextStageState.bestStage,
      contextGeneratedAt: contextStageState.contextGeneratedAt,
    })
  }, [
    onContextStageChange,
    patientIdForContext,
    contextStageState.correlationId,
    contextStageState.bestStage,
    contextStageState.contextGeneratedAt,
  ])

  const contextStageDisplay = useMemo(() => {
    const result: Record<string, string> = {}
    const order: Array<"superficial" | "deep" | "indexed"> = ["superficial", "deep", "indexed"]
    order.forEach((stage) => {
      const info = contextStageState.stages[stage]
      if (!info || !info.state) {
        result[stage] = "⧗"
      } else if (info.state === "completed") {
        result[stage] = "✓"
      } else if (info.state === "running") {
        const pct = Number.isFinite(info.percent) ? Math.round((info.percent ?? 0) as number) : null
        result[stage] = pct != null ? `${pct}%` : "…"
      } else if (info.state === "failed") {
        result[stage] = "⚠"
      } else {
        result[stage] = "⧗"
      }
    })
    return result
  }, [contextStageState.stages])
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false)
  const [patientDetails, setPatientDetails] = useState<PatientDetailsResponse | null>(null)

  const [encounterId, setEncounterId] = useState(initialNoteData?.encounterId || prePopulatedPatient?.encounterId || "")
  const [encounterValidation, setEncounterValidation] = useState<EncounterValidationState>({
    status: initialNoteData?.encounterId || prePopulatedPatient?.encounterId ? "loading" : "idle",
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
    const encounterPatient = encounterValidation.encounter?.patient as { insurance?: string | null; payer?: string | null } | undefined
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

  const [noteContent, setNoteContent] = useState(initialNoteData?.content ?? "")
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [complianceStreamState, setComplianceStreamState] = useState<StreamConnectionState>({
    status: "idle",
    attempts: 0,
    lastError: null,
    lastConnectedAt: null,
    nextRetryDelayMs: null,
  })

  const [liveCodeSuggestions, setLiveCodeSuggestions] = useState<LiveCodeSuggestion[]>([])
  const [codeStreamState, setCodeStreamState] = useState<StreamConnectionState>({
    status: "idle",
    attempts: 0,
    lastError: null,
    lastConnectedAt: null,
    nextRetryDelayMs: null,
  })

  const [collaborationParticipants, setCollaborationParticipants] = useState<CollaborationPresence[]>([])
  const [collaborationConflicts, setCollaborationConflicts] = useState<string[]>([])
  const [collaborationStatus, setCollaborationStatus] = useState<string | null>(null)
  const [collaborationStreamState, setCollaborationStreamState] = useState<StreamConnectionState>({
    status: "idle",
    attempts: 0,
    lastError: null,
    lastConnectedAt: null,
    nextRetryDelayMs: null,
  })

  const [isRecording, setIsRecording] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [transcriptionIndex, setTranscriptionIndex] = useState(-1)
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [transcriptSearch, setTranscriptSearch] = useState("")
  const [shouldSnapTranscriptToEnd, setShouldSnapTranscriptToEnd] = useState(false)

  const clearTranscriptionStreamError = useCallback(() => {
    setTranscriptionError((prev) => {
      if (!prev) {
        return null
      }
      const normalized = prev.trim().toLowerCase()
      if (normalized.includes("transcription") && normalized.includes("connection")) {
        return null
      }
      if (normalized.includes("transcription stream")) {
        return null
      }
      return prev
    })
  }, [])

  const setTranscriptionStreamError = useCallback((message?: string) => {
    const detail = typeof message === "string" && message.trim().length > 0 ? ` ${message.trim()}` : ""
    setTranscriptionError(`${TRANSCRIPTION_CONNECTION_ERROR}${detail}`.trim())
  }, [])

  const initialRecordedSeconds = testOverrides?.initialRecordedSeconds ?? 0
  const [visitStarted, setVisitStarted] = useState(false)
  const [visitLoading, setVisitLoading] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [visitSession, setVisitSession] = useState<VisitSessionState>({})
  const [hasEverStarted, setHasEverStarted] = useState(initialRecordedSeconds > 0)
  const [currentSessionTime, setCurrentSessionTime] = useState(0)
  const [pausedTime, setPausedTime] = useState(initialRecordedSeconds)

  const [isFinalized, setIsFinalized] = useState(false)

  const [noteId, setNoteId] = useState<string | null>(initialNoteData?.noteId ?? null)

  const finalizationSessionSnapshot = useMemo<StoredFinalizationSession | null>(() => {
    const sessions = sessionState.finalizationSessions
    if (!sessions || typeof sessions !== "object") {
      return null
    }

    const normalize = (value?: string | null) => (typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : "")

    const noteCandidates = new Set<string>()
    const encounterCandidates = new Set<string>()
    const patientCandidates = new Set<string>()

    const register = (set: Set<string>, value?: string | null) => {
      const normalized = normalize(value ?? null)
      if (normalized) {
        set.add(normalized)
      }
    }

    register(noteCandidates, initialNoteData?.noteId ?? null)
    register(noteCandidates, noteId)
    register(encounterCandidates, initialNoteData?.encounterId ?? null)
    register(encounterCandidates, encounterId)
    register(patientCandidates, initialNoteData?.patientId ?? null)
    register(patientCandidates, patientId)

    let fallback: StoredFinalizationSession | null = null

    for (const entry of Object.values(sessions)) {
      if (!entry || typeof entry !== "object") {
        continue
      }
      const session = entry as StoredFinalizationSession
      const sessionNote = normalize(session.noteId)
      const sessionEncounter = normalize(session.encounterId)
      const sessionPatient = normalize(session.patientId)

      const matchesNote = sessionNote && noteCandidates.has(sessionNote)
      const matchesEncounter = sessionEncounter && encounterCandidates.has(sessionEncounter)
      const matchesPatient = sessionPatient && patientCandidates.has(sessionPatient)

      if (matchesNote || matchesEncounter || matchesPatient) {
        if (session.lastFinalizeResult) {
          return session
        }
        if (!fallback) {
          fallback = session
        }
      }
    }

    return fallback
  }, [encounterId, initialNoteData?.encounterId, initialNoteData?.noteId, initialNoteData?.patientId, noteId, patientId, sessionState.finalizationSessions])

  const directFinalization = useMemo(() => {
    if (!recentFinalization?.result) {
      return null
    }

    const normalize = (value?: string | null) => (typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : "")

    const noteCandidates = new Set<string>()
    const encounterCandidates = new Set<string>()
    const patientCandidates = new Set<string>()

    const register = (set: Set<string>, value?: string | null) => {
      const normalized = normalize(value ?? null)
      if (normalized) {
        set.add(normalized)
      }
    }

    register(noteCandidates, initialNoteData?.noteId ?? null)
    register(noteCandidates, noteId)
    register(encounterCandidates, initialNoteData?.encounterId ?? null)
    register(encounterCandidates, encounterId)
    register(patientCandidates, initialNoteData?.patientId ?? null)
    register(patientCandidates, patientId)

    const matchesNote = normalize(recentFinalization.noteId) && noteCandidates.has(normalize(recentFinalization.noteId))
    const matchesEncounter = normalize(recentFinalization.encounterId) && encounterCandidates.has(normalize(recentFinalization.encounterId))
    const matchesPatient = normalize(recentFinalization.patientId) && patientCandidates.has(normalize(recentFinalization.patientId))

    if (matchesNote || matchesEncounter || matchesPatient) {
      return recentFinalization
    }

    return null
  }, [encounterId, initialNoteData?.encounterId, initialNoteData?.noteId, initialNoteData?.patientId, noteId, patientId, recentFinalization])

  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [autoSaveInFlight, setAutoSaveInFlight] = useState(false)
  const [lastAutoSaveVersion, setLastAutoSaveVersion] = useState<number | null>(null)
  const [saveDraftLoading, setSaveDraftLoading] = useState(false)
  const [saveDraftError, setSaveDraftError] = useState<string | null>(null)

  const [internalViewMode, setInternalViewMode] = useState<NoteViewMode>(viewMode ?? initialViewMode)
  useEffect(() => {
    if (viewMode !== undefined) {
      setInternalViewMode(viewMode)
    }
  }, [viewMode])
  const activeViewMode = viewMode ?? internalViewMode

  const setActiveViewMode = useCallback(
    (mode: NoteViewMode) => {
      onViewModeChange?.(mode)
      if (viewMode === undefined) {
        setInternalViewMode(mode)
      }
    },
    [onViewModeChange, viewMode],
  )

  const [internalBeautifiedState, setInternalBeautifiedState] = useState<BeautifyResultState | null>(beautifiedNote ?? null)
  useEffect(() => {
    if (beautifiedNote !== undefined) {
      setInternalBeautifiedState(beautifiedNote ?? null)
    }
  }, [beautifiedNote])
  const currentBeautifiedState = beautifiedNote ?? internalBeautifiedState

  const [internalEhrExportState, setInternalEhrExportState] = useState<EhrExportState | null>(ehrExportState ?? null)
  useEffect(() => {
    if (ehrExportState !== undefined) {
      setInternalEhrExportState(ehrExportState ?? null)
    }
  }, [ehrExportState])
  const currentExportState = ehrExportState ?? internalEhrExportState

  const beautifiedStateRef = useRef<BeautifyResultState | null>(currentBeautifiedState ?? null)
  useEffect(() => {
    beautifiedStateRef.current = currentBeautifiedState ?? null
  }, [currentBeautifiedState])

  const exportStateRef = useRef<EhrExportState | null>(currentExportState ?? null)
  useEffect(() => {
    exportStateRef.current = currentExportState ?? null
  }, [currentExportState])

  const setBeautifiedState = useCallback(
    (next: BeautifyResultState | null) => {
      beautifiedStateRef.current = next ?? null
      if (beautifiedNote === undefined) {
        setInternalBeautifiedState(next)
      }
      onBeautifiedNoteChange?.(next ?? null)
    },
    [beautifiedNote, onBeautifiedNoteChange],
  )

  const setEhrExportState = useCallback(
    (next: EhrExportState | null) => {
      exportStateRef.current = next ?? null
      if (ehrExportState === undefined) {
        setInternalEhrExportState(next)
      }
      onEhrExportStateChange?.(next ?? null)
    },
    [ehrExportState, onEhrExportStateChange],
  )

  const complianceCodeValues = useMemo(() => {
    const unique = new Set<string>()
    ;(selectedCodesList ?? []).forEach((item) => {
      const normalized = normalizeCodeValueForCompliance(item)
      if (normalized) {
        unique.add(normalized)
      }
    })
    return Array.from(unique).sort()
  }, [selectedCodesList])

  const patientSearchAbortRef = useRef<AbortController | null>(null)
  const patientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const encounterValidationAbortRef = useRef<AbortController | null>(null)
  const encounterValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patientDetailsAbortRef = useRef<AbortController | null>(null)
  const complianceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceAbortRef = useRef<AbortController | null>(null)
  const lastComplianceInputRef = useRef<string>(createComplianceSignature(initialNoteData?.content ?? "", complianceCodeValues))
  const noteContentRef = useRef(noteContent)
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveLastContentRef = useRef<string>(initialNoteData?.content ?? "")
  const autoSavePromiseRef = useRef<Promise<boolean> | null>(null)
  const finalizationSyncRef = useRef<string | null>(null)
  const noteCreatePromiseRef = useRef<Promise<string> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const websocketRef = useRef<WebSocket | null>(null)
  const queuedAudioChunksRef = useRef<ArrayBuffer[]>([])
  const transcriptionSocketRef = useRef<WebSocket | null>(null)
  const transcriptionReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptionAttemptsRef = useRef(0)
  const previousTranscriptionStreamKeyRef = useRef<string | null>(null)
  const complianceSocketRef = useRef<WebSocket | null>(null)
  const complianceReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceAttemptsRef = useRef(0)
  const codesSocketRef = useRef<WebSocket | null>(null)
  const codesReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const codesAttemptsRef = useRef(0)
  const collaborationSocketRef = useRef<WebSocket | null>(null)
  const collaborationReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collaborationAttemptsRef = useRef(0)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const transcriptIdCounterRef = useRef(0)
  const transcriptCursorRef = useRef<string | null>(null)
  const prevInitialNoteIdRef = useRef<string | null>(initialNoteData?.noteId ?? null)
  const prevInitialContentRef = useRef<string>(initialNoteData?.content ?? "")
  const prevInitialPatientIdRef = useRef<string | undefined>(initialNoteData?.patientId)
  const prevInitialEncounterIdRef = useRef<string | undefined>(initialNoteData?.encounterId)
  const prevInitialPatientNameRef = useRef<string | undefined>(initialNoteData?.patientName)
  const prevPrePopulatedRef = useRef<{ patientId: string; encounterId: string } | null>(prePopulatedPatient ?? null)
  const patientDropdownCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  type FetchOptions = ApiFetchOptions

  const buildDemographicsHeader = useCallback(() => {
    const lines: string[] = []
    const trimmedPatientId = patientId.trim()
    if (trimmedPatientId) {
      lines.push(`Patient ID: ${trimmedPatientId}`)
    }

    const demographics = patientDetails?.demographics ?? {}
    const demographicName =
      (typeof demographics.name === "string" && demographics.name.trim().length > 0 ? demographics.name.trim() : null) ??
      (typeof demographics.firstName === "string" && demographics.firstName.trim().length > 0
        ? `${demographics.firstName.trim()}${
            typeof demographics.lastName === "string" && demographics.lastName.trim().length > 0
              ? ` ${demographics.lastName.trim()}`
              : ""
          }`.trim()
        : null)
    const selectedName =
      typeof selectedPatient?.name === "string" && selectedPatient.name.trim().length > 0 ? selectedPatient.name.trim() : null
    const name = demographicName || selectedName
    if (name) {
      lines.push(`Patient Name: ${name}`)
    }

    const dob =
      typeof demographics.dob === "string" && demographics.dob.trim().length > 0 ? demographics.dob.trim() : undefined
    if (dob) {
      lines.push(`Date of Birth: ${dob}`)
    }

    const age = typeof demographics.age === "number" && Number.isFinite(demographics.age) ? demographics.age : undefined
    if (age != null) {
      lines.push(`Age: ${age}`)
    }

    const gender =
      typeof demographics.gender === "string" && demographics.gender.trim().length > 0
        ? demographics.gender.trim()
        : undefined
    if (gender) {
      lines.push(`Gender: ${gender}`)
    }

    const insurance = (() => {
      if (typeof demographics.insurance === "string" && demographics.insurance.trim().length > 0) {
        return demographics.insurance.trim()
      }
      if (typeof selectedPatient?.insurance === "string" && selectedPatient.insurance.trim().length > 0) {
        return selectedPatient.insurance.trim()
      }
      return undefined
    })()
    if (insurance) {
      lines.push(`Insurance: ${insurance}`)
    }

    const trimmedEncounterId = encounterId.trim()
    if (trimmedEncounterId) {
      lines.push(`Encounter ID: ${trimmedEncounterId}`)
    }

    const encounter = encounterValidation.encounter
    const encounterDate =
      typeof encounter?.date === "string" && encounter.date.trim().length > 0 ? encounter.date.trim() : undefined
    if (encounterDate) {
      lines.push(`Encounter Date: ${encounterDate}`)
    }
    const encounterType =
      typeof encounter?.type === "string" && encounter.type.trim().length > 0 ? encounter.type.trim() : undefined
    if (encounterType) {
      lines.push(`Encounter Type: ${encounterType}`)
    }
    const encounterProvider =
      typeof encounter?.provider === "string" && encounter.provider.trim().length > 0 ? encounter.provider.trim() : undefined
    if (encounterProvider) {
      lines.push(`Provider: ${encounterProvider}`)
    }

    const preferredUsername =
      typeof (auth.user as { preferred_username?: unknown })?.preferred_username === "string"
        ? ((auth.user as { preferred_username?: string }).preferred_username ?? "").trim()
        : ""
    const clinicianName =
      (typeof auth.user?.name === "string" && auth.user.name.trim().length > 0 ? auth.user.name.trim() : null) ??
      (preferredUsername.length > 0 ? preferredUsername : null) ??
      (typeof auth.user?.sub === "string" && auth.user.sub.trim().length > 0 ? auth.user.sub.trim() : null)
    if (clinicianName) {
      lines.push(`Clinician: ${clinicianName}`)
    }

    lines.push(`Visit Started: ${new Date().toISOString()}`)

    return lines.length > 0 ? `${lines.join("\n")}\n\n` : ""
  }, [auth.user, encounterId, encounterValidation.encounter, patientDetails?.demographics, patientId, selectedPatient])

  const ensureDemographicsHeader = useCallback(() => {
    const header = buildDemographicsHeader()
    if (!header) {
      return header
    }
    const current = noteContentRef.current ?? ""
    const headerFirstLine = header.split("\n")[0] ?? ""
    if (current.startsWith(header) || current.startsWith(headerFirstLine)) {
      return header
    }
    const trimmedCurrent = current.trimStart()
    const updated = trimmedCurrent.length > 0 ? `${header}${trimmedCurrent}` : header
    if (updated !== current) {
      setNoteContent(updated)
      noteContentRef.current = updated
      autoSaveLastContentRef.current = updated
      if (onNoteContentChange) {
        onNoteContentChange(updated)
      }
    }
    return header
  }, [autoSaveLastContentRef, buildDemographicsHeader, noteContentRef, onNoteContentChange])

  const fetchWithAuth = useCallback((input: RequestInfo | URL, init: FetchOptions = {}) => apiFetch(input, init), [])

  const convertComplianceResponse = useCallback((raw: any): ComplianceIssue[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((item, index) => {
        if (item && typeof item === "object") {
          const rawId = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : undefined
          const descriptionSource =
            typeof item.description === "string" && item.description.trim().length > 0
              ? item.description.trim()
              : typeof item.text === "string" && item.text.trim().length > 0
                ? item.text.trim()
                : undefined
          const titleCandidate = typeof item.title === "string" && item.title.trim().length > 0 ? item.title.trim() : descriptionSource
          const title = titleCandidate ?? `Compliance issue ${index + 1}`
          const description = descriptionSource ?? title
          const category = item.category === "documentation" || item.category === "coding" || item.category === "billing" || item.category === "quality" ? item.category : "documentation"
          const priority = typeof item.priority === "string" && item.priority.trim().length > 0 ? item.priority.trim().toLowerCase() : ""
          const severity =
            item.severity === "critical" || item.severity === "warning" || item.severity === "info"
              ? item.severity
              : priority.includes("high") || priority.includes("critical")
                ? "critical"
                : priority.includes("medium") || priority.includes("warn")
                  ? "warning"
                  : priority.includes("low")
                    ? "info"
                    : severityFromText(`${title} ${description}`)
          const normalizedReferences = Array.isArray(item.ruleReferences)
            ? item.ruleReferences
                .map((reference: any) => {
                  const ruleId = typeof reference?.ruleId === "string" && reference.ruleId.trim().length > 0 ? reference.ruleId.trim() : undefined
                  const citations = Array.isArray(reference?.citations)
                    ? reference.citations
                        .map((citation: any) => {
                          const citationTitle = typeof citation?.title === "string" && citation.title.trim().length > 0 ? citation.title.trim() : undefined
                          const citationUrl = typeof citation?.url === "string" && citation.url.trim().length > 0 ? citation.url.trim() : undefined
                          const citationText = typeof citation?.citation === "string" && citation.citation.trim().length > 0 ? citation.citation.trim() : undefined
                          if (!citationTitle && !citationUrl && !citationText) {
                            return null
                          }
                          return { title: citationTitle, url: citationUrl, citation: citationText }
                        })
                        .filter((entry): entry is { title?: string; url?: string; citation?: string } => Boolean(entry))
                    : []
                  if (!ruleId && citations.length === 0) {
                    return null
                  }
                  return { ruleId, citations }
                })
                .filter((entry): entry is { ruleId?: string; citations?: { title?: string; url?: string; citation?: string }[] } => Boolean(entry))
            : []
          const primaryCitation = normalizedReferences.flatMap((ref) => ref.citations ?? []).find((citation) => typeof citation?.url === "string" && citation.url.length > 0)
          const reasoning = typeof item.reasoning === "string" && item.reasoning.trim().length > 0 ? item.reasoning.trim() : undefined
          const detailsText = typeof item.details === "string" && item.details.trim().length > 0 ? item.details.trim() : (reasoning ?? description)
          const suggestionText =
            typeof item.suggestion === "string" && item.suggestion.trim().length > 0 ? item.suggestion.trim() : (reasoning ?? "Review the note content and update documentation to resolve this issue.")
          const confidenceValue = typeof item.confidence === "number" ? Math.round(Math.min(Math.max(item.confidence, 0), 1) * 100) : undefined
          return {
            id: rawId ?? `issue-${slugify(title)}-${index}`,
            severity,
            title,
            description,
            category,
            details: detailsText,
            suggestion: suggestionText,
            learnMoreUrl: typeof item.learnMoreUrl === "string" && item.learnMoreUrl.trim().length > 0 ? item.learnMoreUrl.trim() : primaryCitation?.url,
            confidence: confidenceValue,
            ruleReferences: normalizedReferences.length > 0 ? normalizedReferences : undefined,
            dismissed: Boolean(item.dismissed),
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
            dismissed: false,
          } satisfies ComplianceIssue
        }
        return null
      })
      .filter((item): item is ComplianceIssue => Boolean(item))
  }, [])

  const normalizeComplianceStreamPayload = useCallback(
    (payload: any): ComplianceIssue[] => {
      if (!payload) {
        return []
      }

      const timestampRaw = typeof payload?.timestamp === "number" ? payload.timestamp : typeof payload?.timestamp === "string" ? Date.parse(payload.timestamp) : Date.now()
      const timestamp = Number.isFinite(timestampRaw) ? timestampRaw : Date.now()
      const baseIdentifier = payload?.eventId ?? payload?.event_id ?? payload?.analysisId ?? payload?.analysis_id ?? timestamp

      const issues: Array<Record<string, unknown>> = []

      const pushIssue = (issue: any, index: number) => {
        let message = ""
        let explicitSeverity: string | undefined
        if (issue && typeof issue === "object") {
          const sources = [issue.message, issue.description, issue.summary, issue.text, issue.title, issue.detail]
          for (const source of sources) {
            if (typeof source === "string" && source.trim().length > 0) {
              message = source.trim()
              break
            }
          }
          if (typeof issue.severity === "string" && issue.severity.trim().length > 0) {
            explicitSeverity = issue.severity.trim().toLowerCase()
          }
        } else if (typeof issue === "string") {
          message = issue.trim()
        }

        if (!message) {
          return
        }

        const severity: ComplianceIssue["severity"] =
          explicitSeverity === "critical" || explicitSeverity === "warning" || explicitSeverity === "info" ? (explicitSeverity as ComplianceIssue["severity"]) : severityFromText(message)

        issues.push({
          id: `${baseIdentifier}-${index + 1}`,
          title: message,
          description: message,
          severity,
          timestamp,
        })
      }

      const rawIssues = Array.isArray(payload?.issues) ? payload.issues : Array.isArray(payload?.alerts) ? payload.alerts : null

      if (rawIssues && rawIssues.length > 0) {
        rawIssues.forEach((entry: any, index: number) => pushIssue(entry, index))
      } else if (payload?.message || payload?.description || payload?.text) {
        pushIssue(payload, 0)
      }

      if (issues.length === 0) {
        return []
      }

      return convertComplianceResponse(issues)
    },
    [convertComplianceResponse],
  )

  const normalizeLiveCodeSuggestions = useCallback((payload: any): LiveCodeSuggestion[] => {
    if (!payload) {
      return []
    }

    const now = Date.now()
    const entries = Array.isArray(payload?.suggestions) && payload.suggestions.length > 0 ? payload.suggestions : [payload]

    const suggestions: LiveCodeSuggestion[] = []

    entries.forEach((entry: any, index: number) => {
      if (!entry) {
        return
      }

      const codeSource =
        typeof entry.code === "string" && entry.code.trim().length > 0
          ? entry.code.trim()
          : typeof entry.codeValue === "string" && entry.codeValue.trim().length > 0
            ? entry.codeValue.trim()
            : typeof entry.code_id === "string" && entry.code_id.trim().length > 0
              ? entry.code_id.trim()
              : typeof entry.icd === "string" && entry.icd.trim().length > 0
                ? entry.icd.trim()
                : typeof payload.code === "string" && payload.code.trim().length > 0
                  ? payload.code.trim()
                  : ""

      const descriptionSource =
        typeof entry.description === "string" && entry.description.trim().length > 0
          ? entry.description.trim()
          : typeof entry.title === "string" && entry.title.trim().length > 0
            ? entry.title.trim()
            : typeof payload.description === "string" && payload.description.trim().length > 0
              ? payload.description.trim()
              : ""

      const rationaleSource =
        typeof entry.rationale === "string" && entry.rationale.trim().length > 0
          ? entry.rationale.trim()
          : typeof entry.reasoning === "string" && entry.reasoning.trim().length > 0
            ? entry.reasoning.trim()
            : typeof payload.rationale === "string" && payload.rationale.trim().length > 0
              ? payload.rationale.trim()
              : typeof payload.reasoning === "string" && payload.reasoning.trim().length > 0
                ? payload.reasoning.trim()
                : descriptionSource

      if (!codeSource && !descriptionSource && !rationaleSource) {
        return
      }

      const idSource = entry.id ?? entry.suggestionId ?? entry.eventId ?? entry.event_id ?? entry.code ?? entry.codeValue ?? payload.eventId ?? `${now}-${index}`

      const confidenceSource =
        typeof entry.confidence === "number"
          ? entry.confidence
          : typeof payload.confidence === "number"
            ? payload.confidence
            : typeof entry.confidence === "string"
              ? Number.parseFloat(entry.confidence)
              : typeof payload.confidence === "string"
                ? Number.parseFloat(payload.confidence)
                : undefined

      const typeSource =
        typeof entry.type === "string" && entry.type.trim().length > 0 ? entry.type.trim() : typeof payload.type === "string" && payload.type.trim().length > 0 ? payload.type.trim() : undefined

      const categorySource =
        typeof entry.category === "string" && entry.category.trim().length > 0
          ? entry.category.trim()
          : typeof payload.category === "string" && payload.category.trim().length > 0
            ? payload.category.trim()
            : undefined

      const sourceLabel =
        typeof entry.source === "string" && entry.source.trim().length > 0
          ? entry.source.trim()
          : typeof payload.source === "string" && payload.source.trim().length > 0
            ? payload.source.trim()
            : undefined

      suggestions.push({
        id: String(idSource),
        code: codeSource || undefined,
        description: descriptionSource || undefined,
        rationale: rationaleSource || undefined,
        type: typeSource,
        confidence: typeof confidenceSource === "number" && Number.isFinite(confidenceSource) ? confidenceSource : undefined,
        category: categorySource || undefined,
        source: sourceLabel || undefined,
        receivedAt: now,
      })
    })

    return suggestions
  }, [])

  const normalizeCollaborator = useCallback((entry: any): CollaborationPresence | null => {
    if (!entry) {
      return null
    }

    if (typeof entry === "string") {
      const trimmed = entry.trim()
      if (!trimmed) {
        return null
      }
      return { id: trimmed, name: trimmed, lastSeen: Date.now() }
    }

    if (typeof entry !== "object") {
      return null
    }

    const identifier = entry.userId ?? entry.id ?? entry.user ?? entry.email ?? entry.handle ?? entry.participantId ?? entry.name

    if (!identifier) {
      return null
    }

    const nameSource = entry.displayName ?? entry.name ?? entry.fullName ?? identifier
    const roleSource = entry.role ?? entry.title ?? entry.position ?? null
    const statusSource = entry.status ?? entry.presence ?? entry.state ?? null

    return {
      id: String(identifier),
      name: typeof nameSource === "string" ? nameSource : String(identifier),
      role: typeof roleSource === "string" ? roleSource : undefined,
      status: typeof statusSource === "string" ? statusSource : undefined,
      lastSeen: Date.now(),
    }
  }, [])

  const streamBaseParams = useMemo(() => {
    const sessionIdValue =
      typeof visitSession?.sessionId === "number"
        ? String(visitSession.sessionId)
        : typeof visitSession?.sessionId === "string" && visitSession.sessionId.trim().length > 0
          ? visitSession.sessionId.trim()
          : null

    const encounterValue = (() => {
      if (typeof visitSession?.encounterId === "string" && visitSession.encounterId.trim().length > 0) {
        return visitSession.encounterId.trim()
      }
      if (typeof encounterId === "string" && encounterId.trim().length > 0) {
        return encounterId.trim()
      }
      return null
    })()

    const patientValue = (() => {
      if (typeof visitSession?.patientId === "string" && visitSession.patientId.trim().length > 0) {
        return visitSession.patientId.trim()
      }
      if (typeof patientId === "string" && patientId.trim().length > 0) {
        return patientId.trim()
      }
      return null
    })()

    const noteValue = typeof noteId === "string" && noteId.trim().length > 0 ? noteId.trim() : null

    return {
      sessionId: sessionIdValue,
      encounterId: encounterValue,
      patientId: patientValue,
      noteId: noteValue,
    }
  }, [visitSession?.sessionId, visitSession?.encounterId, visitSession?.patientId, encounterId, patientId, noteId])

  const buildStreamUrl = useCallback(
    (path: string) => {
      const base = resolveWebsocketUrl(path)
      const target = new URL(base)
      const token = getStoredToken()
      if (token) {
        target.searchParams.set("token", token)
      }
      if (streamBaseParams.sessionId) {
        target.searchParams.set("visit_session_id", streamBaseParams.sessionId)
      }
      if (streamBaseParams.encounterId) {
        target.searchParams.set("encounter_id", streamBaseParams.encounterId)
      }
      if (streamBaseParams.patientId) {
        target.searchParams.set("patient_id", streamBaseParams.patientId)
      }
      if (streamBaseParams.noteId) {
        target.searchParams.set("note_id", streamBaseParams.noteId)
      }
      return { url: target, token }
    },
    [streamBaseParams],
  )

  const processTranscriptionPacket = useCallback(
    (payload: unknown): TranscriptNormalizationResult => {
      const result = normalizeTranscriptStreamPayload(payload, transcriptIdCounterRef)

      if (result.mode === "clear") {
        transcriptIdCounterRef.current = 0
        setTranscriptEntries([])
      } else if (result.mode === "replace") {
        transcriptIdCounterRef.current = result.entries.length
        setTranscriptEntries(result.entries.slice())
      } else if (result.entries.length > 0) {
        setTranscriptEntries((prev) => {
          const previous = Array.isArray(prev) ? prev : []
          const map = new Map(previous.map((entry) => [entry.id, entry]))
          for (const entry of result.entries) {
            map.set(entry.id, entry)
          }
          const next = Array.from(map.values())
          next.sort((a, b) => a.timestamp - b.timestamp)
          return next
        })
      }

      if (result.snap) {
        setShouldSnapTranscriptToEnd(true)
      }

      return result
    },
    [setTranscriptEntries, setShouldSnapTranscriptToEnd, transcriptIdCounterRef],
  )

  useEffect(() => {
    const keyParts = [
      streamBaseParams.sessionId ?? "",
      streamBaseParams.encounterId ?? "",
      streamBaseParams.patientId ?? "",
      streamBaseParams.noteId ?? "",
    ]
    const nextKey = keyParts.join("|")
    const previousKey = previousTranscriptionStreamKeyRef.current
    if (previousKey !== null && previousKey !== nextKey) {
      transcriptIdCounterRef.current = 0
      setTranscriptEntries([])
      setShouldSnapTranscriptToEnd(true)
    }
    previousTranscriptionStreamKeyRef.current = nextKey
  }, [
    streamBaseParams.encounterId,
    streamBaseParams.noteId,
    streamBaseParams.patientId,
    streamBaseParams.sessionId,
  ])

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined
    }

    if (!streamBaseParams.sessionId) {
      if (transcriptionReconnectTimerRef.current) {
        clearTimeout(transcriptionReconnectTimerRef.current)
        transcriptionReconnectTimerRef.current = null
      }
      const socket = transcriptionSocketRef.current
      if (socket) {
        try {
          socket.onopen = null
          socket.onclose = null
          socket.onerror = null
          socket.onmessage = null
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // ignore cleanup errors
        }
      }
      transcriptionSocketRef.current = null
      transcriptionAttemptsRef.current = 0
      clearTranscriptionStreamError()
      return () => undefined
    }

    let cancelled = false

    const cleanupTimer = () => {
      if (transcriptionReconnectTimerRef.current) {
        clearTimeout(transcriptionReconnectTimerRef.current)
        transcriptionReconnectTimerRef.current = null
      }
    }

    const closeSocket = () => {
      const socket = transcriptionSocketRef.current
      if (socket) {
        try {
          socket.onopen = null
          socket.onclose = null
          socket.onerror = null
          socket.onmessage = null
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // ignore cleanup errors
        }
      }
      transcriptionSocketRef.current = null
    }

    const scheduleReconnect = (message?: string) => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      const attempt = transcriptionAttemptsRef.current + 1
      transcriptionAttemptsRef.current = attempt
      const delay = Math.min(15_000, Math.max(500, 500 * Math.min(attempt, 6)))
      setTranscriptionStreamError(message)
      transcriptionReconnectTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      closeSocket()

      const { url, token } = buildStreamUrl("/ws/transcription")
      try {
        const socket =
          token != null ? new WebSocket(url.toString(), ["authorization", `Bearer ${token}`]) : new WebSocket(url.toString())

        transcriptionSocketRef.current = socket

        socket.onopen = () => {
          if (cancelled) {
            return
          }
          transcriptionAttemptsRef.current = 0
          clearTranscriptionStreamError()
        }

        socket.onmessage = async (event) => {
          if (cancelled) {
            return
          }
          try {
            const decoded = await decodeWebsocketData(event.data)
            processTranscriptionPacket(decoded)
            clearTranscriptionStreamError()
          } catch (error) {
            console.error("Failed to process transcription stream payload", error)
          }
        }

        socket.onerror = () => {
          if (cancelled) {
            return
          }
          setTranscriptionStreamError()
        }

        socket.onclose = () => {
          transcriptionSocketRef.current = null
          if (cancelled) {
            return
          }
          scheduleReconnect()
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : undefined
        scheduleReconnect(message)
      }
    }

    transcriptionAttemptsRef.current = 0
    connect()

    return () => {
      cancelled = true
      cleanupTimer()
      closeSocket()
    }
  }, [
    buildStreamUrl,
    clearTranscriptionStreamError,
    processTranscriptionPacket,
    setTranscriptionStreamError,
    streamBaseParams.encounterId,
    streamBaseParams.noteId,
    streamBaseParams.patientId,
    streamBaseParams.sessionId,
  ])

  const convertWizardIssuesToCompliance = useCallback((issues?: Record<string, unknown>): ComplianceIssue[] => {
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
            : categoryKey === "codes" || categoryKey === "diagnoses" || categoryKey === "differentials" || categoryKey === "prevention"
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
          dismissed: false,
        })
      })
    })

    return normalized
  }, [])

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

      const payload: Record<string, unknown> = {
        patientId: trimmedPatientId,
        encounterId: encounterId.trim().length > 0 ? encounterId.trim() : undefined,
      }
      const contentPayload = typeof contentOverride === "string" ? contentOverride : noteContentRef.current
      if (typeof contentPayload === "string" && contentPayload.length > 0) {
        payload.content = contentPayload
      }
      const createPromise = (async () => {
        try {
          const response = await fetchWithAuth("/api/notes/drafts", {
            method: "POST",
            jsonBody: payload,
          })
          if (!response.ok) {
            throw new Error(`Failed to create note (${response.status})`)
          }
          const data = await response.json()
          const createdId =
            data?.draftId != null
              ? String(data.draftId)
              : data?.noteId != null
                ? String(data.noteId)
                : data?.note_id != null
                  ? String(data.note_id)
                  : null
          if (!createdId) {
            throw new Error("Note identifier missing from response")
          }
          setNoteId(createdId)
          const serverContent = typeof data?.content === "string" ? data.content : undefined
          if (typeof serverContent === "string") {
            if (noteContentRef.current !== serverContent) {
              setNoteContent(serverContent)
              noteContentRef.current = serverContent
              autoSaveLastContentRef.current = serverContent
              if (onNoteContentChange) {
                onNoteContentChange(serverContent)
              }
            } else {
              autoSaveLastContentRef.current = serverContent
            }
          }
          const createdAt =
            typeof data?.createdAt === "string" && data.createdAt.trim().length > 0
              ? data.createdAt
              : new Date().toISOString()
          const version =
            typeof data?.version === "number" && Number.isFinite(data.version) ? data.version : null
          setLastAutoSaveTime(createdAt)
          setLastAutoSaveVersion(version)
          setAutoSaveError(null)
          return createdId
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to create a draft note"
          setAutoSaveError(message)
          throw error
        } finally {
          noteCreatePromiseRef.current = null
        }
      })()

      noteCreatePromiseRef.current = createPromise
      return createPromise
    },
    [encounterId, fetchWithAuth, noteContentRef, noteId, onNoteContentChange, patientId, setLastAutoSaveTime, setLastAutoSaveVersion],
  )

  const performAutoSave = useCallback(
    async (options?: PerformAutoSaveOptions): Promise<boolean> => {
      const { reason = "debounced", contentOverride, noteIdOverride, force = false } = options ?? {}

      if (isFinalized) {
        return false
      }

      const trimmedPatientId = patientId.trim()
      if (!trimmedPatientId) {
        return false
      }

      const content = typeof contentOverride === "string" ? contentOverride : (noteContentRef.current ?? "")

      if (!force && content === autoSaveLastContentRef.current) {
        return false
      }

      if (autoSavePromiseRef.current) {
        if (force || reason === "manual") {
          try {
            await autoSavePromiseRef.current
          } catch {
            // Ignore previous failure so we can attempt again immediately.
          }
        } else {
          return false
        }
      }

      const run = (async () => {
        setAutoSaveInFlight(true)
        try {
          const ensuredId = noteIdOverride ?? noteId ?? (await ensureNoteCreated(content))
          if (!ensuredId) {
            throw new Error("Unable to determine note identifier")
          }

          const noteIdString = String(ensuredId)
          const body: Record<string, unknown> = { content }
          if (lastAutoSaveVersion != null) {
            body.version = lastAutoSaveVersion
          }
          const response = await fetchWithAuth(`/api/notes/drafts/${encodeURIComponent(noteIdString)}`, {
            method: "PATCH",
            jsonBody: body,
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
              // Ignore body parsing errors
            }
            throw new Error(message)
          }

          const data = await response.json().catch(() => ({}))
          const version = typeof data?.version === "number" && Number.isFinite(data.version) ? data.version : null
          const updatedAt =
            typeof data?.updatedAt === "string" && data.updatedAt.trim().length > 0
              ? data.updatedAt
              : new Date().toISOString()

          autoSaveLastContentRef.current = content
          setLastAutoSaveTime(updatedAt)
          setLastAutoSaveVersion(version)
          setAutoSaveError(null)
          const returnedId =
            data?.draftId != null
              ? String(data.draftId)
              : data?.noteId != null
                ? String(data.noteId)
                : data?.note_id != null
                  ? String(data.note_id)
                  : noteIdString
          if (!noteId || noteId !== returnedId) {
            setNoteId(returnedId)
          }
          return true
        } catch (error) {
          setAutoSaveError(error instanceof Error ? error.message : "Unable to auto-save note")
          return false
        } finally {
          setAutoSaveInFlight(false)
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
            autoSaveTimeoutRef.current = null
          }
        }
      })()

      autoSavePromiseRef.current = run
      try {
        return await run
      } finally {
        if (autoSavePromiseRef.current === run) {
          autoSavePromiseRef.current = null
        }
      }
    },
    [ensureNoteCreated, fetchWithAuth, isFinalized, lastAutoSaveVersion, noteId, patientId],
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
      mediaStreamRef.current.getTracks().forEach((track) => {
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
    setShouldSnapTranscriptToEnd(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined
    }

    if (!streamBaseParams.sessionId) {
      if (complianceReconnectTimerRef.current) {
        clearTimeout(complianceReconnectTimerRef.current)
        complianceReconnectTimerRef.current = null
      }
      if (complianceSocketRef.current) {
        try {
          complianceSocketRef.current.close()
        } catch {
          // ignore
        }
        complianceSocketRef.current = null
      }
      complianceAttemptsRef.current = 0
      setComplianceStreamState((prev) => ({
        status: "idle",
        attempts: 0,
        lastError: null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: null,
      }))
      return () => undefined
    }

    let cancelled = false

    const cleanupTimer = () => {
      if (complianceReconnectTimerRef.current) {
        clearTimeout(complianceReconnectTimerRef.current)
        complianceReconnectTimerRef.current = null
      }
    }

    const closeSocket = () => {
      const socket = complianceSocketRef.current
      if (socket) {
        try {
          socket.onopen = null
          socket.onclose = null
          socket.onerror = null
          socket.onmessage = null
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // ignore
        }
      }
      complianceSocketRef.current = null
    }

    const scheduleReconnect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      const attempt = complianceAttemptsRef.current + 1
      complianceAttemptsRef.current = attempt
      const delay = Math.min(30_000, Math.max(1_000, 1_000 * 2 ** Math.min(attempt, 5)))
      setComplianceStreamState((prev) => ({
        status: "closed",
        attempts: attempt,
        lastError: prev.lastError ?? null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: delay,
      }))
      complianceReconnectTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setComplianceStreamState((prev) => ({
          status: "connecting",
          attempts: complianceAttemptsRef.current,
          lastError: prev.lastError ?? null,
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: null,
        }))
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      closeSocket()

      const { url, token } = buildStreamUrl("/ws/compliance")
      try {
        const socket = token != null ? new WebSocket(url.toString(), ["authorization", `Bearer ${token}`]) : new WebSocket(url.toString())

        complianceSocketRef.current = socket

        socket.onopen = () => {
          if (cancelled) {
            return
          }
          complianceAttemptsRef.current = 0
          setComplianceStreamState({
            status: "open",
            attempts: 0,
            lastError: null,
            lastConnectedAt: Date.now(),
            nextRetryDelayMs: null,
          })
          setComplianceLoading(false)
          setComplianceError(null)
        }

        socket.onmessage = async (event) => {
          if (cancelled) {
            return
          }
          try {
            const rawData = typeof event.data === "string" ? event.data : event.data instanceof Blob ? await event.data.text() : new TextDecoder().decode(event.data as ArrayBuffer)
            const payload = JSON.parse(rawData)
            if (payload?.event === "connected") {
              return
            }
            const normalized = normalizeComplianceStreamPayload(payload)
            if (normalized.length === 0) {
              return
            }
            setComplianceIssues((prev) => {
              const dismissed = new Map(prev.map((issue) => [issue.id, issue.dismissed]))
              const map = new Map(prev.map((issue) => [issue.id, issue]))
              normalized.forEach((issue) => {
                map.set(issue.id, {
                  ...issue,
                  dismissed: dismissed.get(issue.id) ?? issue.dismissed ?? false,
                })
              })
              return Array.from(map.values()).slice(-STREAM_HISTORY_LIMIT)
            })
            lastComplianceInputRef.current = createComplianceSignature(noteContentRef.current ?? "", complianceCodeValues)
            setComplianceError(null)
            setComplianceLoading(false)
          } catch (error) {
            console.error("Failed to process compliance stream payload", error)
            setComplianceStreamState((prev) => ({
              ...prev,
              status: prev.status === "open" ? prev.status : "error",
              lastError: error instanceof Error ? error.message : "Failed to parse compliance stream payload",
            }))
          }
        }

        socket.onerror = (event) => {
          if (cancelled) {
            return
          }
          const message = event instanceof Event ? "Compliance stream error" : ((event as ErrorEvent)?.message ?? "Compliance stream error")
          setComplianceStreamState((prev) => ({
            ...prev,
            status: "error",
            lastError: message,
          }))
          try {
            socket.close()
          } catch {
            // ignore
          }
        }

        socket.onclose = () => {
          complianceSocketRef.current = null
          if (cancelled) {
            return
          }
          scheduleReconnect()
        }
      } catch (error) {
        setComplianceStreamState((prev) => ({
          status: "error",
          attempts: complianceAttemptsRef.current,
          lastError: error instanceof Error ? error.message : "Unable to open compliance stream",
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: prev.nextRetryDelayMs ?? null,
        }))
        scheduleReconnect()
      }
    }

    complianceAttemptsRef.current = 0
    setComplianceStreamState((prev) => ({
      status: "connecting",
      attempts: 0,
      lastError: prev.lastError ?? null,
      lastConnectedAt: prev.lastConnectedAt ?? null,
      nextRetryDelayMs: null,
    }))
    connect()

    return () => {
      cancelled = true
      cleanupTimer()
      closeSocket()
    }
  }, [buildStreamUrl, normalizeComplianceStreamPayload, streamBaseParams.sessionId, complianceCodeValues])

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined
    }

    if (!streamBaseParams.sessionId) {
      if (codesReconnectTimerRef.current) {
        clearTimeout(codesReconnectTimerRef.current)
        codesReconnectTimerRef.current = null
      }
      if (codesSocketRef.current) {
        try {
          codesSocketRef.current.close()
        } catch {
          // ignore
        }
        codesSocketRef.current = null
      }
      codesAttemptsRef.current = 0
      setLiveCodeSuggestions([])
      setCodeStreamState((prev) => ({
        status: "idle",
        attempts: 0,
        lastError: null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: null,
      }))
      return () => undefined
    }

    let cancelled = false

    const cleanupTimer = () => {
      if (codesReconnectTimerRef.current) {
        clearTimeout(codesReconnectTimerRef.current)
        codesReconnectTimerRef.current = null
      }
    }

    const closeSocket = () => {
      const socket = codesSocketRef.current
      if (socket) {
        try {
          socket.onopen = null
          socket.onclose = null
          socket.onerror = null
          socket.onmessage = null
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // ignore
        }
      }
      codesSocketRef.current = null
    }

    const scheduleReconnect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      const attempt = codesAttemptsRef.current + 1
      codesAttemptsRef.current = attempt
      const delay = Math.min(30_000, Math.max(1_000, 1_000 * 2 ** Math.min(attempt, 5)))
      setCodeStreamState((prev) => ({
        status: "closed",
        attempts: attempt,
        lastError: prev.lastError ?? null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: delay,
      }))
      codesReconnectTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setCodeStreamState((prev) => ({
          status: "connecting",
          attempts: codesAttemptsRef.current,
          lastError: prev.lastError ?? null,
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: null,
        }))
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      closeSocket()

      const { url, token } = buildStreamUrl("/ws/codes")
      try {
        const socket = token != null ? new WebSocket(url.toString(), ["authorization", `Bearer ${token}`]) : new WebSocket(url.toString())

        codesSocketRef.current = socket

        socket.onopen = () => {
          if (cancelled) {
            return
          }
          codesAttemptsRef.current = 0
          setCodeStreamState({
            status: "open",
            attempts: 0,
            lastError: null,
            lastConnectedAt: Date.now(),
            nextRetryDelayMs: null,
          })
        }

        socket.onmessage = async (event) => {
          if (cancelled) {
            return
          }
          try {
            const rawData = typeof event.data === "string" ? event.data : event.data instanceof Blob ? await event.data.text() : new TextDecoder().decode(event.data as ArrayBuffer)
            const payload = JSON.parse(rawData)
            if (payload?.event === "connected") {
              return
            }
            const normalized = normalizeLiveCodeSuggestions(payload)
            if (!normalized.length) {
              return
            }
            setLiveCodeSuggestions((prev) => {
              const map = new Map(prev.map((item) => [item.id, item]))
              normalized.forEach((item) => {
                map.set(item.id, item)
              })
              return Array.from(map.values())
                .sort((a, b) => a.receivedAt - b.receivedAt)
                .slice(-STREAM_HISTORY_LIMIT)
            })
            setCodeStreamState((prev) => ({
              ...prev,
              lastError: null,
            }))
          } catch (error) {
            console.error("Failed to process codes stream payload", error)
            setCodeStreamState((prev) => ({
              ...prev,
              status: prev.status === "open" ? prev.status : "error",
              lastError: error instanceof Error ? error.message : "Failed to parse codes stream payload",
            }))
          }
        }

        socket.onerror = (event) => {
          if (cancelled) {
            return
          }
          const message = event instanceof Event ? "Code suggestion stream error" : ((event as ErrorEvent)?.message ?? "Code suggestion stream error")
          setCodeStreamState((prev) => ({
            ...prev,
            status: "error",
            lastError: message,
          }))
          try {
            socket.close()
          } catch {
            // ignore
          }
        }

        socket.onclose = () => {
          codesSocketRef.current = null
          if (cancelled) {
            return
          }
          scheduleReconnect()
        }
      } catch (error) {
        setCodeStreamState((prev) => ({
          status: "error",
          attempts: codesAttemptsRef.current,
          lastError: error instanceof Error ? error.message : "Unable to open codes stream",
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: prev.nextRetryDelayMs ?? null,
        }))
        scheduleReconnect()
      }
    }

    codesAttemptsRef.current = 0
    setCodeStreamState((prev) => ({
      status: "connecting",
      attempts: 0,
      lastError: prev.lastError ?? null,
      lastConnectedAt: prev.lastConnectedAt ?? null,
      nextRetryDelayMs: null,
    }))
    connect()

    return () => {
      cancelled = true
      cleanupTimer()
      closeSocket()
    }
  }, [buildStreamUrl, normalizeLiveCodeSuggestions, streamBaseParams.sessionId])

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined
    }

    if (!streamBaseParams.sessionId) {
      if (collaborationReconnectTimerRef.current) {
        clearTimeout(collaborationReconnectTimerRef.current)
        collaborationReconnectTimerRef.current = null
      }
      if (collaborationSocketRef.current) {
        try {
          collaborationSocketRef.current.close()
        } catch {
          // ignore
        }
        collaborationSocketRef.current = null
      }
      collaborationAttemptsRef.current = 0
      setCollaborationParticipants([])
      setCollaborationConflicts([])
      setCollaborationStatus(null)
      setCollaborationStreamState((prev) => ({
        status: "idle",
        attempts: 0,
        lastError: null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: null,
      }))
      return () => undefined
    }

    let cancelled = false

    const cleanupTimer = () => {
      if (collaborationReconnectTimerRef.current) {
        clearTimeout(collaborationReconnectTimerRef.current)
        collaborationReconnectTimerRef.current = null
      }
    }

    const closeSocket = () => {
      const socket = collaborationSocketRef.current
      if (socket) {
        try {
          socket.onopen = null
          socket.onclose = null
          socket.onerror = null
          socket.onmessage = null
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
          }
        } catch {
          // ignore
        }
      }
      collaborationSocketRef.current = null
    }

    const scheduleReconnect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      const attempt = collaborationAttemptsRef.current + 1
      collaborationAttemptsRef.current = attempt
      const delay = Math.min(30_000, Math.max(1_000, 1_000 * 2 ** Math.min(attempt, 5)))
      setCollaborationStreamState((prev) => ({
        status: "closed",
        attempts: attempt,
        lastError: prev.lastError ?? null,
        lastConnectedAt: prev.lastConnectedAt ?? null,
        nextRetryDelayMs: delay,
      }))
      collaborationReconnectTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setCollaborationStreamState((prev) => ({
          status: "connecting",
          attempts: collaborationAttemptsRef.current,
          lastError: prev.lastError ?? null,
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: null,
        }))
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) {
        return
      }
      cleanupTimer()
      closeSocket()

      const { url, token } = buildStreamUrl("/ws/collaboration")
      try {
        const socket = token != null ? new WebSocket(url.toString(), ["authorization", `Bearer ${token}`]) : new WebSocket(url.toString())

        collaborationSocketRef.current = socket

        socket.onopen = () => {
          if (cancelled) {
            return
          }
          collaborationAttemptsRef.current = 0
          setCollaborationStreamState({
            status: "open",
            attempts: 0,
            lastError: null,
            lastConnectedAt: Date.now(),
            nextRetryDelayMs: null,
          })
        }

        socket.onmessage = async (event) => {
          if (cancelled) {
            return
          }
          try {
            const rawData = typeof event.data === "string" ? event.data : event.data instanceof Blob ? await event.data.text() : new TextDecoder().decode(event.data as ArrayBuffer)
            const payload = JSON.parse(rawData)
            if (payload?.event === "connected") {
              return
            }

            if (payload?.event === "collaboration_clear" || payload?.presence === "clear") {
              setCollaborationParticipants([])
            }

            const participantList = Array.isArray(payload?.participants)
              ? payload.participants
              : Array.isArray(payload?.users)
                ? payload.users
                : Array.isArray(payload?.presence)
                  ? payload.presence
                  : null

            if (participantList) {
              const normalizedList = participantList.map((entry: any) => normalizeCollaborator(entry)).filter((entry): entry is CollaborationPresence => Boolean(entry))
              if (normalizedList.length > 0) {
                setCollaborationParticipants(normalizedList)
              } else if (payload?.presence === "clear") {
                setCollaborationParticipants([])
              }
            } else {
              const collaborator = normalizeCollaborator(payload)
              if (collaborator) {
                setCollaborationParticipants((prev) => {
                  const map = new Map(prev.map((person) => [person.id, person]))
                  map.set(collaborator.id, collaborator)
                  return Array.from(map.values())
                })
              }
            }

            if (payload?.event === "collaboration_left" && (payload.userId || payload.user)) {
              const departing = String(payload.userId ?? payload.user)
              setCollaborationParticipants((prev) => prev.filter((person) => person.id !== departing))
            }

            if (payload?.conflicts !== undefined) {
              const conflicts = Array.isArray(payload.conflicts) ? payload.conflicts : payload.conflicts ? [payload.conflicts] : []
              setCollaborationConflicts(
                conflicts
                  .map((value) => (typeof value === "string" ? value.trim() : ""))
                  .filter((value): value is string => value.length > 0)
                  .slice(-STREAM_HISTORY_LIMIT),
              )
            } else if (payload?.event === "collaboration_resolved" || payload?.event === "collaboration_sync") {
              setCollaborationConflicts([])
            }

            if (typeof payload?.status === "string" && payload.status.trim().length > 0) {
              setCollaborationStatus(payload.status.trim())
            }

            setCollaborationStreamState((prev) => ({
              ...prev,
              lastError: null,
            }))
          } catch (error) {
            console.error("Failed to process collaboration stream payload", error)
            setCollaborationStreamState((prev) => ({
              ...prev,
              status: prev.status === "open" ? prev.status : "error",
              lastError: error instanceof Error ? error.message : "Failed to parse collaboration stream payload",
            }))
          }
        }

        socket.onerror = (event) => {
          if (cancelled) {
            return
          }
          const message = event instanceof Event ? "Collaboration stream error" : ((event as ErrorEvent)?.message ?? "Collaboration stream error")
          setCollaborationStreamState((prev) => ({
            ...prev,
            status: "error",
            lastError: message,
          }))
          try {
            socket.close()
          } catch {
            // ignore
          }
        }

        socket.onclose = () => {
          collaborationSocketRef.current = null
          if (cancelled) {
            return
          }
          scheduleReconnect()
        }
      } catch (error) {
        setCollaborationStreamState((prev) => ({
          status: "error",
          attempts: collaborationAttemptsRef.current,
          lastError: error instanceof Error ? error.message : "Unable to open collaboration stream",
          lastConnectedAt: prev.lastConnectedAt ?? null,
          nextRetryDelayMs: prev.nextRetryDelayMs ?? null,
        }))
        scheduleReconnect()
      }
    }

    collaborationAttemptsRef.current = 0
    setCollaborationStreamState((prev) => ({
      status: "connecting",
      attempts: 0,
      lastError: prev.lastError ?? null,
      lastConnectedAt: prev.lastConnectedAt ?? null,
      nextRetryDelayMs: null,
    }))
    connect()

    return () => {
      cancelled = true
      cleanupTimer()
      closeSocket()
    }
  }, [buildStreamUrl, normalizeCollaborator, streamBaseParams.sessionId])

  useEffect(() => {
    const incomingId = initialNoteData?.noteId ?? null
    const incomingContent = initialNoteData?.content ?? ""
    const prevId = prevInitialNoteIdRef.current
    const prevContent = prevInitialContentRef.current

    if (
      incomingId === prevId &&
      incomingContent === prevContent &&
      initialNoteData?.patientId === prevInitialPatientIdRef.current &&
      initialNoteData?.encounterId === prevInitialEncounterIdRef.current &&
      initialNoteData?.patientName === prevInitialPatientNameRef.current
    ) {
      if (!initialNoteData) {
        return
      }
      return
    }

    prevInitialNoteIdRef.current = incomingId
    prevInitialContentRef.current = incomingContent
    prevInitialPatientIdRef.current = initialNoteData?.patientId
    prevInitialEncounterIdRef.current = initialNoteData?.encounterId
    prevInitialPatientNameRef.current = initialNoteData?.patientName
    noteCreatePromiseRef.current = null
    queuedAudioChunksRef.current = []
    setNoteId(incomingId)
    setIsFinalized(false)
    setShowFinalizationWizard(false)
    setLastAutoSaveTime(null)
    setAutoSaveError(null)
    setSaveDraftError(null)
    setVisitSession({})
    setVisitStarted(false)
    setHasEverStarted(false)
    setVisitLoading(false)
    setVisitError(null)
    setCurrentSessionTime(0)
    setPausedTime(initialRecordedSeconds)
    setTranscriptEntries([])
    setTranscriptSearch("")
    transcriptIdCounterRef.current = 0
    setTranscriptionIndex(-1)
    setTranscriptionError(null)
    setComplianceIssues([])
    setComplianceError(null)
    setComplianceLoading(false)
    setPatientSuggestions([])
    setIsPatientDropdownOpen(false)
    setPatientSearchError(null)
    setPatientSearchLoading(false)
    setPatientDetails(null)
    stopAudioStream()

    const patientIdValue = initialNoteData?.patientId ?? ""
    const encounterValue = initialNoteData?.encounterId ?? ""
    setPatientId(patientIdValue)
    setPatientInputValue(patientIdValue || initialNoteData?.patientName || "")
    setEncounterId(encounterValue)
    setEncounterValidation({ status: encounterValue ? "loading" : "idle" })

    if (initialNoteData?.patientName || patientIdValue) {
      setSelectedPatient({
        patientId: patientIdValue || initialNoteData?.patientName || "",
        name: initialNoteData?.patientName,
        source: "local",
      })
    } else {
      setSelectedPatient(null)
    }

    setNoteContent(incomingContent)
    noteContentRef.current = incomingContent
    autoSaveLastContentRef.current = incomingContent
    lastComplianceInputRef.current = createComplianceSignature(incomingContent, complianceCodeValues)
    if (onNoteContentChange) {
      onNoteContentChange(incomingContent)
    }
  }, [initialNoteData, initialRecordedSeconds, stopAudioStream, complianceCodeValues, onNoteContentChange])

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
      const ws = protocols ? new WebSocket(wsTarget.toString(), protocols) : new WebSocket(wsTarget.toString())
      websocketRef.current = ws

      ws.onopen = () => {
        clearTranscriptionStreamError()
        if (queuedAudioChunksRef.current.length) {
          for (const chunk of queuedAudioChunksRef.current) {
            ws.send(chunk)
          }
          queuedAudioChunksRef.current = []
        }
      }

      ws.onmessage = async (event) => {
        try {
          const decoded = await decodeWebsocketData(event.data)
          processTranscriptionPacket(decoded)
          clearTranscriptionStreamError()
        } catch (error) {
          console.error("Failed to parse transcript payload", error)
        }
      }

      ws.onerror = () => {
        setTranscriptionStreamError()
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
        stream.getTracks().forEach((track) => {
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
      setTranscriptionError(error instanceof Error ? error.message : "Unable to access microphone")
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
    if (!noteId && patientId.trim().length > 0 && (noteContentRef.current?.trim()?.length ?? 0) > 0) {
      void ensureNoteCreated(noteContentRef.current).catch(() => {})
    }
  }, [patientId, noteId, ensureNoteCreated])

  useEffect(() => {
    if (initialNoteData) {
      prevPrePopulatedRef.current = prePopulatedPatient ?? null
      return
    }

    const previous = prevPrePopulatedRef.current
    const next = prePopulatedPatient ?? null
    if (previous?.patientId === next?.patientId && previous?.encounterId === next?.encounterId) {
      return
    }

    prevPrePopulatedRef.current = next
    const nextPatientId = next?.patientId ?? ""
    const nextEncounterId = next?.encounterId ?? ""
    setPatientId(nextPatientId)
    setPatientInputValue(nextPatientId)
    setEncounterId(nextEncounterId)
    setEncounterValidation({ status: nextEncounterId ? "loading" : "idle" })
  }, [prePopulatedPatient, initialNoteData])

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
          signal: controller.signal,
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
              insurance: typeof patient?.insurance === "string" && patient.insurance.trim().length > 0 ? patient.insurance.trim() : undefined,
              lastVisit: typeof patient?.lastVisit === "string" && patient.lastVisit.trim().length > 0 ? patient.lastVisit.trim() : undefined,
              allergies: Array.isArray(patient?.allergies)
                ? patient.allergies.map((item: unknown) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : "")).filter((item: string) => item.length > 0)
                : undefined,
              medications: Array.isArray(patient?.medications)
                ? patient.medications.map((item: unknown) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : "")).filter((item: string) => item.length > 0)
                : undefined,
              source: "local",
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
              insurance: typeof patient?.insurance === "string" && patient.insurance.trim().length > 0 ? patient.insurance.trim() : undefined,
              lastVisit: typeof patient?.lastVisit === "string" && patient.lastVisit.trim().length > 0 ? patient.lastVisit.trim() : undefined,
              allergies: Array.isArray(patient?.allergies)
                ? patient.allergies.map((item: unknown) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : "")).filter((item: string) => item.length > 0)
                : undefined,
              medications: Array.isArray(patient?.medications)
                ? patient.medications.map((item: unknown) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : "")).filter((item: string) => item.length > 0)
                : undefined,
              source: "external",
            }))
          : []
        const combined = [...local, ...external].filter((suggestion) => suggestion.patientId)
        setPatientSuggestions(combined.slice(0, 10))
        setIsPatientDropdownOpen(true)
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setPatientSuggestions([])
        setPatientSearchError(error instanceof Error ? error.message : "Unable to search patients")
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
          .map((item) => {
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
          returnNullOnEmpty: true,
        })
        if (controller.signal.aborted) {
          return
        }
        if (!data) {
          setPatientDetails(null)
          return
        }

        setPatientDetails(data)

        setSelectedPatient((prev) => {
          const demographics = data.demographics ?? {}
          const allergies = parseStringList(data.allergies)
          const medications = parseStringList(data.medications)
          const resolvedId = demographics.patientId != null && `${demographics.patientId}`.trim().length > 0 ? `${demographics.patientId}`.trim() : (prev?.patientId ?? trimmed)
          return {
            patientId: resolvedId,
            name: typeof demographics.name === "string" && demographics.name.trim().length > 0 ? demographics.name.trim() : prev?.name,
            firstName: typeof demographics.firstName === "string" && demographics.firstName.trim().length > 0 ? demographics.firstName.trim() : prev?.firstName,
            lastName: typeof demographics.lastName === "string" && demographics.lastName.trim().length > 0 ? demographics.lastName.trim() : prev?.lastName,
            dob: typeof demographics.dob === "string" && demographics.dob.trim().length > 0 ? demographics.dob.trim() : prev?.dob,
            mrn: typeof demographics.mrn === "string" && demographics.mrn.trim().length > 0 ? demographics.mrn.trim() : prev?.mrn,
            age: typeof demographics.age === "number" && Number.isFinite(demographics.age) ? demographics.age : prev?.age,
            gender: typeof demographics.gender === "string" && demographics.gender.trim().length > 0 ? demographics.gender.trim() : prev?.gender,
            insurance: typeof demographics.insurance === "string" && demographics.insurance.trim().length > 0 ? demographics.insurance.trim() : prev?.insurance,
            lastVisit: typeof demographics.lastVisit === "string" && demographics.lastVisit.trim().length > 0 ? demographics.lastVisit.trim() : prev?.lastVisit,
            allergies: allergies.length > 0 ? allergies : prev?.allergies,
            medications: medications.length > 0 ? medications : prev?.medications,
            source: prev?.source ?? "local",
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
        const payload: Record<string, unknown> = {
          encounterId: numericId,
          encounter_id: numericId,
        }
        const trimmedPatientId = patientId.trim()
        if (trimmedPatientId) {
          payload.patientId = trimmedPatientId
          payload.patient_id = trimmedPatientId
        }
        const response = await fetchWithAuth("/api/encounters/validate", {
          method: "POST",
          jsonBody: payload,
          signal: controller.signal,
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
          } else if (encounterPatientId && patientId && String(encounterPatientId) !== String(patientId)) {
            setEncounterValidation({
              status: "invalid",
              encounter: data?.encounter,
              message: "Encounter is associated with a different patient",
            })
            return
          }
          const summaryParts = [
            typeof data?.encounter?.date === "string" ? data.encounter.date : null,
            typeof data?.encounter?.type === "string" ? data.encounter.type : null,
            typeof data?.encounter?.provider === "string" ? data.encounter.provider : null,
          ].filter(Boolean)
          setEncounterValidation({
            status: "valid",
            encounter: data?.encounter,
            message: summaryParts.length ? summaryParts.join(" • ") : "Encounter validated",
          })
        } else {
          const errors: string[] = Array.isArray(data?.errors) ? data.errors.filter((item: any) => typeof item === "string") : []
          setEncounterValidation({
            status: "invalid",
            encounter: data?.encounter,
            message: errors.length ? errors.join(", ") : "Encounter not found",
          })
        }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setEncounterValidation({
          status: "invalid",
          message: error instanceof Error ? error.message : "Unable to validate encounter",
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

    if (complianceStreamState.status === "open") {
      complianceAbortRef.current?.abort()
      setComplianceLoading(false)
      setComplianceError(null)
      return () => {
        if (complianceTimeoutRef.current) {
          clearTimeout(complianceTimeoutRef.current)
        }
      }
    }

    if (!noteContent || noteContent.trim().length === 0) {
      lastComplianceInputRef.current = createComplianceSignature("", [])
      setComplianceIssues([])
      setComplianceError(null)
      return
    }

    complianceTimeoutRef.current = window.setTimeout(async () => {
      const signature = createComplianceSignature(noteContentRef.current ?? "", complianceCodeValues)
      if (signature === lastComplianceInputRef.current) return
      const controller = new AbortController()
      complianceAbortRef.current?.abort()
      complianceAbortRef.current = controller
      setComplianceLoading(true)
      setComplianceError(null)
      try {
        const payload: Record<string, unknown> = {
          content: typeof noteContentRef.current === "string" ? noteContentRef.current : "",
        }
        if (complianceCodeValues.length > 0) {
          payload.codes = complianceCodeValues
        }
        const response = await fetchWithAuth("/api/ai/compliance/check", {
          method: "POST",
          jsonBody: payload,
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Compliance analysis failed (${response.status})`)
        }
        const data = await response.json()
        const normalized = convertComplianceResponse(
          Array.isArray(data?.alerts)
            ? data.alerts
            : Array.isArray(data?.compliance)
              ? data.compliance
              : Array.isArray(data?.issues)
                ? data.issues
                : Array.isArray(data?.results)
                  ? data.results
                  : data,
        )
        setComplianceIssues((prev) => {
          const dismissed = new Map(prev.map((issue) => [issue.id, issue.dismissed]))
          return normalized.map((issue) => ({
            ...issue,
            dismissed: dismissed.get(issue.id) ?? issue.dismissed ?? false,
          }))
        })
        lastComplianceInputRef.current = signature
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return
        setComplianceError(error instanceof Error ? error.message : "Compliance analysis unavailable")
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
  }, [noteContent, complianceCodeValues, fetchWithAuth, convertComplianceResponse, complianceStreamState.status])

  useEffect(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current)
      autoSaveIntervalRef.current = null
    }
    if (isFinalized) {
      return
    }

    if (!patientId.trim()) {
      return
    }

    void performAutoSave({ reason: "interval" })
    autoSaveIntervalRef.current = window.setInterval(() => {
      void performAutoSave({ reason: "interval" })
    }, 30_000)

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }
  }, [patientId, performAutoSave, isFinalized])

  useEffect(() => {
    if (isFinalized) {
      return () => undefined
    }

    if (!patientId.trim()) {
      return () => undefined
    }

    const content = noteContentRef.current ?? ""
    if (content === autoSaveLastContentRef.current) {
      return () => undefined
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      autoSaveTimeoutRef.current = null
      void performAutoSave({ reason: "debounced" })
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
    }
  }, [noteContent, patientId, isFinalized, performAutoSave])

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
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      autoSavePromiseRef.current = null
      noteCreatePromiseRef.current = null
      stopAudioStream()
    }
  }, [stopAudioStream])

  useEffect(() => {
    if (!visitStarted) return
    const interval = window.setInterval(() => {
      setCurrentSessionTime((time) => time + 1)
    }, 1000)
    return () => {
      clearInterval(interval)
    }
  }, [visitStarted])

  useEffect(() => {
    onComplianceStreamUpdate?.(complianceIssues, complianceStreamState)
  }, [complianceIssues, complianceStreamState, onComplianceStreamUpdate])

  useEffect(() => {
    onCodeStreamUpdate?.(liveCodeSuggestions, codeStreamState)
  }, [liveCodeSuggestions, codeStreamState, onCodeStreamUpdate])

  useEffect(() => {
    if (!onCollaborationStreamUpdate) {
      return
    }
    onCollaborationStreamUpdate({
      participants: collaborationParticipants,
      conflicts: collaborationConflicts,
      status: collaborationStatus,
      connection: collaborationStreamState,
    })
  }, [collaborationParticipants, collaborationConflicts, collaborationStatus, collaborationStreamState, onCollaborationStreamUpdate])

  useEffect(() => {
    if (!transcriptEntries.length) {
      setTranscriptionIndex(-1)
    } else {
      setTranscriptionIndex(transcriptEntries.length - 1)
    }
  }, [transcriptEntries])

  useEffect(() => {
    const cursor = createTranscriptCursor(transcriptEntries)
    if (transcriptCursorRef.current === cursor) {
      return
    }
    transcriptCursorRef.current = cursor
    if (onTranscriptCursorChange) {
      onTranscriptCursorChange(cursor)
    }
  }, [transcriptEntries, onTranscriptCursorChange])

  useEffect(() => {
    return () => {
      transcriptCursorRef.current = null
      if (onTranscriptCursorChange) {
        onTranscriptCursorChange(null)
      }
    }
  }, [onTranscriptCursorChange])

  useEffect(() => {
    if (!shouldSnapTranscriptToEnd) return
    if (!showFullTranscript) return
    const anchor = transcriptEndRef.current
    if (!anchor) {
      return
    }
    anchor.scrollIntoView({ behavior: "smooth", block: "end" })
    setShouldSnapTranscriptToEnd(false)
  }, [shouldSnapTranscriptToEnd, showFullTranscript, transcriptEntries])

  useEffect(() => {
    if (showFullTranscript) {
      setShouldSnapTranscriptToEnd(true)
    }
  }, [showFullTranscript])

  const handleDismissIssue = (issueId: string) => {
    setComplianceIssues((prev) => prev.map((issue) => (issue.id === issueId ? { ...issue, dismissed: true } : issue)))
  }

  const handleRestoreIssue = (issueId: string) => {
    setComplianceIssues((prev) => prev.map((issue) => (issue.id === issueId ? { ...issue, dismissed: false } : issue)))
  }

  const applyWizardIssues = useCallback(
    (issues?: Record<string, unknown>) => {
      const normalized = convertWizardIssuesToCompliance(issues)
      setComplianceIssues(normalized)
    },
    [convertWizardIssuesToCompliance],
  )

  const handlePreFinalizeResult = useCallback(
    (result: PreFinalizeCheckResponse) => {
      applyWizardIssues(result?.issues)
    },
    [applyWizardIssues],
  )

  const handleFinalizationError = useCallback((message: string) => {
    if (!message) return
    toast.error("Finalization failed", {
      description: message,
    })
  }, [])

  const handleFinalizationClose = useCallback(
    (result?: FinalizeResult) => {
      if (!result) {
        return
      }

      setIsFinalized(true)
      stopAudioStream()
      setVisitStarted(false)
      setVisitSession((prev) => ({
        ...prev,
        status: "finalized",
        endTime: new Date().toISOString(),
      }))
      setVisitError(null)
      setPausedTime(currentSessionTime)

      const finalizedContent = typeof result.finalizedContent === "string" && result.finalizedContent.trim().length > 0 ? result.finalizedContent : noteContentRef.current

      if (finalizedContent && finalizedContent !== noteContentRef.current) {
        noteContentRef.current = finalizedContent
        setNoteContent(finalizedContent)
        if (onNoteContentChange) {
          onNoteContentChange(finalizedContent)
        }
        autoSaveLastContentRef.current = finalizedContent
        lastComplianceInputRef.current = createComplianceSignature(finalizedContent, complianceCodeValues)
      }

      applyWizardIssues(result.issues)

      toast.success("Note finalized", {
        description: result.exportReady ? "The note has been finalized and is ready for export." : "The note was finalized, but some items still require review.",
      })
    },
    [applyWizardIssues, currentSessionTime, complianceCodeValues, onNoteContentChange, stopAudioStream],
  )

  useEffect(() => {
    const sessionSource = finalizationSessionSnapshot?.lastFinalizeResult
      ? {
          result: finalizationSessionSnapshot.lastFinalizeResult,
          sessionId: finalizationSessionSnapshot.sessionId ?? null,
          noteId: finalizationSessionSnapshot.noteId ?? null,
          encounterId: finalizationSessionSnapshot.encounterId ?? null,
          patientId: finalizationSessionSnapshot.patientId ?? null,
        }
      : null

    const directSource = directFinalization
      ? {
          result: directFinalization.result,
          sessionId: null,
          noteId: directFinalization.noteId ?? null,
          encounterId: directFinalization.encounterId ?? null,
          patientId: directFinalization.patientId ?? null,
        }
      : null

    const source = directSource ?? sessionSource
    if (!source) {
      return
    }

    const result = source.result
    const resolveIdentifier = (...values: Array<string | null | undefined>) => {
      for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim()
        }
      }
      return "finalization-session"
    }

    const sessionIdentifier = resolveIdentifier(source.sessionId, source.noteId, source.encounterId, source.patientId)

    const finalizedContent = typeof result.finalizedContent === "string" ? result.finalizedContent : ""
    const completionMarker =
      (result as { completedAt?: string | null }).completedAt ??
      (result as { finalizedAt?: string | null }).finalizedAt ??
      (source.sessionId ? (finalizationSessionSnapshot as { completedAt?: string | null }).completedAt : null) ??
      (source.sessionId ? (finalizationSessionSnapshot as { updatedAt?: string | null }).updatedAt : null) ??
      null

    const signature = JSON.stringify({
      sessionIdentifier,
      finalizedContent,
      completionMarker,
    })

    if (finalizationSyncRef.current === signature) {
      return
    }

    finalizationSyncRef.current = signature

    if (!isFinalized) {
      setIsFinalized(true)
    }

    if (finalizedContent.trim().length > 0 && finalizedContent !== noteContentRef.current) {
      noteContentRef.current = finalizedContent
      setNoteContent(finalizedContent)
      autoSaveLastContentRef.current = finalizedContent
      lastComplianceInputRef.current = createComplianceSignature(finalizedContent, complianceCodeValues)
      onNoteContentChange?.(finalizedContent)
    }

    if (result.issues) {
      applyWizardIssues(result.issues)
    }

    if (directSource) {
      onRecentFinalizationHandled?.()
    }
  }, [applyWizardIssues, complianceCodeValues, directFinalization, finalizationSessionSnapshot, isFinalized, onNoteContentChange, onRecentFinalizationHandled])

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

  useEffect(() => {
    const status = visitSession.status
    const baseDuration = Number.isFinite(visitSession.durationSeconds)
      ? Math.max(0, Math.floor(Number(visitSession.durationSeconds)))
      : 0
    let computed = baseDuration
    if (status === "active") {
      const resumedMs =
        parseSessionTimestamp(visitSession.lastResumedAt ?? null) ??
        parseSessionTimestamp(visitSession.startTime ?? null)
      if (resumedMs !== null) {
        const nowMs = Date.now()
        if (!Number.isNaN(nowMs) && nowMs > resumedMs) {
          computed = baseDuration + Math.max(0, Math.floor((nowMs - resumedMs) / 1000))
        }
      }
    }
    if (status === "active") {
      setVisitStarted(true)
      setCurrentSessionTime(computed)
      setPausedTime(computed)
      setHasEverStarted(true)
    } else if (status === "paused" || status === "completed") {
      setVisitStarted(false)
      setCurrentSessionTime(computed)
      setPausedTime(computed)
      if (computed > 0 || status === "completed") {
        setHasEverStarted(true)
      }
    }
  }, [visitSession.status, visitSession.durationSeconds, visitSession.lastResumedAt, visitSession.startTime])

  const visitStatus = visitSession.status ?? (visitStarted ? "active" : undefined)
  const totalDisplayTime = visitStarted ? currentSessionTime : pausedTime
  const hasRecordedTime = totalDisplayTime > 0
  const visitStatusLabel = useMemo(() => {
    switch (visitStatus) {
      case "active":
        return "Visit Active"
      case "paused":
        return "Visit Paused"
      case "completed":
        return "Visit Completed"
      default:
        return null
    }
  }, [visitStatus])

  const visitStatusBadgeClass = useMemo(() => {
    switch (visitStatus) {
      case "active":
        return "bg-emerald-100 text-emerald-700 border border-emerald-300"
      case "paused":
        return "bg-amber-100 text-amber-700 border border-amber-300"
      case "completed":
        return "bg-slate-200 text-slate-700 border border-slate-300"
      default:
        return "bg-muted text-muted-foreground"
    }
  }, [visitStatus])
  const isEditorDisabled = isFinalized || !visitStarted

  // Calculate active issues for button state
  const activeIssues = complianceIssues.filter((issue) => !issue.dismissed)
  const criticalIssues = activeIssues.filter((issue) => issue.severity === "critical")
  const hasActiveIssues = activeIssues.length > 0
  const finalizeButtonDisabled = isFinalized || !hasRecordedTime || hasActiveIssues
  const hasCriticalIssues = criticalIssues.length > 0

  const recentTranscription = useMemo(() => {
    if (!transcriptEntries.length) return []
    const now = Date.now()
    const subset: TranscriptEntry[] = []
    for (let index = transcriptEntries.length - 1; index >= 0; index -= 1) {
      const entry = transcriptEntries[index]
      const age = now - entry.timestamp
      if (age <= TRANSCRIPT_RECENT_WINDOW_MS || subset.length === 0) {
        subset.push(entry)
      } else {
        break
      }
    }
    return subset.reverse()
  }, [transcriptEntries])

  const totalTranscriptWords = useMemo(() => {
    return transcriptEntries.reduce((sum, entry) => {
      if (!entry.text) return sum
      const words = entry.text.trim().split(/\s+/).filter(Boolean).length
      return sum + words
    }, 0)
  }, [transcriptEntries])

  const averageTranscriptConfidence = useMemo(() => {
    const samples = transcriptEntries
      .map((entry) => (typeof entry.confidence === "number" && Number.isFinite(entry.confidence) ? Math.max(0, Math.min(1, entry.confidence)) : null))
      .filter((value): value is number => value !== null)
    if (!samples.length) return null
    const sum = samples.reduce((total, value) => total + value, 0)
    return sum / samples.length
  }, [transcriptEntries])

  const normalizedTranscriptQuery = transcriptSearch.trim().toLowerCase()
  const hasTranscriptSearch = normalizedTranscriptQuery.length > 0

  const entryMatchesSearch = useCallback(
    (entry: TranscriptEntry) => {
      if (!hasTranscriptSearch) return true
      const textValue = entry.text?.toLowerCase() ?? ""
      const speakerValue = entry.speaker?.toLowerCase() ?? ""
      return textValue.includes(normalizedTranscriptQuery) || speakerValue.includes(normalizedTranscriptQuery)
    },
    [hasTranscriptSearch, normalizedTranscriptQuery],
  )

  const matchingTranscriptCount = useMemo(() => {
    if (!transcriptEntries.length) return 0
    return transcriptEntries.reduce((count, entry) => (entryMatchesSearch(entry) ? count + 1 : count), 0)
  }, [entryMatchesSearch, transcriptEntries])

  const highlightTranscriptText = useCallback(
    (text: string): ReactNode => {
      if (!hasTranscriptSearch || !text) return text
      try {
        const regex = new RegExp(`(${escapeRegExp(normalizedTranscriptQuery)})`, "ig")
        const parts = text.split(regex)
        return parts.map((part, index) =>
          part.toLowerCase() === normalizedTranscriptQuery ? (
            <mark key={index} className="rounded-sm bg-amber-200 px-1 py-0.5 text-foreground">
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          ),
        )
      } catch {
        return text
      }
    },
    [hasTranscriptSearch, normalizedTranscriptQuery],
  )

  const totalTranscribedLines = transcriptEntries.length
  const currentTranscriptCount = transcriptionIndex >= 0 ? transcriptionIndex + 1 : 0
  const averageConfidencePercent = averageTranscriptConfidence === null ? null : Math.round(Math.min(1, Math.max(0, averageTranscriptConfidence)) * 100)

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleFinalize = useCallback(async () => {
    if (isFinalized) {
      toast.info("Note already finalized", {
        description: "Editing is locked after finalization.",
      })
      return
    }

    if (!onOpenFinalization) {
      toast.error("Unable to open finalization wizard", {
        description: "Finalization flow is not available in this view.",
      })
      return
    }

    try {
      await ensureNoteCreated()

      const launchOptions: FinalizationWizardLaunchOptions = {
        selectedCodesList,
        complianceIssues,
        noteContent,
        patientInfo: {
          patientId: patientId.trim().length > 0 ? patientId.trim() : undefined,
          encounterId,
          name: patientDisplayName ?? null,
          age: patientAgeValue ?? null,
          sex: patientSexValue ?? null,
          encounterDate: encounterDateValue ?? null,
        },
        transcriptEntries,
        fetchWithAuth,
        noteId,
        onPreFinalizeResult: handlePreFinalizeResult,
        onError: handleFinalizationError,
        onClose: handleFinalizationClose,
        displayMode: "embedded",
        streamingCodeSuggestions: liveCodeSuggestions,
        codesConnection: codeStreamState,
        complianceConnection: complianceStreamState,
      }

      onOpenFinalization(launchOptions)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open the finalization wizard."
      toast.error("Unable to open finalization wizard", {
        description: message,
      })
    }
  }, [
    complianceIssues,
    encounterDateValue,
    encounterId,
    ensureNoteCreated,
    fetchWithAuth,
    handleFinalizationClose,
    handleFinalizationError,
    handlePreFinalizeResult,
    isFinalized,
    noteContent,
    onOpenFinalization,
    patientDisplayName,
    patientId,
    patientAgeValue,
    patientSexValue,
    selectedCodesList,
    transcriptEntries,
    noteId,
    liveCodeSuggestions,
    codeStreamState,
    complianceStreamState,
  ])

  const handleSaveDraft = useCallback(async () => {
    if (saveDraftLoading) {
      return
    }

    if (isFinalized) {
      toast.info("Note already finalized", {
        description: "Finalized notes cannot be saved as drafts.",
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

    setSaveDraftLoading(true)
    setSaveDraftError(null)

    try {
      const content = noteContentRef.current ?? ""
      const ensuredId = await ensureNoteCreated(content)
      if (!ensuredId) {
        throw new Error("Unable to determine draft identifier")
      }

      const saved = await performAutoSave({
        reason: "manual",
        contentOverride: content,
        noteIdOverride: String(ensuredId),
        force: true,
      })

      if (!saved) {
        throw new Error("Unable to auto-save note")
      }

      const ensuredNoteId = String(ensuredId)

      if (visitSession.sessionId) {
        try {
          const sessionResponse = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            jsonBody: { session_id: visitSession.sessionId, action: "stop" },
          })
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json().catch(() => null)
            if (sessionData) {
              setVisitSession((prev) => ({ ...prev, ...sessionData }))
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
              noteId: ensuredNoteId,
              source: "note-editor",
            },
          },
        })
      } catch (error) {
        console.error("Failed to log draft save activity", error)
      }

      toast.success("Draft saved", {
        description: "Draft saved and available in drafts overview.",
      })
      onNavigateToDrafts?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save draft"
      setSaveDraftError(message)
      setAutoSaveError(message)
      setLastAutoSaveTime(previousAutoSaveTime ?? null)
      toast.error("Unable to save draft", {
        description: message,
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
    performAutoSave,
    fetchWithAuth,
    visitSession.sessionId,
    setVisitSession,
    stopAudioStream,
    setVisitStarted,
    currentSessionTime,
    setPausedTime,
    encounterId,
    onNavigateToDrafts,
    setAutoSaveError,
  ])

  const canStartVisit = useMemo(() => {
    if (isFinalized) {
      return false
    }
    return patientId.trim().length > 0 && encounterValidation.status === "valid"
  }, [patientId, encounterValidation.status, isFinalized])

  const handleVisitToggle = useCallback(async () => {
    if (visitLoading) return
    if (isFinalized) {
      setVisitError("Note has been finalized and cannot be modified.")
      return
    }
    const trimmedPatientId = patientId.trim()
    const encounterNumeric = Number(encounterValidation.encounter?.encounterId ?? encounterId)
    if (!visitStarted) {
      if (!canStartVisit) {
        setVisitError("Validate patient and encounter before starting a visit.")
        return
      }
      setVisitLoading(true)
      setVisitError(null)
      try {
        if (!Number.isFinite(encounterNumeric)) {
          throw new Error("Encounter ID must be numeric")
        }

        const validationPayload: Record<string, unknown> = {
          encounterId: encounterNumeric,
          encounter_id: encounterNumeric,
        }
        if (trimmedPatientId) {
          validationPayload.patientId = trimmedPatientId
          validationPayload.patient_id = trimmedPatientId
        }

        const validationResponse = await fetchWithAuth("/api/encounters/validate", {
          method: "POST",
          jsonBody: validationPayload,
        })
        const validationData = await validationResponse.json().catch(() => null)
        if (!validationResponse.ok || !validationData?.valid) {
          const errors: string[] = Array.isArray(validationData?.errors)
            ? validationData.errors.filter((item: unknown): item is string => typeof item === "string")
            : []
          const message = errors.length ? errors.join(", ") : "Encounter validation failed"
          setEncounterValidation({
            status: "invalid",
            encounter: validationData?.encounter,
            message,
          })
          throw new Error(message)
        }

        const encounterPatientId =
          validationData?.encounter?.patient?.patientId ?? validationData?.encounter?.patientId
        if (encounterPatientId && !patientId) {
          setPatientId(String(encounterPatientId))
          setPatientInputValue(String(encounterPatientId))
        } else if (
          encounterPatientId &&
          patientId &&
          String(encounterPatientId) !== String(patientId)
        ) {
          throw new Error("Encounter is associated with a different patient")
        }

        const summaryParts = [
          typeof validationData?.encounter?.date === "string" ? validationData.encounter.date : null,
          typeof validationData?.encounter?.type === "string" ? validationData.encounter.type : null,
          typeof validationData?.encounter?.provider === "string" ? validationData.encounter.provider : null,
        ].filter(Boolean)
        setEncounterValidation({
          status: "valid",
          encounter: validationData?.encounter,
          message: summaryParts.length ? summaryParts.join(" • ") : "Encounter validated",
        })

        const headerApplied = ensureDemographicsHeader()
        const contentForCreation =
          typeof noteContentRef.current === "string" && noteContentRef.current.length > 0
            ? noteContentRef.current
            : headerApplied
        await ensureNoteCreated(contentForCreation)

        let sessionData: VisitSessionState | null = null
        if (!visitSession.sessionId) {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "POST",
            jsonBody: { encounter_id: encounterNumeric },
          })
          if (!response.ok) {
            throw new Error(`Failed to start visit (${response.status})`)
          }
          sessionData = await response.json().catch(() => null)
        } else {
          const response = await fetchWithAuth("/api/visits/session", {
            method: "PUT",
            jsonBody: { session_id: visitSession.sessionId, action: "resume" },
          })
          if (!response.ok) {
            throw new Error(`Failed to resume visit (${response.status})`)
          }
          sessionData = await response.json().catch(() => null)
        }

        if (sessionData) {
          setVisitSession((prev) => ({
            ...prev,
            ...sessionData,
            sessionId: sessionData.sessionId ?? prev.sessionId,
            status: (sessionData.status as VisitSessionStatus | undefined) ?? "active",
            encounterId: encounterNumeric,
            patientId: trimmedPatientId || prev.patientId,
            startTime: sessionData.startTime ?? prev.startTime,
            endTime: sessionData.endTime ?? prev.endTime ?? null,
            durationSeconds:
              typeof sessionData.durationSeconds === "number"
                ? sessionData.durationSeconds
                : prev.durationSeconds,
            lastResumedAt:
              typeof sessionData.lastResumedAt === "string"
                ? sessionData.lastResumedAt
                : prev.lastResumedAt ?? null,
          }))
        }

        setHasEverStarted(true)
        const started = await startAudioStream()
        if (!started) {
          setVisitError("Microphone access is required for live transcription.")
        }
      } catch (error) {
        setVisitError(error instanceof Error ? error.message : "Unable to start visit")
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
            jsonBody: { session_id: visitSession.sessionId, action: "stop" },
          })
          if (!response.ok) {
            throw new Error(`Failed to stop visit (${response.status})`)
          }
          const data = await response.json().catch(() => null)
          if (data) {
            setVisitSession((prev) => ({ ...prev, ...data }))
          }
        }
      } catch (error) {
        setVisitError(error instanceof Error ? error.message : "Unable to stop visit")
      } finally {
        await performAutoSave({ reason: "manual", force: true })
        stopAudioStream()
        setVisitStarted(false)
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
    ensureNoteCreated,
    ensureDemographicsHeader,
    noteContentRef,
    startAudioStream,
    stopAudioStream,
    isFinalized,
    patientId,
    setPatientId,
    setPatientInputValue,
    performAutoSave,
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
                  {patientSuggestions.map((suggestion) => {
                    const descriptionParts = [
                      suggestion.name ?? [suggestion.firstName, suggestion.lastName].filter(Boolean).join(" "),
                      suggestion.dob ? `DOB: ${suggestion.dob}` : null,
                      suggestion.mrn ? `MRN: ${suggestion.mrn}` : null,
                    ].filter(Boolean)
                    return (
                      <button
                        key={`${suggestion.source}-${suggestion.patientId}`}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          handleSelectPatient(suggestion)
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">{suggestion.patientId}</span>
                        {descriptionParts.length > 0 && <span className="text-xs text-muted-foreground">{descriptionParts.join(" • ")}</span>}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{suggestion.source === "local" ? "Internal" : "External"}</span>
                      </button>
                    )
                  })}
                  {patientSearchLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>}
                  {!patientSearchLoading && patientSuggestions.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No patients found</div>}
                </div>
              )}
            </div>
            {patientSearchError && <p className="text-xs text-destructive">{patientSearchError}</p>}
            {selectedPatient && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedPatient.name || `${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim() || selectedPatient.patientId}
              </p>
            )}
          </div>

          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="encounter-id">Encounter ID</Label>
            <Input id="encounter-id" value={encounterId} onChange={(e) => setEncounterId(e.target.value)} placeholder="Enter Encounter ID" />
            {encounterValidation.status === "loading" && <p className="text-xs text-muted-foreground">Validating encounter…</p>}
            {encounterValidation.status === "valid" && encounterValidation.message && <p className="text-xs text-emerald-600">{encounterValidation.message}</p>}
            {encounterValidation.status === "invalid" && encounterValidation.message && <p className="text-xs text-destructive">{encounterValidation.message}</p>}
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
                      ? "bg-emerald-600/10 text-emerald-700 cursor-default"
                      : finalizeButtonDisabled
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  }`}
                >
                  {isFinalized ? <CheckCircle className="w-4 h-4 mr-2" /> : hasActiveIssues ? <AlertTriangle className="w-4 h-4 mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  {isFinalized ? "Note Finalized" : hasActiveIssues ? "Issues Must Be Resolved" : "Save & Finalize Note"}
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
                          {activeIssues.length} compliance issue{activeIssues.length !== 1 ? "s" : ""} must be resolved
                        </div>
                        {hasCriticalIssues && (
                          <div>
                            {criticalIssues.length} critical issue{criticalIssues.length !== 1 ? "s" : ""} requiring attention
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
            {saveDraftLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saveDraftLoading ? "Saving Draft…" : "Save Draft & Exit"}
          </Button>
          {saveDraftError && (
            <p className="text-xs text-destructive" role="alert">
              {saveDraftError}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {autoSaveInFlight ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>Saving…</span>
              </>
            ) : lastAutoSaveTime ? (
              <span>
                Auto-saved
                {lastAutoSaveVersion != null ? ` (v${lastAutoSaveVersion})` : ""} {new Date(lastAutoSaveTime).toLocaleTimeString()}
              </span>
            ) : (
              <span>Auto-save pending</span>
            )}
            {autoSaveError && <span className="text-destructive">{autoSaveError}</span>}
          </div>

          {patientIdForContext && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground rounded-full border border-border px-2 py-1">
                  <span className="font-medium">Context:</span>
                  {[
                    { key: "superficial", label: "Superficial" },
                    { key: "deep", label: "Deep" },
                    { key: "indexed", label: "Indexed" },
                  ].map((stage, index) => {
                    const display = contextStageDisplay[stage.key as keyof typeof contextStageDisplay]
                    const isBest = contextStageState.bestStage === stage.key
                    return (
                      <div key={stage.key} className="flex items-center gap-1">
                        <span className={isBest ? "font-semibold text-foreground" : undefined}>{stage.label}</span>
                        <span>{display}</span>
                        {index < 2 && <span>·</span>}
                      </div>
                    )
                  })}
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-xs space-y-1">
                <div>Profile: {contextStageState.profile ?? "balanced"}</div>
                {contextStageState.lastUpdated && (
                  <div>Updated: {new Date(contextStageState.lastUpdated).toLocaleString()}</div>
                )}
                {contextStageState.stages.superficial?.doc_count != null && (
                  <div>Documents: {contextStageState.stages.superficial.doc_count}</div>
                )}
                {contextStageState.bestStage !== "indexed" && (
                  <div className="text-muted-foreground">Deep parsing may still be in progress.</div>
                )}
              </TooltipContent>
            </Tooltip>
          )}

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

            {visitError && <p className="text-xs text-destructive">{visitError}</p>}

            {/* Show indicators when visit has ever been started */}
            {hasEverStarted && (
              <div className="flex items-center gap-3 text-destructive">
                {visitStatusLabel && (
                  <Badge className={`text-xs font-medium ${visitStatusBadgeClass}`}>
                    {visitStatusLabel}
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono font-medium min-w-[3rem] tabular-nums">{formatTime(totalDisplayTime)}</span>
                </div>

                {/* Audio Wave Animation - show when visit has ever been started */}
                {hasEverStarted && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-0.5 h-6 cursor-pointer" onClick={() => setShowFullTranscript(true)}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                              <div
                                key={i}
                                className={`w-0.5 rounded-full ${isRecording ? "bg-destructive" : "bg-muted-foreground"}`}
                                style={{
                                  height: isRecording ? `${8 + (i % 4) * 3}px` : `${6 + (i % 3) * 2}px`,
                                  animation: isRecording ? `audioWave${i} ${1.2 + (i % 3) * 0.3}s ease-in-out infinite` : "none",
                                  animationDelay: isRecording ? `${i * 0.1}s` : "0s",
                                }}
                              />
                            ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="center" className="max-w-sm p-3 bg-popover border-border">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground"}`}></div>
                              {isRecording ? "Live Transcription Preview" : "Transcription Preview (Paused)"}
                            </div>
                            <div className="bg-muted/50 rounded-md p-2 border-l-2 border-destructive space-y-2">
                              {recentTranscription.length ? (
                                recentTranscription.map((entry, index) => {
                                  const styles = SPEAKER_STYLES[entry.speakerRole] ?? SPEAKER_STYLES.other
                                  const isLatest = index === recentTranscription.length - 1
                                  return (
                                    <div
                                      key={entry.id}
                                      className={`flex items-start gap-2 text-xs leading-relaxed ${isLatest ? "text-foreground" : "text-muted-foreground"}`}
                                      style={{ opacity: isLatest ? 1 : Math.max(0.25, 0.75 - index * 0.2) }}
                                    >
                                      <div className={`mt-1 h-1.5 w-1.5 rounded-full ${styles.dot}`}></div>
                                      <div className="flex-1 space-y-1">
                                        <Badge className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>{entry.speaker}</Badge>
                                        <div className={isLatest ? "font-medium" : undefined}>{entry.text}</div>
                                      </div>
                                    </div>
                                  )
                                })
                              ) : (
                                <div className="text-xs text-muted-foreground">Transcript will appear once the conversation begins.</div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                              Click audio wave to view full transcript
                              {!isRecording && <div className="mt-1 text-muted-foreground/80">Recording paused - transcript available</div>}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {transcriptionError && <p className="text-xs text-destructive">{transcriptionError}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draft Editor & Beautified Preview */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs value={activeViewMode} onValueChange={(value) => setActiveViewMode(value as NoteViewMode)} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pb-3">
            <TabsList>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="beautified" disabled={!noteContent.trim()}>
                Beautified
                {currentBeautifiedState?.isStale && <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-700">Stale</span>}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="draft" className="flex min-h-0 flex-1 flex-col">
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
                  if (beautifiedStateRef.current && !beautifiedStateRef.current.isStale && beautifiedStateRef.current.noteContent !== content) {
                    const nextBeautified: BeautifyResultState = {
                      ...beautifiedStateRef.current,
                      isStale: true,
                    }
                    setBeautifiedState(nextBeautified)
                  }
                  if (!noteId && patientId.trim().length > 0) {
                    void ensureNoteCreated(content).catch(() => {})
                  }
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="beautified" className="flex min-h-0 flex-1">
            <BeautifiedView
              noteContent={noteContent}
              specialty={specialty}
              payer={payer}
              isActive={activeViewMode === "beautified"}
              existingResult={currentBeautifiedState ?? null}
              onResultChange={setBeautifiedState}
              exportState={currentExportState ?? null}
              onExportStateChange={setEhrExportState}
              patientId={patientId}
              encounterId={encounterId}
              noteId={noteId}
              selectedCodes={selectedCodesList}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Full Transcript Modal */}
      <Dialog open={showFullTranscript} onOpenChange={setShowFullTranscript}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 bg-background border-border">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <DialogTitle className="text-lg font-medium">Full Transcript</DialogTitle>
                <DialogDescription className="sr-only">Real-time transcription of your patient encounter showing the complete conversation history.</DialogDescription>
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
                <div className={`flex items-center gap-1 text-sm ${isRecording ? "text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-mono tabular-nums">{formatTime(totalDisplayTime)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  value={transcriptSearch}
                  onChange={(event) => setTranscriptSearch(event.target.value)}
                  placeholder="Search transcript..."
                  className="sm:max-w-xs"
                />
                {hasTranscriptSearch && (
                  <div className="text-xs text-muted-foreground">
                    {matchingTranscriptCount} match{matchingTranscriptCount === 1 ? "" : "es"}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                {isRecording
                  ? "Real-time transcription of your patient encounter. The transcript updates automatically as the conversation continues."
                  : "Transcription of your patient encounter. Recording is currently paused - click 'Start Visit' to resume recording and live transcription."}
              </div>

              <div className="space-y-3">
                {hasTranscriptSearch && transcriptEntries.length > 0 && matchingTranscriptCount === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    No transcript entries match “{transcriptSearch.trim()}”.
                  </div>
                )}
                {transcriptEntries.map((entry, index) => {
                  const isRecent = index >= Math.max(0, transcriptionIndex - 2) && index <= transcriptionIndex
                  const isCurrent = index === transcriptionIndex && isRecording
                  const styles = SPEAKER_STYLES[entry.speakerRole] ?? SPEAKER_STYLES.other
                  const matchesQuery = entryMatchesSearch(entry)
                  const speakerMatches = hasTranscriptSearch && entry.speaker.toLowerCase().includes(normalizedTranscriptQuery)
                  const timestampDate = new Date(entry.timestamp)
                  const timestampLabel = Number.isFinite(entry.timestamp)
                    ? timestampDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : ""

                  return (
                    <div
                      key={entry.id}
                      className={`flex gap-4 p-3 rounded-lg border transition-all duration-300 ${
                        isCurrent
                          ? "bg-destructive/10 border-destructive/30 shadow-sm"
                          : isRecent
                            ? "bg-accent/40 border-accent/60"
                            : "bg-muted/30 border-transparent"
                      }`}
                      style={{ opacity: matchesQuery ? 1 : 0.45 }}
                    >
                      <div className="flex flex-col gap-2 min-w-[6rem]">
                        <Badge
                          className={`text-[11px] font-semibold uppercase tracking-wide ${styles.badge} ${
                            speakerMatches ? "ring-2 ring-amber-400 shadow-sm" : ""
                          }`}
                        >
                          {entry.speaker}
                        </Badge>
                        {timestampLabel && (
                          <time
                            dateTime={timestampDate.toISOString()}
                            className={`text-[11px] font-medium ${styles.text} opacity-80`}
                          >
                            {timestampLabel}
                          </time>
                        )}
                      </div>
                      <div className={`text-sm leading-relaxed flex-1 ${isCurrent ? "font-medium" : ""}`}>
                        {highlightTranscriptText(entry.text)}
                        {isCurrent && isRecording && <span className="inline-block w-2 h-4 bg-destructive ml-1 animate-pulse"></span>}
                      </div>
                    </div>
                  )
                })}
                {!transcriptEntries.length && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No transcript available yet. Start the visit to capture the conversation.
                  </div>
                )}
                <div ref={transcriptEndRef} />
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
                <div>Confidence: {averageConfidencePercent !== null ? `${averageConfidencePercent}%` : "N/A"}</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
