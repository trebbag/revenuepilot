import { useCallback, useEffect, useMemo, useState } from "react"

import type { ContextStageState } from "../../hooks/useContextStage"
import { useContextStage } from "../../hooks/useContextStage"
import { apiFetchJson } from "../../lib/api"

export interface ChartContextDocument {
  docId: string
  name: string | null
  pages: number | null
}

export interface ChartFactAnchor {
  sourceDocId: string | null
  sourceName?: string | null
  page?: number | null
  offset?: number | null
  offsetEnd?: number | null
}

export interface ChartFactHistoryEntry {
  date?: string | null
  value?: unknown
  unit?: string | null
  context?: string | null
  notes?: string | null
  detail?: string | null
  evidence?: ChartFactAnchor[]
  anchors?: ChartFactAnchor[]
}

export interface ChartFact {
  label?: string
  code?: string
  value?: unknown
  unit?: string | null
  status?: string | null
  date?: string | null
  rxnorm?: string | null
  snomed?: string | null
  frequency?: string | null
  route?: string | null
  dose_text?: string | null
  history?: ChartFactHistoryEntry[]
  evidence?: ChartFactAnchor[]
  anchors?: ChartFactAnchor[]
  [key: string]: unknown
}

export interface ChartContextFacts {
  pmh: ChartFact[]
  meds: ChartFact[]
  allergies: ChartFact[]
  labs: ChartFact[]
  vitals: ChartFact[]
  superficialSummary?: Record<string, unknown> | null
}

export interface UseChartContextOptions {
  enabled?: boolean
}

export interface UseChartContextResult {
  facts: ChartContextFacts | null
  filteredFacts: ChartContextFacts | null
  loading: boolean
  error: string | null
  searchQuery: string
  setSearchQuery: (value: string) => void
  searching: boolean
  searchError: string | null
  documents: Record<string, ChartContextDocument>
  generatedAt: string | null
  stageState: ContextStageState
}

const EMPTY_FACTS: ChartContextFacts = {
  pmh: [],
  meds: [],
  allergies: [],
  labs: [],
  vitals: [],
  superficialSummary: null,
}

function normalizeDocuments(snapshot: any): Record<string, ChartContextDocument> {
  const result: Record<string, ChartContextDocument> = {}
  const documents = snapshot?.provenance?.documents
  if (Array.isArray(documents)) {
    for (const entry of documents) {
      const docId =
        typeof entry?.doc_id === "string"
          ? entry.doc_id
          : typeof entry?.docId === "string"
            ? entry.docId
            : typeof entry?.sourceDocId === "string"
              ? entry.sourceDocId
              : null
      if (!docId) {
        continue
      }
      const name = typeof entry?.name === "string" ? entry.name : null
      const pages =
        typeof entry?.pages === "number"
          ? entry.pages
          : typeof entry?.pageCount === "number"
            ? entry.pageCount
            : null
      result[docId] = { docId, name, pages }
    }
  }
  return result
}

function normalizeFacts(snapshot: any): ChartContextFacts {
  const base: ChartContextFacts = {
    pmh: Array.isArray(snapshot?.pmh) ? (snapshot.pmh as ChartFact[]) : [],
    meds: Array.isArray(snapshot?.meds) ? (snapshot.meds as ChartFact[]) : [],
    allergies: Array.isArray(snapshot?.allergies) ? (snapshot.allergies as ChartFact[]) : [],
    labs: Array.isArray(snapshot?.labs) ? (snapshot.labs as ChartFact[]) : [],
    vitals: Array.isArray(snapshot?.vitals) ? (snapshot.vitals as ChartFact[]) : [],
    superficialSummary:
      snapshot?.stage === "superficial" && snapshot?.summary && typeof snapshot.summary === "object"
        ? (snapshot.summary as Record<string, unknown>)
        : null,
  }

  // Fallback for legacy payloads that only expose summary
  if (base.pmh.length === 0 && Array.isArray(snapshot?.summary?.problems)) {
    base.pmh = snapshot.summary.problems as ChartFact[]
  }
  if (base.meds.length === 0 && Array.isArray(snapshot?.summary?.medications)) {
    base.meds = snapshot.summary.medications as ChartFact[]
  }
  if (base.allergies.length === 0 && Array.isArray(snapshot?.summary?.allergies)) {
    base.allergies = snapshot.summary.allergies as ChartFact[]
  }
  if (base.labs.length === 0 && Array.isArray(snapshot?.summary?.labs)) {
    base.labs = snapshot.summary.labs as ChartFact[]
  }
  if (base.vitals.length === 0 && Array.isArray(snapshot?.summary?.vitals)) {
    base.vitals = snapshot.summary.vitals as ChartFact[]
  }

  return base
}

function formatSearchResults(payload: any): ChartContextFacts | null {
  if (!payload || typeof payload !== "object") {
    return null
  }
  const categories = {
    pmh: [] as ChartFact[],
    meds: [] as ChartFact[],
    allergies: [] as ChartFact[],
    labs: [] as ChartFact[],
    vitals: [] as ChartFact[],
  }
  const results = Array.isArray(payload.results) ? payload.results : []
  for (const result of results) {
    const category = typeof result?.category === "string" ? result.category : ""
    const fact = result?.fact
    if (!Array.isArray(categories[category as keyof typeof categories])) {
      continue
    }
    if (fact && typeof fact === "object") {
      categories[category as keyof typeof categories].push(fact as ChartFact)
    }
  }
  return {
    ...categories,
    superficialSummary: null,
  }
}

export function useChartContext(
  patientId?: string | null,
  options: UseChartContextOptions = {},
): UseChartContextResult {
  const enabled = Boolean(options.enabled && patientId && patientId.trim().length > 0)
  const [facts, setFacts] = useState<ChartContextFacts | null>(null)
  const [filteredFacts, setFilteredFacts] = useState<ChartContextFacts | null>(null)
  const [documents, setDocuments] = useState<Record<string, ChartContextDocument>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQueryState] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const stageState = useContextStage(null, { patientId: enabled ? patientId : null })

  useEffect(() => {
    if (!enabled) {
      return
    }
    setError(null)
    setLoading(true)
    const controller = new AbortController()
    const url = stageState.snapshotUrl
    if (!url) {
      setFacts(null)
      setDocuments({})
      setGeneratedAt(stageState.contextGeneratedAt)
      setLoading(false)
      return () => controller.abort()
    }

    apiFetchJson(url, { signal: controller.signal })
      .then((snapshot) => {
        if (!snapshot) {
          setFacts(EMPTY_FACTS)
          setDocuments({})
          setGeneratedAt(stageState.contextGeneratedAt)
          return
        }
        const normalized = normalizeFacts(snapshot)
        setFacts(normalized)
        setFilteredFacts(null)
        setDocuments(normalizeDocuments(snapshot))
        const generated =
          typeof snapshot?.provenance?.generated_at === "string"
            ? snapshot.provenance.generated_at
            : typeof snapshot?.provenance?.generatedAt === "string"
              ? snapshot.provenance.generatedAt
              : null
        setGeneratedAt(generated ?? stageState.contextGeneratedAt)
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) {
          return
        }
        console.error("Failed to load chart context snapshot", fetchError)
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load chart context")
        setFacts(null)
        setDocuments({})
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [enabled, patientId, stageState.snapshotUrl, stageState.contextGeneratedAt])

  useEffect(() => {
    if (!enabled) {
      setSearchQueryState("")
      setFilteredFacts(null)
      setSearching(false)
      setSearchError(null)
      return
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setFilteredFacts(null)
      setSearchError(null)
      setSearching(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setSearching(true)
      apiFetchJson(`/api/patients/${encodeURIComponent(patientId ?? "")}/context/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((payload) => {
          if (controller.signal.aborted) {
            return
          }
          const normalized = formatSearchResults(payload)
          setFilteredFacts(normalized ?? EMPTY_FACTS)
          setSearchError(null)
        })
        .catch((fetchError) => {
          if (controller.signal.aborted) {
            return
          }
          console.error("Chart context search failed", fetchError)
          setSearchError(fetchError instanceof Error ? fetchError.message : "Search failed")
          setFilteredFacts(EMPTY_FACTS)
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false)
          }
        })
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
      setSearching(false)
    }
  }, [enabled, patientId, searchQuery])

  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryState(value)
  }, [])

  const derivedFacts = useMemo(() => facts ?? null, [facts])

  return {
    facts: derivedFacts,
    filteredFacts,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    searching,
    searchError,
    documents,
    generatedAt: stageState.contextGeneratedAt ?? generatedAt,
    stageState,
  }
}
