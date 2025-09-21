import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DateRange } from "react-day-picker"

import { apiFetchJson } from "../lib/api"

export type ActivityCategory = "documentation" | "schedule" | "settings" | "auth" | "system" | "backend"

export type ActivitySeverity = "info" | "warning" | "error" | "success"

export interface ActivityEntry {
  id: string
  timestamp: string
  action: string
  category: ActivityCategory
  description: string
  userId: string
  userName: string
  severity: ActivitySeverity
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

interface ApiActivityLogEntry {
  id: number | string
  timestamp: string
  username?: string | null
  action: string
  details?: unknown
}

interface ApiActivityLogResponse {
  entries?: ApiActivityLogEntry[]
  next?: number | null
  count?: number
}

const KNOWN_CATEGORIES: ActivityCategory[] = ["documentation", "schedule", "settings", "auth", "system", "backend"]

const KNOWN_SEVERITIES: ActivitySeverity[] = ["info", "warning", "error", "success"]

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGES = 5

export interface ActivityLogFilters {
  dateRange?: DateRange
  category: string
  severity: string
  search: string
  includeBackend: boolean
}

export interface UseActivityLogResult {
  entries: ActivityEntry[]
  rawEntries: ActivityEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  lastUpdated: number | null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const toIsoString = (value: number | string) => {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : String(value)
}

const normalizeUserName = (username?: string | null): { id: string; name: string } => {
  if (username && username.trim().length > 0) {
    return { id: username, name: username }
  }
  return { id: "system", name: "System" }
}

const pickCategory = (action: string, username: string | null | undefined, details: Record<string, unknown> | undefined): ActivityCategory => {
  const detailCategory = details?.category
  if (typeof detailCategory === "string" && (KNOWN_CATEGORIES as string[]).includes(detailCategory)) {
    return detailCategory as ActivityCategory
  }

  if (!username) {
    return "backend"
  }

  const actionText = action.toLowerCase()
  const path = typeof details?.path === "string" ? details.path.toLowerCase() : ""

  if (actionText.includes("note") || actionText.includes("document")) {
    return "documentation"
  }
  if (actionText.includes("schedule") || actionText.includes("appointment")) {
    return "schedule"
  }
  if (actionText.includes("setting") || actionText.includes("config") || path.includes("settings")) {
    return "settings"
  }
  if (actionText.includes("login") || actionText.includes("logout") || actionText.includes("auth") || actionText.includes("token") || actionText.includes("register")) {
    return "auth"
  }
  if (path.includes("schedule")) {
    return "schedule"
  }
  if (path.includes("templates") || path.includes("settings")) {
    return "settings"
  }

  return "system"
}

const pickSeverity = (action: string, details: Record<string, unknown> | undefined): ActivitySeverity => {
  const detailSeverity = details?.severity
  if (typeof detailSeverity === "string" && (KNOWN_SEVERITIES as string[]).includes(detailSeverity)) {
    return detailSeverity as ActivitySeverity
  }

  const actionLower = action.toLowerCase()
  const status = typeof details?.status === "string" ? details.status.toLowerCase() : ""

  if (actionLower.includes("fail") || actionLower.includes("error") || actionLower.includes("denied") || actionLower.includes("invalid") || status.includes("fail") || status.includes("error")) {
    return "error"
  }

  if (actionLower.includes("warn") || status.includes("warn")) {
    return "warning"
  }

  if (
    actionLower.includes("success") ||
    actionLower.includes("created") ||
    actionLower.includes("updated") ||
    actionLower.includes("login") ||
    actionLower.includes("logout") ||
    actionLower.includes("register")
  ) {
    return "success"
  }

  return "info"
}

const describeDetails = (action: string, details: Record<string, unknown> | undefined, fallbackUser: string) => {
  if (!details) {
    return action
  }

  const descriptionFields = ["description", "message", "detail", "summary"] as const
  for (const field of descriptionFields) {
    const value = details[field]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }

  if (typeof details.reason === "string" && details.reason.trim().length > 0) {
    return `Reason: ${details.reason}`
  }

  const method = typeof details.method === "string" ? details.method.toUpperCase() : undefined
  const path = typeof details.path === "string" ? details.path : undefined
  if (method || path) {
    return [method, path].filter(Boolean).join(" ") || action
  }

  if (typeof details.action === "string" && details.action.trim().length > 0) {
    return details.action
  }

  if (typeof details.client === "string" && details.client.trim().length > 0) {
    return `Request from ${details.client}`
  }

  const role = typeof details.role === "string" ? details.role : undefined
  if (role) {
    return `${fallbackUser} performed an action as ${role}`
  }

  return action
}

const normalizeDetails = (value: unknown): Record<string, unknown> | undefined => {
  if (isPlainObject(value)) {
    return value
  }
  return undefined
}

const mapActivityEntry = (entry: ApiActivityLogEntry): ActivityEntry => {
  const details = normalizeDetails(entry.details)
  const user = normalizeUserName(entry.username)
  const category = pickCategory(entry.action, entry.username, details)
  const severity = pickSeverity(entry.action, details)
  const description = describeDetails(entry.action, details, user.name)

  return {
    id: String(entry.id),
    timestamp: toIsoString(entry.timestamp),
    action: entry.action,
    category,
    description,
    userId: user.id,
    userName: user.name,
    severity,
    details,
    ipAddress: typeof details?.client === "string" ? details.client : undefined,
    userAgent: typeof details?.userAgent === "string" ? details.userAgent : undefined,
  }
}

const fetchActivityPages = async (signal?: AbortSignal): Promise<ActivityEntry[]> => {
  const collected: ActivityEntry[] = []
  let cursor: number | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(DEFAULT_PAGE_SIZE) })
    if (cursor !== null) {
      params.set("cursor", String(cursor))
    }

    const response = await apiFetchJson<ApiActivityLogResponse>(`/api/activity/log?${params.toString()}`, {
      signal,
    })

    if (!response) {
      break
    }

    const entries = Array.isArray(response.entries) ? response.entries : []
    if (entries.length === 0) {
      break
    }

    for (const rawEntry of entries) {
      try {
        collected.push(mapActivityEntry(rawEntry))
      } catch {
        // Skip malformed entries but continue processing the rest
      }
    }

    if (response.next == null) {
      break
    }

    if (cursor !== null && response.next === cursor) {
      break
    }

    cursor = response.next
  }

  return collected
}

const startOfDay = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const endOfDay = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

const matchesDateRange = (timestamp: string, range?: DateRange) => {
  if (!range?.from && !range?.to) {
    return true
  }

  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) {
    return true
  }

  if (range.from && value < startOfDay(range.from)) {
    return false
  }

  if (range.to && value > endOfDay(range.to)) {
    return false
  }

  return true
}

const matchesSearch = (entry: ActivityEntry, term: string) => {
  const search = term.trim().toLowerCase()
  if (!search) {
    return true
  }

  const haystack = [entry.action, entry.description, entry.userName, entry.category, entry.severity, entry.details ? JSON.stringify(entry.details) : ""].filter(Boolean).join(" ").toLowerCase()

  return haystack.includes(search)
}

const applyFilters = (entries: ActivityEntry[], filters: ActivityLogFilters) => {
  return entries.filter((entry) => {
    if (!filters.includeBackend && entry.category === "backend") {
      return false
    }

    if (filters.category !== "all" && filters.category && entry.category !== filters.category) {
      return false
    }

    if (filters.severity !== "all" && filters.severity && entry.severity !== filters.severity) {
      return false
    }

    if (!matchesDateRange(entry.timestamp, filters.dateRange)) {
      return false
    }

    if (!matchesSearch(entry, filters.search)) {
      return false
    }

    return true
  })
}

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || "Unable to load activity log"
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }
  return "Unable to load activity log"
}

export function useActivityLog(filters: ActivityLogFilters, { pollIntervalMs = 60_000 }: { pollIntervalMs?: number } = {}): UseActivityLogResult {
  const [rawEntries, setRawEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const lastUpdatedRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const loadEntries = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    try {
      const entries = await fetchActivityPages(controller.signal)
      if (!controller.signal.aborted && mountedRef.current) {
        setRawEntries(entries)
        setError(null)
        lastUpdatedRef.current = Date.now()
      }
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(normalizeError(err))
      }
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return
    }

    const interval = window.setInterval(() => {
      void loadEntries()
    }, pollIntervalMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadEntries, pollIntervalMs])

  const filteredEntries = useMemo(() => applyFilters(rawEntries, filters), [rawEntries, filters])

  const refresh = useCallback(async () => {
    await loadEntries()
  }, [loadEntries])

  return {
    entries: filteredEntries,
    rawEntries,
    loading,
    error,
    refresh,
    lastUpdated: lastUpdatedRef.current,
  }
}
