import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useAuth } from "./AuthContext"

type CodeCategory = "codes" | "prevention" | "diagnoses" | "differentials"

export interface SelectedCodesCounts {
  codes: number
  prevention: number
  diagnoses: number
  differentials: number
}

export interface SessionCode {
  code: string
  type: string
  category: CodeCategory
  description: string
  rationale?: string
  confidence?: number
  reimbursement?: string
  rvu?: string
}

export interface SuggestionCodeInput {
  code: string
  type: string
  category?: CodeCategory
  description: string
  rationale?: string
  confidence?: number
  reimbursement?: string
  rvu?: string
}

export interface LayoutPreferences {
  noteEditor: number
  suggestionPanel: number
}

interface SessionState {
  selectedCodes: SelectedCodesCounts
  selectedCodesList: SessionCode[]
  addedCodes: string[]
  isSuggestionPanelOpen: boolean
  layout: LayoutPreferences
}

interface SessionContextValue {
  state: SessionState
  hydrated: boolean
  syncing: boolean
  actions: {
    addCode: (code: SuggestionCodeInput) => void
    removeCode: (code: SessionCode, options?: { returnToSuggestions?: boolean; reasoning?: string }) => void
    changeCodeCategory: (code: SessionCode, newCategory: "diagnoses" | "differentials") => void
    setSuggestionPanelOpen: (open: boolean) => void
    setLayout: (layout: Partial<LayoutPreferences>) => void
    refresh: () => Promise<void>
    reset: () => void
  }
}

type SessionAction =
  | { type: "reset" }
  | { type: "hydrate"; payload: { session?: Partial<SessionState>; layout?: Partial<LayoutPreferences> } }
  | { type: "addCode"; payload: { code: SuggestionCodeInput } }
  | { type: "removeCode"; payload: { code: SessionCode; returnToSuggestions: boolean } }
  | { type: "changeCategory"; payload: { code: SessionCode; newCategory: "diagnoses" | "differentials" } }
  | { type: "setSuggestionPanelOpen"; payload: boolean }
  | { type: "setLayout"; payload: Partial<LayoutPreferences> }

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

const EMPTY_COUNTS: SelectedCodesCounts = {
  codes: 0,
  prevention: 0,
  diagnoses: 0,
  differentials: 0
}

function resolveCategory(code: SuggestionCodeInput | SessionCode): CodeCategory {
  if (code.category && ["codes", "prevention", "diagnoses", "differentials"].includes(code.category)) {
    return code.category as CodeCategory
  }
  const upperType = code.type?.toUpperCase?.() ?? ""
  if (upperType === "PREVENTION") {
    return "prevention"
  }
  if (upperType === "DIFFERENTIAL" || upperType === "DIFFERENTIALS") {
    return "differentials"
  }
  if (upperType === "ICD-10" || upperType === "ICD10") {
    return "diagnoses"
  }
  if (upperType === "CPT") {
    return "codes"
  }
  return "codes"
}

function normalizeCode(raw: SuggestionCodeInput | SessionCode): SessionCode {
  const category = resolveCategory(raw)
  return {
    code: String(raw.code),
    type: raw.type ?? "CPT",
    category,
    description: raw.description ?? "",
    rationale: raw.rationale,
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    reimbursement: raw.reimbursement,
    rvu: raw.rvu
  }
}

function countCodes(list: SessionCode[]): SelectedCodesCounts {
  return list.reduce<SelectedCodesCounts>((acc, item) => {
    const key = item.category
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, { ...EMPTY_COUNTS })
}

function createInitialSessionState(): SessionState {
  const initialCodes: SessionCode[] = [
    {
      code: "99213",
      type: "CPT",
      category: "codes",
      description: "Office visit, established patient",
      rationale: "Moderate complexity medical decision making with established patient visit",
      confidence: 87,
      reimbursement: "$127.42",
      rvu: "1.92"
    },
    {
      code: "99214",
      type: "CPT",
      category: "codes",
      description: "Office visit, established patient (moderate complexity)",
      rationale: "High complexity decision making documented with comprehensive assessment",
      confidence: 78,
      reimbursement: "$184.93",
      rvu: "2.80"
    },
    {
      code: "J06.9",
      type: "ICD-10",
      category: "diagnoses",
      description: "Acute upper respiratory infection, unspecified",
      rationale: "Primary diagnosis based on presenting symptoms and clinical findings",
      confidence: 92
    },
    {
      code: "J02.9",
      type: "ICD-10",
      category: "diagnoses",
      description: "Acute pharyngitis, unspecified",
      rationale: "Secondary diagnosis from physical examination findings",
      confidence: 84
    },
    {
      code: "Z23",
      type: "ICD-10",
      category: "diagnoses",
      description: "Encounter for immunization",
      rationale: "Patient received influenza vaccination during visit",
      confidence: 95
    },
    {
      code: "M25.50",
      type: "ICD-10",
      category: "diagnoses",
      description: "Pain in unspecified joint",
      rationale: "Patient reports joint discomfort as secondary concern",
      confidence: 78
    },
    {
      code: "Viral URI vs Bacterial Sinusitis",
      type: "DIFFERENTIAL",
      category: "differentials",
      description: "Primary differential diagnosis consideration",
      rationale: "85% confidence viral, 35% bacterial based on symptom pattern",
      confidence: 85
    }
  ]

  return {
    selectedCodes: countCodes(initialCodes),
    selectedCodesList: initialCodes,
    addedCodes: [],
    isSuggestionPanelOpen: true,
    layout: {
      noteEditor: 70,
      suggestionPanel: 30
    }
  }
}

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "reset":
      return createInitialSessionState()
    case "hydrate": {
      const base = createInitialSessionState()
      const session = action.payload.session ?? {}
      const layout = action.payload.layout ?? {}

      const list = Array.isArray(session.selectedCodesList) && session.selectedCodesList.length > 0
        ? session.selectedCodesList.map(normalizeCode)
        : base.selectedCodesList

      const selectedCodes = session.selectedCodes
        ? { ...base.selectedCodes, ...session.selectedCodes }
        : countCodes(list)

      const addedCodes = Array.isArray(session.addedCodes)
        ? session.addedCodes.map(value => String(value))
        : base.addedCodes

      const isSuggestionPanelOpen = typeof session.isSuggestionPanelOpen === "boolean"
        ? session.isSuggestionPanelOpen
        : base.isSuggestionPanelOpen

      const nextLayout: LayoutPreferences = {
        noteEditor: typeof layout.noteEditor === "number" ? layout.noteEditor : base.layout.noteEditor,
        suggestionPanel: typeof layout.suggestionPanel === "number" ? layout.suggestionPanel : base.layout.suggestionPanel
      }

      return {
        selectedCodes,
        selectedCodesList: list,
        addedCodes,
        isSuggestionPanelOpen,
        layout: nextLayout
      }
    }
    case "addCode": {
      const normalized = normalizeCode(action.payload.code)
      const list = [...state.selectedCodesList, normalized]
      const addedCodes = Array.from(new Set([...state.addedCodes, normalized.code]))
      return {
        ...state,
        selectedCodesList: list,
        selectedCodes: countCodes(list),
        addedCodes
      }
    }
    case "removeCode": {
      const index = state.selectedCodesList.findIndex(
        item => item.code === action.payload.code.code && item.category === action.payload.code.category
      )
      if (index === -1) {
        return state
      }
      const list = state.selectedCodesList.filter((_, idx) => idx !== index)
      const addedCodes = action.payload.returnToSuggestions
        ? state.addedCodes.filter(code => code !== action.payload.code.code)
        : state.addedCodes
      return {
        ...state,
        selectedCodesList: list,
        selectedCodes: countCodes(list),
        addedCodes
      }
    }
    case "changeCategory": {
      const list = state.selectedCodesList.map(item =>
        item.code === action.payload.code.code
          ? { ...item, category: action.payload.newCategory }
          : item
      )
      return {
        ...state,
        selectedCodesList: list,
        selectedCodes: countCodes(list)
      }
    }
    case "setSuggestionPanelOpen":
      return { ...state, isSuggestionPanelOpen: action.payload }
    case "setLayout":
      return {
        ...state,
        layout: {
          noteEditor: typeof action.payload.noteEditor === "number" ? action.payload.noteEditor : state.layout.noteEditor,
          suggestionPanel: typeof action.payload.suggestionPanel === "number"
            ? action.payload.suggestionPanel
            : state.layout.suggestionPanel
        }
      }
    default:
      return state
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    signal
  })

  if (response.status === 204 || response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`)
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error(`Failed to parse response from ${url}`, error)
    return null
  }
}

async function persistJson(url: string, payload: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload),
    signal
  })

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to persist data to ${url}: ${response.status}`)
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const [state, dispatch] = useReducer(sessionReducer, undefined, createInitialSessionState)
  const [hydrated, setHydrated] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const syncCounter = useRef(0)

  const startSync = useCallback(() => {
    syncCounter.current += 1
    setSyncing(true)
  }, [])

  const finishSync = useCallback(() => {
    syncCounter.current = Math.max(0, syncCounter.current - 1)
    if (syncCounter.current === 0) {
      setSyncing(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (auth.status !== "authenticated") {
      controllerRef.current?.abort()
      dispatch({ type: "reset" })
      setHydrated(false)
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setHydrated(false)

    try {
      const [sessionData, layoutData] = await Promise.all([
        fetchJson<Partial<SessionState>>("/api/user/session", controller.signal),
        fetchJson<Partial<LayoutPreferences>>("/api/user/layout-preferences", controller.signal)
      ])

      dispatch({
        type: "hydrate",
        payload: {
          session: sessionData ?? undefined,
          layout: layoutData ?? undefined
        }
      })
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        console.error("Failed to load session data", error)
      }
    } finally {
      if (!controller.signal.aborted) {
        setHydrated(true)
      }
    }
  }, [auth.status])

  const reset = useCallback(() => {
    dispatch({ type: "reset" })
  }, [])

  useEffect(() => {
    if (auth.status === "authenticated") {
      refresh()
    } else {
      controllerRef.current?.abort()
      dispatch({ type: "reset" })
      setHydrated(false)
    }
    return () => {
      controllerRef.current?.abort()
    }
  }, [auth.status, refresh])

  const sessionPayload = useMemo(
    () => ({
      selectedCodes: state.selectedCodes,
      selectedCodesList: state.selectedCodesList,
      addedCodes: state.addedCodes,
      isSuggestionPanelOpen: state.isSuggestionPanelOpen
    }),
    [state.selectedCodes, state.selectedCodesList, state.addedCodes, state.isSuggestionPanelOpen]
  )

  const layoutPayload = useMemo(() => state.layout, [state.layout])

  useEffect(() => {
    if (!hydrated || auth.status !== "authenticated") {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      startSync()
      persistJson("/api/user/session", sessionPayload, controller.signal)
        .catch(error => {
          if ((error as DOMException)?.name !== "AbortError") {
            console.error("Failed to persist session state", error)
          }
        })
        .finally(() => {
          finishSync()
        })
    }, 400)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [sessionPayload, hydrated, auth.status, startSync, finishSync])

  useEffect(() => {
    if (!hydrated || auth.status !== "authenticated") {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      startSync()
      persistJson("/api/user/layout-preferences", layoutPayload, controller.signal)
        .catch(error => {
          if ((error as DOMException)?.name !== "AbortError") {
            console.error("Failed to persist layout preferences", error)
          }
        })
        .finally(() => {
          finishSync()
        })
    }, 400)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [layoutPayload, hydrated, auth.status, startSync, finishSync])

  const addCode = useCallback((code: SuggestionCodeInput) => {
    dispatch({ type: "addCode", payload: { code } })
  }, [])

  const removeCode = useCallback(
    (code: SessionCode, options?: { returnToSuggestions?: boolean; reasoning?: string }) => {
      if (options?.reasoning) {
        console.debug("Code removed", { code, reasoning: options.reasoning })
      }
      dispatch({
        type: "removeCode",
        payload: {
          code,
          returnToSuggestions: Boolean(options?.returnToSuggestions)
        }
      })
    },
    []
  )

  const changeCodeCategory = useCallback((code: SessionCode, newCategory: "diagnoses" | "differentials") => {
    dispatch({ type: "changeCategory", payload: { code, newCategory } })
  }, [])

  const setSuggestionPanelOpen = useCallback((open: boolean) => {
    dispatch({ type: "setSuggestionPanelOpen", payload: open })
  }, [])

  const setLayout = useCallback((layout: Partial<LayoutPreferences>) => {
    dispatch({ type: "setLayout", payload: layout })
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      hydrated,
      syncing,
      actions: {
        addCode,
        removeCode,
        changeCodeCategory,
        setSuggestionPanelOpen,
        setLayout,
        refresh,
        reset
      }
    }),
    [state, hydrated, syncing, addCode, removeCode, changeCodeCategory, setSuggestionPanelOpen, setLayout, refresh, reset]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider")
  }
  return context
}
