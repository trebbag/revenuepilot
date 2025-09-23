import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { apiFetchJson, getStoredToken, resolveWebsocketUrl } from "../lib/api"

export interface ContextStageProgress {
  state?: string | null
  percent?: number | null
  started_at?: string | null
  finished_at?: string | null
  eta_sec?: number | null
  doc_count?: number | null
}

export interface ContextStageState {
  correlationId: string | null
  stages: Record<string, ContextStageProgress>
  profile: string | null
  lastUpdated: string | null
  bestStage: string | null
  availableStages: string[]
  snapshotUrl: string | null
  contextGeneratedAt: string | null
}

export interface UseContextStageOptions {
  patientId?: string | null
}

const STAGE_ORDER = ["superficial", "deep", "indexed"]

function determineBestStage(stages: Record<string, ContextStageProgress>): string | null {
  for (let i = STAGE_ORDER.length - 1; i >= 0; i -= 1) {
    const stage = STAGE_ORDER[i]
    const info = stages[stage]
    if (info && info.state === "completed") {
      return stage
    }
  }
  return null
}

function deriveAvailableStages(stages: Record<string, ContextStageProgress>): string[] {
  return STAGE_ORDER.filter((stage) => stages[stage]?.state === "completed")
}

export function useContextStage(
  correlationId?: string | null,
  options?: UseContextStageOptions,
): ContextStageState {
  const [currentCorrelationId, setCurrentCorrelationId] = useState<string | null>(correlationId ?? null)
  const [state, setState] = useState<ContextStageState>({
    correlationId: correlationId ?? null,
    stages: {},
    profile: null,
    lastUpdated: null,
    bestStage: null,
    availableStages: [],
    snapshotUrl: null,
    contextGeneratedAt: null,
  })
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (correlationId) {
      setCurrentCorrelationId(correlationId)
    }
  }, [correlationId])

  const applyStatus = useCallback(
    async (payload: any, patientId?: string | null) => {
      const stages = payload?.stages && typeof payload.stages === "object" ? (payload.stages as Record<string, ContextStageProgress>) : {}
      const availableStages = deriveAvailableStages(stages)
      const bestStage = determineBestStage(stages)
      const correlation = payload?.correlation_id ?? payload?.correlationId ?? currentCorrelationId
      if (correlation && correlation !== currentCorrelationId) {
        setCurrentCorrelationId(correlation)
      }
      let snapshotUrl: string | null = null
      let generatedAt: string | null = null
      if (bestStage && patientId) {
        const stageParam = bestStage === "indexed" ? "final" : bestStage
        snapshotUrl = `/api/patients/${patientId}/context?stage=${stageParam}`
        try {
          const snapshot = await apiFetchJson<any>(snapshotUrl)
          generatedAt = snapshot?.provenance?.generated_at ?? snapshot?.provenance?.generatedAt ?? null
        } catch {
          generatedAt = null
        }
      }
      setState((prev) => ({
        correlationId: correlation ?? prev.correlationId ?? null,
        stages: { ...prev.stages, ...stages },
        profile: payload?.profile ?? prev.profile ?? null,
        lastUpdated: payload?.last_updated ?? prev.lastUpdated ?? null,
        bestStage: bestStage ?? prev.bestStage ?? null,
        availableStages,
        snapshotUrl: snapshotUrl ?? prev.snapshotUrl ?? null,
        contextGeneratedAt: generatedAt ?? prev.contextGeneratedAt ?? null,
      }))
    },
    [currentCorrelationId],
  )

  useEffect(() => {
    let cancelled = false
    const patientId = options?.patientId?.trim()
    if (!patientId) {
      return () => {
        cancelled = true
      }
    }
    ;(async () => {
      try {
        const status = await apiFetchJson<any>(`/api/patients/${encodeURIComponent(patientId)}/context/status`)
        if (cancelled) {
          return
        }
        await applyStatus(status, patientId)
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            correlationId: prev.correlationId ?? currentCorrelationId,
            stages: prev.stages,
            profile: prev.profile,
            lastUpdated: prev.lastUpdated,
            bestStage: prev.bestStage,
            availableStages: prev.availableStages,
            snapshotUrl: prev.snapshotUrl,
            contextGeneratedAt: prev.contextGeneratedAt,
          }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyStatus, currentCorrelationId, options?.patientId])

  useEffect(() => {
    const correlation = currentCorrelationId
    if (!correlation) {
      return () => undefined
    }
    if (typeof window === "undefined") {
      return () => undefined
    }

    let closed = false

    const connect = () => {
      if (closed) {
        return
      }
      const baseUrl = resolveWebsocketUrl(`/ws/context/${correlation}`)
      const url = new URL(baseUrl)
      const patientId = options?.patientId?.trim()
      if (patientId) {
        url.searchParams.set("patient_id", patientId)
      }
      const token = getStoredToken()
      const socket = token ? new WebSocket(url.toString(), ["authorization", `Bearer ${token}`]) : new WebSocket(url.toString())
      socketRef.current = socket

      const handlePayload = (payload: any) => {
        if (closed || !payload) {
          return
        }
        try {
          const eventType: string = payload?.event
          if (eventType === "context:stage") {
            const stage = payload?.stage
            if (typeof stage === "string") {
              setState((prev) => ({
                ...prev,
                correlationId: payload?.correlation_id ?? prev.correlationId ?? correlation,
                stages: {
                  ...prev.stages,
                  [stage]: {
                    ...prev.stages[stage],
                    state: payload?.state ?? payload?.status ?? prev.stages[stage]?.state,
                    percent: payload?.percent ?? prev.stages[stage]?.percent,
                  },
                },
              }))
            }
          } else if (eventType === "context:progress") {
            const stage = payload?.stage
            if (typeof stage === "string") {
              setState((prev) => ({
                ...prev,
                stages: {
                  ...prev.stages,
                  [stage]: {
                    ...prev.stages[stage],
                    percent: payload?.percent ?? prev.stages[stage]?.percent,
                    state: payload?.state ?? prev.stages[stage]?.state,
                  },
                },
              }))
            }
          } else if (eventType === "context:ready") {
            setState((prev) => ({
              ...prev,
              correlationId: payload?.correlation_id ?? prev.correlationId ?? correlation,
              availableStages: Array.isArray(payload?.available_stages)
                ? (payload.available_stages as string[])
                : prev.availableStages,
              bestStage: typeof payload?.best_stage === "string" ? payload.best_stage : prev.bestStage,
              snapshotUrl: typeof payload?.snapshot_url === "string" ? payload.snapshot_url : prev.snapshotUrl,
            }))
            const bestStage = typeof payload?.best_stage === "string" ? payload.best_stage : undefined
            const patientId = options?.patientId?.trim()
            if (bestStage && patientId) {
              const stageParam = bestStage === "indexed" ? "final" : bestStage
              const snapshotUrl = `/api/patients/${patientId}/context?stage=${stageParam}`
              void apiFetchJson<any>(snapshotUrl)
                .then((snapshot) => {
                  const generated = snapshot?.provenance?.generated_at ?? snapshot?.provenance?.generatedAt
                  if (generated) {
                    setState((prev) => ({ ...prev, contextGeneratedAt: generated, snapshotUrl }))
                  }
                })
                .catch(() => undefined)
            }
          } else if (eventType === "context:error") {
            const stage = payload?.stage
            if (typeof stage === "string") {
              setState((prev) => ({
                ...prev,
                stages: {
                  ...prev.stages,
                  [stage]: {
                    ...prev.stages[stage],
                    state: "failed",
                  },
                },
              }))
            }
          }
        } catch (error) {
          console.error("Failed to process context stage event", error)
        }
      }

      socket.onmessage = (event) => {
        if (closed) {
          return
        }
        if (typeof event.data === "string") {
          try {
            handlePayload(JSON.parse(event.data))
          } catch (error) {
            console.error("Failed to parse context stage payload", error)
          }
        } else if (event.data instanceof Blob) {
          event.data
            .text()
            .then((text) => {
              try {
                handlePayload(JSON.parse(text))
              } catch (error) {
                console.error("Failed to parse context stage payload", error)
              }
            })
            .catch((error) => {
              console.error("Failed to read context stage payload", error)
            })
        } else if (event.data instanceof ArrayBuffer) {
          try {
            const decoded = new TextDecoder().decode(event.data)
            handlePayload(JSON.parse(decoded))
          } catch (error) {
            console.error("Failed to parse context stage payload", error)
          }
        }
      }

      socket.onclose = () => {
        socketRef.current = null
        if (!closed) {
          reconnectTimerRef.current = window.setTimeout(connect, 1000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (socketRef.current) {
        try {
          socketRef.current.close()
        } catch {
          // ignore
        }
        socketRef.current = null
      }
    }
  }, [currentCorrelationId, options?.patientId, state.availableStages, state.bestStage, state.stages])

  return useMemo(
    () => ({
      correlationId: state.correlationId,
      stages: state.stages,
      profile: state.profile,
      lastUpdated: state.lastUpdated,
      bestStage: state.bestStage,
      availableStages: state.availableStages,
      snapshotUrl: state.snapshotUrl,
      contextGeneratedAt: state.contextGeneratedAt,
    }),
    [state],
  )
}

export default useContextStage
