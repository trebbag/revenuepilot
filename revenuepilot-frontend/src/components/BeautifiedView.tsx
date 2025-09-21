import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Upload, RefreshCw, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"

import { apiFetchJson } from "../lib/api"

import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Separator } from "./ui/separator"

export interface BeautifySuggestedEdit {
  section?: string | null
  original?: string | null
  suggested?: string | null
  reason?: string | null
}

export interface BeautifyResultData {
  subjective?: string | null
  objective?: string | null
  assessment?: string | null
  plan?: string | null
  beautified?: string | null
  confidence?: number | null
  suggestedEdits?: BeautifySuggestedEdit[] | null
  error?: string | null
}

export interface BeautifyResultState {
  status: "idle" | "loading" | "success" | "error"
  noteContent: string
  data: BeautifyResultData | null
  error?: string | null
  fetchedAt?: number
  metadata?: {
    specialty?: string | null
    payer?: string | null
  }
  isStale?: boolean
}

export interface EhrExportState {
  state: "idle" | "loading" | "pending" | "success" | "error"
  exportId?: number | string | null
  progress?: number | null
  backendStatus?: string | null
  error?: string | null
  detail?: unknown
  ehrSystem?: string | null
  sourceNote: string
  lastCheckedAt?: number
}

interface ExportCodeLike {
  code?: string | null
  category?: string | null
  type?: string | null
}

interface BeautifiedViewProps {
  noteContent: string
  specialty?: string | null
  payer?: string | null
  isActive: boolean
  existingResult?: BeautifyResultState | null
  onResultChange?: (next: BeautifyResultState | null) => void
  exportState?: EhrExportState | null
  onExportStateChange?: (next: EhrExportState | null) => void
  patientId?: string | null
  encounterId?: string | null
  noteId?: string | null
  selectedCodes?: ExportCodeLike[]
  ehrSystem?: string | null
}

interface BeautifyApiResponse extends Partial<BeautifyResultData> {
  beautified?: string
  error?: string
}

interface EhrExportPostResponse {
  status?: string
  progress?: number
  exportId?: number | string
  detail?: unknown
  ehrSystem?: string
}

interface EhrExportGetResponse extends EhrExportPostResponse {
  timestamp?: number
}

type BeautifiedSection = {
  key: string
  label: string
  toneClass: string
  content: string
}

const FINAL_EXPORT_STATES = new Set(["exported", "bundle", "success"])
const ERROR_EXPORT_STATES = new Set(["error", "failed", "failure"])
const MAX_EXPORT_POLL_ATTEMPTS = 10

function normalizeSuggestedEdits(value: unknown): BeautifySuggestedEdit[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const edits = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null
      }
      const raw = item as Record<string, unknown>
      const suggested = typeof raw.suggested === "string" ? raw.suggested : null
      const original = typeof raw.original === "string" ? raw.original : null
      if (!suggested && !original) {
        return null
      }
      return {
        section: typeof raw.section === "string" ? raw.section : null,
        original,
        suggested,
        reason: typeof raw.reason === "string" ? raw.reason : null,
      }
    })
    .filter((item): item is BeautifySuggestedEdit => Boolean(item))
  return edits.length > 0 ? edits : null
}

function normalizeBeautifyResponse(raw: unknown): BeautifyResultData {
  if (!raw || typeof raw !== "object") {
    if (typeof raw === "string") {
      return { beautified: raw }
    }
    return { beautified: "" }
  }

  const data = raw as Record<string, unknown>
  const beautified = typeof data.beautified === "string" ? data.beautified : null
  const subjective = typeof data.subjective === "string" ? data.subjective : null
  const objective = typeof data.objective === "string" ? data.objective : null
  const assessment = typeof data.assessment === "string" ? data.assessment : null
  const plan = typeof data.plan === "string" ? data.plan : null
  const confidenceRaw = data.confidence
  const confidence = typeof confidenceRaw === "number" ? confidenceRaw : typeof confidenceRaw === "string" ? Number.parseFloat(confidenceRaw) : null

  return {
    subjective,
    objective,
    assessment,
    plan,
    beautified,
    confidence: Number.isFinite(confidence) ? confidence : null,
    suggestedEdits: normalizeSuggestedEdits(data.suggestedEdits),
    error: typeof data.error === "string" ? data.error : null,
  }
}

function deriveSections(data: BeautifyResultData | null): BeautifiedSection[] {
  if (!data) {
    return []
  }

  const sections: BeautifiedSection[] = []
  if (data.subjective) {
    sections.push({
      key: "subjective",
      label: "SUBJECTIVE",
      toneClass: "text-blue-700",
      content: data.subjective,
    })
  }
  if (data.objective) {
    sections.push({
      key: "objective",
      label: "OBJECTIVE",
      toneClass: "text-green-700",
      content: data.objective,
    })
  }
  if (data.assessment) {
    sections.push({
      key: "assessment",
      label: "ASSESSMENT",
      toneClass: "text-purple-700",
      content: data.assessment,
    })
  }
  if (data.plan) {
    sections.push({
      key: "plan",
      label: "PLAN",
      toneClass: "text-orange-700",
      content: data.plan,
    })
  }

  if (!sections.length && data.beautified) {
    sections.push({
      key: "beautified",
      label: "BEAUTIFIED NOTE",
      toneClass: "text-primary",
      content: data.beautified,
    })
  }

  return sections
}

function buildExportNote(data: BeautifyResultData | null, fallback: string): string {
  const sections = deriveSections(data)
  if (sections.length === 0) {
    const text = data?.beautified ?? fallback
    return typeof text === "string" ? text.trim() : ""
  }

  return sections
    .map((section) => `${section.label}:\n${section.content}`.trim())
    .filter(Boolean)
    .join("\n\n")
}

function normalizeExportState(raw: EhrExportPostResponse | EhrExportGetResponse | null, sourceNote: string, previous?: EhrExportState | null): EhrExportState {
  const backendStatus = typeof raw?.status === "string" ? raw.status : (previous?.backendStatus ?? null)
  const lowerStatus = backendStatus ? backendStatus.toLowerCase() : null

  let state: EhrExportState["state"] = previous?.state ?? "pending"
  if (lowerStatus && FINAL_EXPORT_STATES.has(lowerStatus)) {
    state = "success"
  } else if (lowerStatus && ERROR_EXPORT_STATES.has(lowerStatus)) {
    state = "error"
  } else if (!backendStatus && !previous) {
    state = "pending"
  }

  const progress = typeof raw?.progress === "number" ? raw.progress : (previous?.progress ?? (state === "success" ? 1 : null))

  let errorMessage: string | null = previous?.error ?? null
  if (state === "error") {
    if (typeof raw?.detail === "string") {
      errorMessage = raw.detail
    } else if (raw?.detail && typeof raw.detail === "object" && "error" in raw.detail) {
      const detailError = (raw.detail as Record<string, unknown>).error
      if (typeof detailError === "string") {
        errorMessage = detailError
      }
    }
    if (!errorMessage) {
      errorMessage = "Export failed"
    }
  }

  return {
    state,
    exportId: raw?.exportId ?? previous?.exportId ?? null,
    progress,
    backendStatus: backendStatus ?? previous?.backendStatus ?? null,
    error: state === "error" ? errorMessage : null,
    detail: raw?.detail ?? previous?.detail,
    ehrSystem: raw?.ehrSystem ?? previous?.ehrSystem ?? null,
    sourceNote,
    lastCheckedAt: Date.now(),
  }
}

export function BeautifiedView(props: BeautifiedViewProps) {
  const { noteContent, specialty, payer, isActive, existingResult, onResultChange, exportState, onExportStateChange, patientId, encounterId, noteId, selectedCodes = [], ehrSystem } = props

  const [internalResult, setInternalResult] = useState<BeautifyResultState | null>(existingResult ?? null)
  const [internalExportState, setInternalExportState] = useState<EhrExportState | null>(exportState ?? null)
  const [isFetching, setIsFetching] = useState(false)

  const beautifyState = existingResult ?? internalResult
  const exportStatus = exportState ?? internalExportState

  const beautifyStateRef = useRef<BeautifyResultState | null>(beautifyState ?? null)
  const exportStateRef = useRef<EhrExportState | null>(exportStatus ?? null)
  const fetchInFlightRef = useRef(false)
  const pollAttemptsRef = useRef(0)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setInternalResult(existingResult ?? null)
  }, [existingResult])

  useEffect(() => {
    setInternalExportState(exportState ?? null)
  }, [exportState])

  useEffect(() => {
    beautifyStateRef.current = beautifyState ?? null
  }, [beautifyState])

  useEffect(() => {
    exportStateRef.current = exportStatus ?? null
  }, [exportStatus])

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [])

  const updateResult = useCallback(
    (next: BeautifyResultState | null) => {
      beautifyStateRef.current = next ?? null
      setInternalResult(next)
      onResultChange?.(next ?? null)
    },
    [onResultChange],
  )

  const updateExportState = useCallback(
    (next: EhrExportState | null) => {
      exportStateRef.current = next ?? null
      setInternalExportState(next)
      onExportStateChange?.(next ?? null)
    },
    [onExportStateChange],
  )

  const runBeautify = useCallback(async () => {
    const trimmed = noteContent.trim()
    if (!trimmed) {
      const emptyState: BeautifyResultState = {
        status: "idle",
        noteContent: "",
        data: null,
        error: null,
        fetchedAt: Date.now(),
        metadata: { specialty: specialty ?? null, payer: payer ?? null },
        isStale: false,
      }
      updateResult(emptyState)
      setIsFetching(false)
      fetchInFlightRef.current = false
      return
    }

    if (fetchInFlightRef.current) {
      return
    }

    fetchInFlightRef.current = true
    setIsFetching(true)

    const loadingState: BeautifyResultState = {
      status: "loading",
      noteContent: trimmed,
      data: beautifyStateRef.current?.data ?? null,
      error: null,
      fetchedAt: Date.now(),
      metadata: { specialty: specialty ?? null, payer: payer ?? null },
      isStale: false,
    }
    updateResult(loadingState)

    try {
      const response = await apiFetchJson<BeautifyApiResponse>("/api/ai/beautify", {
        method: "POST",
        jsonBody: {
          text: trimmed,
          specialty: specialty ?? undefined,
          payer: payer ?? undefined,
          note_id: noteId ?? undefined,
        },
      })

      const normalized = normalizeBeautifyResponse(response)
      const successState: BeautifyResultState = {
        status: "success",
        noteContent: trimmed,
        data: normalized,
        error: normalized.error ?? null,
        fetchedAt: Date.now(),
        metadata: { specialty: specialty ?? null, payer: payer ?? null },
        isStale: false,
      }
      updateResult(successState)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to beautify note"
      const errorState: BeautifyResultState = {
        status: "error",
        noteContent: trimmed,
        data: beautifyStateRef.current?.data ?? null,
        error: message,
        fetchedAt: Date.now(),
        metadata: { specialty: specialty ?? null, payer: payer ?? null },
        isStale: false,
      }
      updateResult(errorState)
    } finally {
      fetchInFlightRef.current = false
      setIsFetching(false)
    }
  }, [noteContent, specialty, payer, noteId, updateResult])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const trimmed = noteContent.trim()
    if (!trimmed) {
      updateResult({
        status: "idle",
        noteContent: "",
        data: null,
        error: null,
        fetchedAt: Date.now(),
        metadata: { specialty: specialty ?? null, payer: payer ?? null },
        isStale: false,
      })
      return
    }

    const current = beautifyStateRef.current
    const needsRefresh =
      !current ||
      current.status === "idle" ||
      current.status === "error" ||
      current.isStale ||
      current.noteContent !== trimmed ||
      current.metadata?.specialty !== (specialty ?? null) ||
      current.metadata?.payer !== (payer ?? null)

    if (needsRefresh) {
      void runBeautify()
    }
  }, [isActive, noteContent, specialty, payer, runBeautify, updateResult])

  const exportNote = useMemo(() => buildExportNote(beautifyState?.data ?? null, noteContent), [beautifyState?.data, noteContent])
  const exporting = exportStatus?.state === "loading" || exportStatus?.state === "pending"

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const schedulePoll = useCallback(
    (exportId: number | string, sourceNote: string) => {
      clearPollInterval()
      pollAttemptsRef.current = 0

      pollIntervalRef.current = setInterval(async () => {
        pollAttemptsRef.current += 1
        if (pollAttemptsRef.current > MAX_EXPORT_POLL_ATTEMPTS) {
          clearPollInterval()
          return
        }

        try {
          const response = await apiFetchJson<EhrExportGetResponse>(`/api/export/ehr/${encodeURIComponent(exportId)}`)
          const merged = normalizeExportState(response, sourceNote, exportStateRef.current)
          updateExportState(merged)
          if (merged.state !== "pending") {
            clearPollInterval()
          }
        } catch (error) {
          clearPollInterval()
          const message = error instanceof Error ? error.message : "Unable to poll export status"
          updateExportState({
            state: "error",
            exportId,
            progress: exportStateRef.current?.progress ?? null,
            backendStatus: exportStateRef.current?.backendStatus ?? null,
            error: message,
            detail: exportStateRef.current?.detail,
            ehrSystem: exportStateRef.current?.ehrSystem ?? null,
            sourceNote,
            lastCheckedAt: Date.now(),
          })
        }
      }, 2000)
    },
    [clearPollInterval, updateExportState],
  )
  const handleExport = useCallback(async () => {
    if (!exportNote.trim() || exporting) {
      return
    }

    const startingState: EhrExportState = {
      state: "loading",
      exportId: exportStatus?.exportId ?? null,
      progress: 0,
      backendStatus: null,
      error: null,
      detail: exportStatus?.detail,
      ehrSystem: ehrSystem ?? exportStatus?.ehrSystem ?? null,
      sourceNote: exportNote,
      lastCheckedAt: Date.now(),
    }
    updateExportState(startingState)

    try {
      const payload: Record<string, unknown> = {
        note: exportNote,
        patientID: patientId ?? undefined,
        encounterID: encounterId ?? undefined,
        ehrSystem: ehrSystem ?? undefined,
      }

      const codes = selectedCodes.map((entry) => (typeof entry?.code === "string" ? entry.code.trim() : "")).filter((code) => code.length > 0)
      if (codes.length) {
        payload.codes = codes
      }

      const response = await apiFetchJson<EhrExportPostResponse>("/api/export/ehr", {
        method: "POST",
        jsonBody: payload,
      })

      const nextState = normalizeExportState(response, exportNote, {
        ...startingState,
        state: "pending",
        exportId: response?.exportId ?? startingState.exportId,
        progress: response?.progress ?? startingState.progress,
        backendStatus: response?.status ?? null,
      })
      updateExportState(nextState)
      if (nextState.state === "pending" && nextState.exportId != null) {
        schedulePoll(nextState.exportId, exportNote)
      } else {
        clearPollInterval()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export note"
      updateExportState({
        state: "error",
        exportId: exportStatus?.exportId ?? null,
        progress: exportStatus?.progress ?? null,
        backendStatus: exportStatus?.backendStatus ?? null,
        error: message,
        detail: exportStatus?.detail,
        ehrSystem: ehrSystem ?? exportStatus?.ehrSystem ?? null,
        sourceNote: exportNote,
        lastCheckedAt: Date.now(),
      })
    }
  }, [
    clearPollInterval,
    encounterId,
    ehrSystem,
    exportNote,
    exportStatus?.backendStatus,
    exportStatus?.detail,
    exportStatus?.exportId,
    exportStatus?.progress,
    exporting,
    patientId,
    schedulePoll,
    selectedCodes,
    updateExportState,
  ])

  const handleManualRefresh = useCallback(() => {
    void runBeautify()
  }, [runBeautify])

  const sections = useMemo(() => deriveSections(beautifyState?.data ?? null), [beautifyState?.data])

  const metadataLabel = useMemo(() => {
    const parts: string[] = []
    if (typeof specialty === "string" && specialty.trim().length > 0) {
      parts.push(specialty.trim())
    }
    if (typeof payer === "string" && payer.trim().length > 0) {
      parts.push(payer.trim())
    }
    return parts.length ? parts.join(" · ") : "General"
  }, [specialty, payer])

  const confidencePercent = useMemo(() => {
    const value = beautifyState?.data?.confidence
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null
    }
    const normalized = value > 1 ? value : value * 100
    return Math.round(Math.min(100, Math.max(0, normalized)))
  }, [beautifyState?.data?.confidence])

  let mainContent: JSX.Element
  const trimmedContent = noteContent.trim()

  if (!trimmedContent) {
    mainContent = (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Add documentation to generate a beautified note preview.</div>
      </div>
    )
  } else if (!beautifyState || beautifyState.status === "idle") {
    mainContent = (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Select this view to generate a beautified version of your note.</div>
      </div>
    )
  } else if (beautifyState.status === "loading") {
    mainContent = (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Beautifying note…
        </div>
      </div>
    )
  } else if (beautifyState.status === "error" && !beautifyState.data) {
    mainContent = (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center text-sm text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>{beautifyState.error ?? "Unable to beautify the note."}</span>
          <Button size="sm" onClick={handleManualRefresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry beautify
          </Button>
        </div>
      </div>
    )
  } else {
    mainContent = (
      <div className="space-y-4">
        {beautifyState.status === "error" && beautifyState.error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Showing the most recent beautified draft. Latest request failed: {beautifyState.error}</span>
          </div>
        )}

        {beautifyState.isStale && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Beautified content may be out of date with the current draft.
          </div>
        )}

        {sections.length ? (
          sections.map((section) => (
            <Card key={section.key}>
              <CardHeader className="pb-3">
                <CardTitle className={`text-lg ${section.toneClass}`}>{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans">{section.content}</pre>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Beautification completed, but no structured content was returned.</div>
        )}
      </div>
    )
  }

  let statusBanner: JSX.Element | null = null
  if (exportStatus) {
    const baseBannerClasses = "flex items-center gap-2 px-4 py-3 text-sm border-t"
    if (exportStatus.state === "loading" || exportStatus.state === "pending") {
      const progressPercent = exportStatus.progress != null ? Math.round(exportStatus.progress * 100) : null
      statusBanner = (
        <div className={baseBannerClasses + " bg-muted/50 text-muted-foreground border-border"}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Exporting to EHR…
            {typeof progressPercent === "number" ? ` (${progressPercent}% complete)` : ""}
          </span>
        </div>
      )
    } else if (exportStatus.state === "success") {
      statusBanner = (
        <div className={baseBannerClasses + " bg-emerald-100 text-emerald-800 border-emerald-200"}>
          <CheckCircle2 className="h-4 w-4" />
          <span>Export completed successfully.</span>
        </div>
      )
    } else if (exportStatus.state === "error") {
      statusBanner = (
        <div className={baseBannerClasses + " bg-destructive/10 text-destructive border-destructive/20"}>
          <AlertTriangle className="h-4 w-4" />
          <span>{exportStatus.error ?? "Export failed. Please try again."}</span>
        </div>
      )
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex flex-col text-xs text-muted-foreground">
              <span>{metadataLabel}</span>
              {confidencePercent !== null && <span className="text-[11px] text-muted-foreground/80">Model confidence: {confidencePercent}%</span>}
            </div>
          </div>

          <Button onClick={handleExport} disabled={!exportNote.trim() || exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {exporting ? "Exporting…" : "Export to EHR"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">{mainContent}</div>

      {statusBanner}
    </div>
  )
}
