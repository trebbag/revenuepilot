import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import {
  X,
  ChevronDown,
  ChevronRight,
  Code,
  Shield,
  Heart,
  Stethoscope,
  Calendar,
  Plus,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  Minus,
  ExternalLink,
  TestTube,
  AlertTriangle,
  Loader2
} from "lucide-react"
import { apiFetch } from "../lib/api"
import { useSession } from "../contexts/SessionContext"

interface SuggestionPanelProps {
  onClose: () => void
  noteContent?: string
}

interface DifferentialItem {
  diagnosis: string
  icdCode?: string
  icdDescription?: string
  confidence?: number
  reasoning?: string
  supportingFactors?: string[]
  contradictingFactors?: string[]
  whatItIs?: string
  details?: string
  forFactors?: string[]
  againstFactors?: string[]
  confidenceFactors?: string
  learnMoreUrl?: string
  testsToConfirm?: string[]
  testsToExclude?: string[]
}

interface CodeSuggestionItem {
  code: string
  type?: string
  description?: string
  rationale?: string
  reasoning?: string
  confidence?: number
  whatItIs?: string
  usageRules?: string[]
  reasonsSuggested?: string[]
  potentialConcerns?: string[]
}

interface ComplianceAlertItem {
  text: string
  category?: string
  priority?: string
  confidence?: number
  reasoning?: string
}

interface PreventionSuggestionItem {
  id: string
  code: string
  type: string
  category: string
  recommendation: string
  priority?: string
  source?: string
  confidence?: number
  reasoning?: string
  ageRelevant?: boolean
  description?: string
  rationale?: string
}

const SUGGESTION_REFRESH_INTERVAL = 2_000
const SUGGESTION_MAX_BACKOFF = 30_000

const parseRetryAfterMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 1_000 ? Math.round(value) : Math.round(value * 1_000)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed >= 1_000 ? Math.round(parsed) : Math.round(parsed * 1_000)
    }
  }
  return null
}

type CardKey = "codes" | "compliance" | "prevention" | "differentials" | "followUp"

export function SuggestionPanel({ onClose, noteContent = "" }: SuggestionPanelProps) {
  const { state: sessionState, actions: sessionActions } = useSession()
  const { selectedCodesList, addedCodes } = sessionState
  const [codeSuggestions, setCodeSuggestions] = useState<CodeSuggestionItem[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [codesError, setCodesError] = useState<string | null>(null)
  const [codesServiceStatus, setCodesServiceStatus] = useState<"online" | "degraded">("online")
  const [codesRetrySeconds, setCodesRetrySeconds] = useState<number | null>(null)

  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlertItem[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [complianceServiceStatus, setComplianceServiceStatus] = useState<"online" | "degraded">("online")
  const [complianceRetrySeconds, setComplianceRetrySeconds] = useState<number | null>(null)

  const [differentialSuggestions, setDifferentialSuggestions] = useState<DifferentialItem[]>([])
  const [differentialsLoading, setDifferentialsLoading] = useState(false)
  const [differentialsError, setDifferentialsError] = useState<string | null>(null)
  const [differentialsServiceStatus, setDifferentialsServiceStatus] = useState<"online" | "degraded">("online")
  const [differentialsRetrySeconds, setDifferentialsRetrySeconds] = useState<number | null>(null)

  const [preventionSuggestions, setPreventionSuggestions] = useState<PreventionSuggestionItem[]>([])
  const [preventionLoading, setPreventionLoading] = useState(false)
  const [preventionError, setPreventionError] = useState<string | null>(null)
  const [preventionServiceStatus, setPreventionServiceStatus] = useState<"online" | "degraded">("online")
  const [preventionRetrySeconds, setPreventionRetrySeconds] = useState<number | null>(null)

  const [expandedCards, setExpandedCards] = useState({
    codes: true,
    compliance: true,
    prevention: false,
    differentials: true,
    followUp: false
  })

  const [showConfidenceWarning, setShowConfidenceWarning] = useState(false)
  const [selectedDifferential, setSelectedDifferential] = useState<DifferentialItem | null>(null)

  const codesAbortRef = useRef<AbortController | null>(null)
  const codesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const codesRetryAttemptRef = useRef(0)
  const codesCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const complianceAbortRef = useRef<AbortController | null>(null)
  const complianceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const complianceRetryAttemptRef = useRef(0)
  const complianceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const differentialsAbortRef = useRef<AbortController | null>(null)
  const differentialsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const differentialsRetryAttemptRef = useRef(0)
  const differentialsCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const preventionAbortRef = useRef<AbortController | null>(null)
  const preventionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preventionRetryAttemptRef = useRef(0)
  const preventionCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearServiceCountdown = useCallback(
    (
      ref: MutableRefObject<ReturnType<typeof setInterval> | null>,
      setter: (value: number | null) => void
    ) => {
      if (ref.current) {
        clearInterval(ref.current)
        ref.current = null
      }
      setter(null)
    },
    []
  )

  const startServiceCountdown = useCallback(
    (
      delayMs: number,
      ref: MutableRefObject<ReturnType<typeof setInterval> | null>,
      setter: (value: number | null) => void
    ) => {
      clearServiceCountdown(ref, setter)
      if (delayMs <= 0) {
        setter(null)
        return
      }
      const end = Date.now() + delayMs
      setter(Math.ceil(delayMs / 1_000))
      ref.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1_000))
        setter(remaining > 0 ? remaining : null)
        if (remaining <= 0 && ref.current) {
          clearInterval(ref.current)
          ref.current = null
        }
      }, 1_000)
    },
    [clearServiceCountdown]
  )

  const trimmedNoteContent = useMemo(() => noteContent?.trim() ?? "", [noteContent])

  const fetchCodeSuggestions = useCallback(async () => {
    if (codesTimeoutRef.current) {
      clearTimeout(codesTimeoutRef.current)
      codesTimeoutRef.current = null
    }

    if (!trimmedNoteContent) {
      codesAbortRef.current?.abort()
      codesAbortRef.current = null
      setCodesLoading(false)
      setCodesError(null)
      setCodesServiceStatus("online")
      setCodeSuggestions([])
      codesRetryAttemptRef.current = 0
      clearServiceCountdown(codesCountdownRef, setCodesRetrySeconds)
      return
    }

    codesAbortRef.current?.abort()
    const controller = new AbortController()
    codesAbortRef.current = controller

    const attempt = codesRetryAttemptRef.current
    if (attempt === 0) {
      setCodesLoading(true)
      setCodesError(null)
    }

    let nextDelay = SUGGESTION_REFRESH_INTERVAL
    let explicitRetry: number | null = null

    try {
      const response = await apiFetch("/api/ai/codes/suggest", {
        method: "POST",
        jsonBody: { content: trimmedNoteContent },
        signal: controller.signal
      })

      if (!response.ok) {
        let message = `Unable to load code suggestions (${response.status})`
        explicitRetry = parseRetryAfterMs(response.headers.get("Retry-After"))
        try {
          const body = await response.json()
          if (body && typeof body === "object") {
            const bodyRecord = body as Record<string, unknown>
            if (typeof bodyRecord.message === "string") {
              message = bodyRecord.message
            }
            const retryField =
              bodyRecord.retryAfter ?? bodyRecord.retry_after ?? bodyRecord.retry_delay
            const parsedRetry = parseRetryAfterMs(retryField)
            if (parsedRetry !== null) {
              explicitRetry = parsedRetry
            }
          }
        } catch (parseError) {
          console.debug("Failed to parse code suggestion error payload", parseError)
        }

        if (explicitRetry !== null) {
          nextDelay = explicitRetry
        }

        throw new Error(message)
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>))
      const normalized: CodeSuggestionItem[] = Array.isArray((data as any)?.suggestions)
        ? ((data as any).suggestions as any[]).map((item: any) => ({
            code: item?.code ?? "",
            type: item?.type ?? "CPT",
            description: item?.description,
            rationale: item?.reasoning ?? item?.description,
            reasoning: item?.reasoning,
            confidence:
              typeof item?.confidence === "number"
                ? Math.round(item.confidence * 100)
                : typeof item?.confidence === "string"
                  ? Math.round(Number.parseFloat(item.confidence) * 100) || undefined
                  : undefined,
            whatItIs: item?.whatItIs,
            usageRules: Array.isArray(item?.usageRules) ? item.usageRules : [],
            reasonsSuggested: Array.isArray(item?.reasonsSuggested) ? item.reasonsSuggested : [],
            potentialConcerns: Array.isArray(item?.potentialConcerns) ? item.potentialConcerns : []
          }))
        : []

      setCodeSuggestions(normalized)
      setCodesError(null)
      setCodesServiceStatus("online")
      codesRetryAttemptRef.current = 0
      clearServiceCountdown(codesCountdownRef, setCodesRetrySeconds)
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return
      }
      const message = error instanceof Error ? error.message : "Unable to load code suggestions."
      setCodesError(message)
      setCodesServiceStatus("degraded")
      codesRetryAttemptRef.current += 1
      const attemptDelay =
        explicitRetry ??
        Math.min(SUGGESTION_REFRESH_INTERVAL * 2 ** codesRetryAttemptRef.current, SUGGESTION_MAX_BACKOFF)
      nextDelay = attemptDelay
      startServiceCountdown(nextDelay, codesCountdownRef, setCodesRetrySeconds)
    } finally {
      setCodesLoading(false)
      if (!controller.signal.aborted && trimmedNoteContent) {
        codesTimeoutRef.current = window.setTimeout(() => {
          void fetchCodeSuggestions()
        }, nextDelay)
      }
      codesAbortRef.current = null
    }
  }, [
    clearServiceCountdown,
    trimmedNoteContent,
    startServiceCountdown
  ])

  const codesInUse = useMemo(
    () =>
      (selectedCodesList || [])
        .map(item => item?.code)
        .filter((code): code is string => Boolean(code)),
    [selectedCodesList]
  )

  const filteredCodeSuggestions = useMemo(
    () => codeSuggestions.filter(code => !addedCodes.includes(code.code)),
    [codeSuggestions, addedCodes]
  )

  const filteredPreventionSuggestions = useMemo(
    () => preventionSuggestions.filter(item => !addedCodes.includes(item.code)),
    [preventionSuggestions, addedCodes]
  )

  const filteredDifferentialSuggestions = useMemo(
    () =>
      differentialSuggestions.filter(item => {
        const identifier = item.icdCode || item.diagnosis || ""
        return !addedCodes.includes(identifier)
      }),
    [differentialSuggestions, addedCodes]
  )

  const fetchComplianceAlerts = useCallback(async () => {
    if (complianceTimeoutRef.current) {
      clearTimeout(complianceTimeoutRef.current)
      complianceTimeoutRef.current = null
    }

    if (!trimmedNoteContent) {
      complianceAbortRef.current?.abort()
      complianceAbortRef.current = null
      setComplianceLoading(false)
      setComplianceError(null)
      setComplianceServiceStatus("online")
      setComplianceAlerts([])
      complianceRetryAttemptRef.current = 0
      clearServiceCountdown(complianceCountdownRef, setComplianceRetrySeconds)
      return
    }

    complianceAbortRef.current?.abort()
    const controller = new AbortController()
    complianceAbortRef.current = controller

    const attempt = complianceRetryAttemptRef.current
    if (attempt === 0) {
      setComplianceLoading(true)
      setComplianceError(null)
    }

    let nextDelay = SUGGESTION_REFRESH_INTERVAL
    let explicitRetry: number | null = null

    try {
      const response = await apiFetch("/api/ai/compliance/check", {
        method: "POST",
        jsonBody: { content: trimmedNoteContent, codes: codesInUse },
        signal: controller.signal
      })

      if (!response.ok) {
        let message = `Unable to load compliance alerts (${response.status})`
        explicitRetry = parseRetryAfterMs(response.headers.get("Retry-After"))
        try {
          const body = await response.json()
          if (body && typeof body === "object") {
            const bodyRecord = body as Record<string, unknown>
            if (typeof bodyRecord.message === "string") {
              message = bodyRecord.message
            }
            const retryField =
              bodyRecord.retryAfter ?? bodyRecord.retry_after ?? bodyRecord.retry_delay
            const parsedRetry = parseRetryAfterMs(retryField)
            if (parsedRetry !== null) {
              explicitRetry = parsedRetry
            }
          }
        } catch (parseError) {
          console.debug("Failed to parse compliance error payload", parseError)
        }

        if (explicitRetry !== null) {
          nextDelay = explicitRetry
        }

        throw new Error(message)
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>))
      const normalized: ComplianceAlertItem[] = Array.isArray((data as any)?.alerts)
        ? ((data as any).alerts as any[]).map((item: any) => ({
            text: typeof item?.text === "string" ? item.text : "",
            category: typeof item?.category === "string" ? item.category : undefined,
            priority: typeof item?.priority === "string" ? item.priority : undefined,
            confidence:
              typeof item?.confidence === "number"
                ? Math.round(item.confidence * 100)
                : typeof item?.confidence === "string"
                  ? Math.round(Number.parseFloat(item.confidence) * 100) || undefined
                  : undefined,
            reasoning: typeof item?.reasoning === "string" ? item.reasoning : undefined
          }))
        : []

      setComplianceAlerts(normalized)
      setComplianceError(null)
      setComplianceServiceStatus("online")
      complianceRetryAttemptRef.current = 0
      clearServiceCountdown(complianceCountdownRef, setComplianceRetrySeconds)
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return
      }
      const message = error instanceof Error ? error.message : "Unable to load compliance alerts."
      setComplianceError(message)
      setComplianceServiceStatus("degraded")
      complianceRetryAttemptRef.current += 1
      const attemptDelay =
        explicitRetry ??
        Math.min(
          SUGGESTION_REFRESH_INTERVAL * 2 ** complianceRetryAttemptRef.current,
          SUGGESTION_MAX_BACKOFF
        )
      nextDelay = attemptDelay
      startServiceCountdown(nextDelay, complianceCountdownRef, setComplianceRetrySeconds)
    } finally {
      setComplianceLoading(false)
      if (!controller.signal.aborted && trimmedNoteContent) {
        complianceTimeoutRef.current = window.setTimeout(() => {
          void fetchComplianceAlerts()
        }, nextDelay)
      }
      complianceAbortRef.current = null
    }
  }, [
    clearServiceCountdown,
    trimmedNoteContent,
    startServiceCountdown,
    codesInUse
  ])

  const fetchDifferentialSuggestions = useCallback(async () => {
    if (differentialsTimeoutRef.current) {
      clearTimeout(differentialsTimeoutRef.current)
      differentialsTimeoutRef.current = null
    }

    if (!trimmedNoteContent) {
      differentialsAbortRef.current?.abort()
      differentialsAbortRef.current = null
      setDifferentialsLoading(false)
      setDifferentialsError(null)
      setDifferentialsServiceStatus("online")
      setDifferentialSuggestions([])
      differentialsRetryAttemptRef.current = 0
      clearServiceCountdown(differentialsCountdownRef, setDifferentialsRetrySeconds)
      return
    }

    differentialsAbortRef.current?.abort()
    const controller = new AbortController()
    differentialsAbortRef.current = controller

    const attempt = differentialsRetryAttemptRef.current
    if (attempt === 0) {
      setDifferentialsLoading(true)
      setDifferentialsError(null)
    }

    let nextDelay = SUGGESTION_REFRESH_INTERVAL
    let explicitRetry: number | null = null

    try {
      const response = await apiFetch("/api/ai/differentials/generate", {
        method: "POST",
        jsonBody: { content: trimmedNoteContent },
        signal: controller.signal
      })

      if (!response.ok) {
        let message = `Unable to load differential suggestions (${response.status})`
        explicitRetry = parseRetryAfterMs(response.headers.get("Retry-After"))
        try {
          const body = await response.json()
          if (body && typeof body === "object") {
            const bodyRecord = body as Record<string, unknown>
            if (typeof bodyRecord.message === "string") {
              message = bodyRecord.message
            }
            const retryField =
              bodyRecord.retryAfter ?? bodyRecord.retry_after ?? bodyRecord.retry_delay
            const parsedRetry = parseRetryAfterMs(retryField)
            if (parsedRetry !== null) {
              explicitRetry = parsedRetry
            }
          }
        } catch (parseError) {
          console.debug("Failed to parse differential error payload", parseError)
        }

        if (explicitRetry !== null) {
          nextDelay = explicitRetry
        }

        throw new Error(message)
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>))
      const normalized: DifferentialItem[] = Array.isArray((data as any)?.differentials)
        ? ((data as any).differentials as any[]).map((item: any) => {
            const supporting = Array.isArray(item?.supportingFactors)
              ? item.supportingFactors
              : Array.isArray(item?.forFactors)
                ? item.forFactors
                : []
            const contradicting = Array.isArray(item?.contradictingFactors)
              ? item.contradictingFactors
              : Array.isArray(item?.againstFactors)
                ? item.againstFactors
                : []
            const testsToConfirm = Array.isArray(item?.testsToConfirm)
              ? item.testsToConfirm
              : []
            const testsToExclude = Array.isArray(item?.testsToExclude)
              ? item.testsToExclude
              : []

            return {
              diagnosis: item?.diagnosis ?? "",
              icdCode: item?.icdCode ?? item?.diagnosis ?? "",
              icdDescription: item?.icdDescription ?? item?.diagnosis ?? "",
              confidence:
                typeof item?.confidence === "number"
                  ? Math.round(item.confidence * 100)
                  : typeof item?.confidence === "string"
                    ? Math.round(Number.parseFloat(item.confidence) * 100) || undefined
                    : undefined,
              reasoning: typeof item?.reasoning === "string" ? item.reasoning : undefined,
              supportingFactors: supporting,
              contradictingFactors: contradicting,
              forFactors: supporting,
              againstFactors: contradicting,
              testsToConfirm,
              testsToExclude,
              whatItIs: typeof item?.whatItIs === "string" ? item.whatItIs : undefined,
              details: typeof item?.details === "string" ? item.details : undefined,
              confidenceFactors:
                typeof item?.confidenceFactors === "string" ? item.confidenceFactors : undefined,
              learnMoreUrl: typeof item?.learnMoreUrl === "string" ? item.learnMoreUrl : undefined
            }
          })
        : []

      setDifferentialSuggestions(normalized)
      setDifferentialsError(null)
      setDifferentialsServiceStatus("online")
      differentialsRetryAttemptRef.current = 0
      clearServiceCountdown(differentialsCountdownRef, setDifferentialsRetrySeconds)
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return
      }
      const message =
        error instanceof Error ? error.message : "Unable to load differential suggestions."
      setDifferentialsError(message)
      setDifferentialsServiceStatus("degraded")
      differentialsRetryAttemptRef.current += 1
      const attemptDelay =
        explicitRetry ??
        Math.min(
          SUGGESTION_REFRESH_INTERVAL * 2 ** differentialsRetryAttemptRef.current,
          SUGGESTION_MAX_BACKOFF
        )
      nextDelay = attemptDelay
      startServiceCountdown(nextDelay, differentialsCountdownRef, setDifferentialsRetrySeconds)
    } finally {
      setDifferentialsLoading(false)
      if (!controller.signal.aborted && trimmedNoteContent) {
        differentialsTimeoutRef.current = window.setTimeout(() => {
          void fetchDifferentialSuggestions()
        }, nextDelay)
      }
      differentialsAbortRef.current = null
    }
  }, [
    clearServiceCountdown,
    trimmedNoteContent,
    startServiceCountdown
  ])

  const fetchPreventionSuggestions = useCallback(async () => {
    if (preventionTimeoutRef.current) {
      clearTimeout(preventionTimeoutRef.current)
      preventionTimeoutRef.current = null
    }

    preventionAbortRef.current?.abort()
    const controller = new AbortController()
    preventionAbortRef.current = controller

    const attempt = preventionRetryAttemptRef.current
    if (attempt === 0) {
      setPreventionLoading(true)
      setPreventionError(null)
    }

    let nextDelay = SUGGESTION_REFRESH_INTERVAL
    let explicitRetry: number | null = null

    try {
      const response = await apiFetch("/api/ai/prevention/suggest", {
        method: "POST",
        jsonBody: {},
        signal: controller.signal
      })

      if (!response.ok) {
        let message = `Unable to load prevention recommendations (${response.status})`
        explicitRetry = parseRetryAfterMs(response.headers.get("Retry-After"))
        try {
          const body = await response.json()
          if (body && typeof body === "object") {
            const bodyRecord = body as Record<string, unknown>
            if (typeof bodyRecord.message === "string") {
              message = bodyRecord.message
            }
            const retryField =
              bodyRecord.retryAfter ?? bodyRecord.retry_after ?? bodyRecord.retry_delay
            const parsedRetry = parseRetryAfterMs(retryField)
            if (parsedRetry !== null) {
              explicitRetry = parsedRetry
            }
          }
        } catch (parseError) {
          console.debug("Failed to parse prevention error payload", parseError)
        }

        if (explicitRetry !== null) {
          nextDelay = explicitRetry
        }

        throw new Error(message)
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>))
      const normalized: PreventionSuggestionItem[] = Array.isArray((data as any)?.recommendations)
        ? ((data as any).recommendations as any[]).map((item: any, index: number) => {
            const recommendation =
              typeof item?.recommendation === "string"
                ? item.recommendation
                : `Recommendation ${index + 1}`
            return {
              id: typeof item?.id === "string" ? item.id : recommendation,
              code: typeof item?.code === "string" ? item.code : recommendation,
              type: typeof item?.type === "string" ? item.type : "PREVENTION",
              category: typeof item?.category === "string" ? item.category : "prevention",
              recommendation,
              priority: typeof item?.priority === "string" ? item.priority : undefined,
              source: typeof item?.source === "string" ? item.source : undefined,
              confidence:
                typeof item?.confidence === "number"
                  ? Math.round(item.confidence * 100)
                  : typeof item?.confidence === "string"
                    ? Math.round(Number.parseFloat(item.confidence) * 100) || undefined
                    : undefined,
              reasoning: typeof item?.reasoning === "string" ? item.reasoning : undefined,
              ageRelevant: typeof item?.ageRelevant === "boolean" ? item.ageRelevant : undefined,
              description:
                typeof item?.description === "string"
                  ? item.description
                  : typeof item?.reasoning === "string"
                    ? item.reasoning
                    : recommendation,
              rationale: typeof item?.rationale === "string" ? item.rationale : undefined
            }
          })
        : []

      setPreventionSuggestions(normalized)
      setPreventionError(null)
      setPreventionServiceStatus("online")
      preventionRetryAttemptRef.current = 0
      clearServiceCountdown(preventionCountdownRef, setPreventionRetrySeconds)
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return
      }
      const message = error instanceof Error ? error.message : "Unable to load prevention recommendations."
      setPreventionError(message)
      setPreventionServiceStatus("degraded")
      preventionRetryAttemptRef.current += 1
      const attemptDelay =
        explicitRetry ??
        Math.min(
          SUGGESTION_REFRESH_INTERVAL * 2 ** preventionRetryAttemptRef.current,
          SUGGESTION_MAX_BACKOFF
        )
      nextDelay = attemptDelay
      startServiceCountdown(nextDelay, preventionCountdownRef, setPreventionRetrySeconds)
    } finally {
      setPreventionLoading(false)
      if (!controller.signal.aborted) {
        preventionTimeoutRef.current = window.setTimeout(() => {
          void fetchPreventionSuggestions()
        }, nextDelay)
      }
      preventionAbortRef.current = null
    }
  }, [clearServiceCountdown, startServiceCountdown])

  useEffect(() => {
    codesRetryAttemptRef.current = 0
    void fetchCodeSuggestions()
    return () => {
      if (codesTimeoutRef.current) {
        clearTimeout(codesTimeoutRef.current)
        codesTimeoutRef.current = null
      }
      codesAbortRef.current?.abort()
      codesAbortRef.current = null
      clearServiceCountdown(codesCountdownRef, setCodesRetrySeconds)
    }
  }, [fetchCodeSuggestions, clearServiceCountdown])

  useEffect(() => {
    complianceRetryAttemptRef.current = 0
    void fetchComplianceAlerts()
    return () => {
      if (complianceTimeoutRef.current) {
        clearTimeout(complianceTimeoutRef.current)
        complianceTimeoutRef.current = null
      }
      complianceAbortRef.current?.abort()
      complianceAbortRef.current = null
      clearServiceCountdown(complianceCountdownRef, setComplianceRetrySeconds)
    }
  }, [fetchComplianceAlerts, clearServiceCountdown])

  useEffect(() => {
    differentialsRetryAttemptRef.current = 0
    void fetchDifferentialSuggestions()
    return () => {
      if (differentialsTimeoutRef.current) {
        clearTimeout(differentialsTimeoutRef.current)
        differentialsTimeoutRef.current = null
      }
      differentialsAbortRef.current?.abort()
      differentialsAbortRef.current = null
      clearServiceCountdown(differentialsCountdownRef, setDifferentialsRetrySeconds)
    }
  }, [fetchDifferentialSuggestions, clearServiceCountdown])

  useEffect(() => {
    preventionRetryAttemptRef.current = 0
    void fetchPreventionSuggestions()
    return () => {
      if (preventionTimeoutRef.current) {
        clearTimeout(preventionTimeoutRef.current)
        preventionTimeoutRef.current = null
      }
      preventionAbortRef.current?.abort()
      preventionAbortRef.current = null
      clearServiceCountdown(preventionCountdownRef, setPreventionRetrySeconds)
    }
  }, [fetchPreventionSuggestions, clearServiceCountdown])

  const toggleCard = (cardKey: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardKey]: !prev[cardKey]
    }))
  }

  const handleAddAsDiagnosis = (differential: DifferentialItem) => {
    const confidenceValue = differential.confidence ?? 0
    if (confidenceValue < 70) {
      setSelectedDifferential(differential)
      setShowConfidenceWarning(true)
      return
    }

    const codeValue = differential.icdCode || differential.diagnosis
    if (!codeValue) {
      return
    }

    const icdCodeItem = {
      code: codeValue,
      type: "ICD-10",
      category: "diagnoses",
      description: differential.icdDescription || differential.diagnosis,
      rationale: `Added as diagnosis from differential: ${differential.diagnosis}. ${differential.reasoning || ""}`,
      confidence: confidenceValue
    }

    sessionActions.addCode(icdCodeItem)
  }

  const handleAddAsDifferential = (differential: DifferentialItem) => {
    const codeValue = differential.icdCode || differential.diagnosis
    if (!codeValue) {
      return
    }

    const icdCodeItem = {
      code: codeValue,
      type: "ICD-10",
      category: "differentials",
      description: differential.icdDescription || differential.diagnosis,
      rationale: `Added as differential consideration: ${differential.diagnosis}. ${differential.reasoning || ""}`,
      confidence: differential.confidence
    }
    sessionActions.addCode(icdCodeItem)
  }

  const handleAddCode = (code: any) => {
    if (!code || !code.code) {
      return
    }

    sessionActions.addCode(code)
  }

  const followUpSuggestions = [
    { interval: "2 weeks", condition: "if symptoms persist", priority: "routine" },
    { interval: "3-5 days", condition: "if symptoms worsen", priority: "urgent" }
  ]

  const cardConfigs: Array<{
    key: CardKey
    title: string
    icon: typeof Code
    count: number
    color: string
  }> = [
    { key: "codes", title: "Codes", icon: Code, count: filteredCodeSuggestions.length, color: "text-blue-600" },
    { key: "compliance", title: "Compliance", icon: Shield, count: complianceAlerts.length, color: "text-amber-600" },
    { key: "prevention", title: "Prevention", icon: Heart, count: filteredPreventionSuggestions.length, color: "text-red-600" },
    {
      key: "differentials",
      title: "Differentials",
      icon: Stethoscope,
      count: filteredDifferentialSuggestions.length,
      color: "text-purple-600"
    },
    { key: "followUp", title: "Follow-Up", icon: Calendar, count: followUpSuggestions.length, color: "text-orange-600" }
  ]

  const renderServiceStatusBadge = useCallback(
    (key: CardKey) => {
      switch (key) {
        case "codes":
          if (codesLoading) {
            return (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </Badge>
            )
          }
          if (codesServiceStatus === "degraded") {
            return (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs border-amber-200 bg-amber-50 text-amber-700"
              >
                <AlertTriangle className="h-3 w-3" />
                {codesRetrySeconds != null ? `Degraded · retry in ${codesRetrySeconds}s` : "Degraded"}
              </Badge>
            )
          }
          return null
        case "compliance":
          if (complianceLoading) {
            return (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </Badge>
            )
          }
          if (complianceServiceStatus === "degraded") {
            return (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs border-amber-200 bg-amber-50 text-amber-700"
              >
                <AlertTriangle className="h-3 w-3" />
                {complianceRetrySeconds != null ? `Degraded · retry in ${complianceRetrySeconds}s` : "Degraded"}
              </Badge>
            )
          }
          return null
        case "differentials":
          if (differentialsLoading) {
            return (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </Badge>
            )
          }
          if (differentialsServiceStatus === "degraded") {
            return (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs border-amber-200 bg-amber-50 text-amber-700"
              >
                <AlertTriangle className="h-3 w-3" />
                {differentialsRetrySeconds != null ? `Degraded · retry in ${differentialsRetrySeconds}s` : "Degraded"}
              </Badge>
            )
          }
          return null
        case "prevention":
          if (preventionLoading) {
            return (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </Badge>
            )
          }
          if (preventionServiceStatus === "degraded") {
            return (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs border-amber-200 bg-amber-50 text-amber-700"
              >
                <AlertTriangle className="h-3 w-3" />
                {preventionRetrySeconds != null ? `Degraded · retry in ${preventionRetrySeconds}s` : "Degraded"}
              </Badge>
            )
          }
          return null
        default:
          return null
      }
    },
    [
      codesLoading,
      codesServiceStatus,
      codesRetrySeconds,
      complianceLoading,
      complianceServiceStatus,
      complianceRetrySeconds,
      differentialsLoading,
      differentialsServiceStatus,
      differentialsRetrySeconds,
      preventionLoading,
      preventionServiceStatus,
      preventionRetrySeconds
    ]
  )

  const renderDegradedBanner = useCallback(
    (status: "online" | "degraded", retrySeconds: number | null, label: string) => {
      if (status !== "degraded") {
        return null
      }

      return (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {label} is experiencing delays.{" "}
            {retrySeconds != null ? `Retrying in ${retrySeconds}s.` : "Showing the most recent results."}
          </span>
        </div>
      )
    },
    []
  )

  // Circular confidence indicator component
  const ConfidenceGauge = ({ confidence, size = 20 }: { confidence?: number; size?: number }) => {
    const normalizedConfidence = typeof confidence === "number" ? Math.max(0, Math.min(100, confidence)) : 0
    const radius = (size - 4) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (normalizedConfidence / 100) * circumference

    const getColor = (conf: number) => {
      if (conf >= 70) return '#10b981'
      if (conf >= 40) return '#eab308'
      return '#ef4444'
    }

    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="2"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor(normalizedConfidence)}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">
            {typeof confidence === "number" ? normalizedConfidence : "–"}
          </span>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full border-l bg-sidebar">
        {/* Header */}
        <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
          <h2 className="font-medium">Suggestions</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Suggestion Cards - Now with proper scrolling */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {cardConfigs.map((config) => (
                <Card key={config.key} className="overflow-hidden">
                  <Collapsible
                    open={expandedCards[config.key]}
                    onOpenChange={() => toggleCard(config.key)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <config.icon className={`h-4 w-4 ${config.color}`} />
                            {config.title}
                            <Badge variant="secondary" className="text-xs">
                              {config.count}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {renderServiceStatusBadge(config.key)}
                            {expandedCards[config.key] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {/* Codes Section */}
                        {config.key === 'codes' && (
                          <div className="space-y-3">
                            {renderDegradedBanner(
                              codesServiceStatus,
                              codesRetrySeconds,
                              "The coding assistant"
                            )}
                            {codesLoading && (
                              <p className="text-sm text-muted-foreground">Analyzing note for coding opportunities...</p>
                            )}
                            {codesError && (
                              <p className="text-sm text-destructive">{codesError}</p>
                            )}
                            {!codesLoading && !codesError && filteredCodeSuggestions.length === 0 && (
                              <p className="text-sm text-muted-foreground">No code suggestions yet. Start documenting to receive recommendations.</p>
                            )}
                            {filteredCodeSuggestions.map((code, index) => {
                              const codeTypeColors: Record<string, string> = {
                                CPT: "bg-blue-50 border-blue-200 text-blue-700",
                                "ICD-10": "bg-purple-50 border-purple-200 text-purple-700",
                                HCPCS: "bg-emerald-50 border-emerald-200 text-emerald-700"
                              }
                              const codeKey = `${code.code}-${index}`
                              const rationale = code.rationale || code.reasoning || "AI rationale unavailable."
                              return (
                                <Tooltip key={codeKey}>
                                  <TooltipTrigger asChild>
                                    <div className="p-2.5 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                                      <div className="flex items-center gap-3">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 flex items-center justify-center hover:bg-blue-100 hover:text-blue-700 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleAddCode(code)
                                          }}
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>

                                        <div className="flex-1 min-w-0 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Badge
                                                variant="outline"
                                                className={`text-xs ${codeTypeColors[code.type || ''] || 'bg-gray-50 border-gray-200 text-gray-700'}`}
                                              >
                                                {code.type || 'CODE'}
                                              </Badge>
                                              <span className="font-mono text-sm font-medium">{code.code}</span>
                                            </div>
                                            <ConfidenceGauge confidence={code.confidence} size={24} />
                                          </div>

                                          {code.description && (
                                            <p className="text-sm font-medium">{code.description}</p>
                                          )}

                                          <div className="text-xs text-muted-foreground">
                                            {rationale}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-lg p-0" side="left">
                                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                      <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <Code className="h-4 w-4 text-blue-600" />
                                            <span className="font-medium text-blue-900">{(code.type || 'Code')} {code.code}</span>
                                          </div>
                                          <ConfidenceGauge confidence={code.confidence} size={24} />
                                        </div>
                                        {code.description && (
                                          <p className="text-sm text-blue-800 mt-1">{code.description}</p>
                                        )}
                                      </div>

                                      <div className="p-4 space-y-4">
                                        {code.whatItIs && (
                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <Shield className="h-3 w-3 text-blue-600" />
                                              <h5 className="font-medium text-sm text-blue-700">Definition</h5>
                                            </div>
                                            <p className="text-xs text-gray-700 leading-relaxed pl-5">{code.whatItIs}</p>
                                          </div>
                                        )}

                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                                            <h5 className="font-medium text-sm text-amber-700">AI Rationale</h5>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed pl-5">{rationale}</p>
                                        </div>

                                        {code.usageRules && code.usageRules.length > 0 && (
                                          <div className="border-t border-gray-100 pt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                              <ClipboardList className="h-3 w-3 text-blue-600" />
                                              <h5 className="font-medium text-sm text-blue-700">Usage Requirements</h5>
                                            </div>
                                            <ul className="space-y-1.5 pl-5">
                                              {code.usageRules.map((rule, ruleIndex) => (
                                                <li key={ruleIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                                                  {rule}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {(code.reasonsSuggested && code.reasonsSuggested.length > 0) || (code.potentialConcerns && code.potentialConcerns.length > 0) ? (
                                          <div className="border-t border-gray-100 pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {code.reasonsSuggested && code.reasonsSuggested.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                                    <h5 className="font-medium text-sm text-green-700">Supporting Evidence</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {code.reasonsSuggested.map((reason, reasonIndex) => (
                                                      <li key={reasonIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {reason}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}

                                              {code.potentialConcerns && code.potentialConcerns.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <AlertTriangle className="h-3 w-3 text-red-600" />
                                                    <h5 className="font-medium text-sm text-red-700">Potential Concerns</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {code.potentialConcerns.map((concern, concernIndex) => (
                                                      <li key={concernIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {concern}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        )}

                        {/* Compliance Section */}
                        {config.key === 'compliance' && (
                          <div className="space-y-3">
                            {renderDegradedBanner(
                              complianceServiceStatus,
                              complianceRetrySeconds,
                              "The compliance assistant"
                            )}
                            {complianceLoading && (
                              <p className="text-sm text-muted-foreground">Reviewing documentation for compliance issues...</p>
                            )}
                            {complianceError && (
                              <p className="text-sm text-destructive">{complianceError}</p>
                            )}
                            {!complianceLoading && !complianceError && complianceAlerts.length === 0 && (
                              <p className="text-sm text-muted-foreground">No compliance issues detected. Keep documenting thoroughly.</p>
                            )}
                            {complianceAlerts.map((alert, index) => (
                              <div key={`${alert.text}-${index}`} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium">{alert.text}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      {alert.category && (
                                        <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                                          {alert.category}
                                        </Badge>
                                      )}
                                      {alert.priority && (
                                        <Badge
                                          variant="outline"
                                          className={`text-xs ${alert.priority === 'critical' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}
                                        >
                                          {alert.priority}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <ConfidenceGauge confidence={alert.confidence} size={24} />
                                </div>
                                {alert.reasoning && (
                                  <p className="text-xs text-muted-foreground leading-relaxed">{alert.reasoning}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Public Health Section */}
                        {config.key === 'prevention' && (
                          <div className="space-y-2">
                            {renderDegradedBanner(
                              preventionServiceStatus,
                              preventionRetrySeconds,
                              "The preventive care assistant"
                            )}
                            {preventionLoading && (
                              <p className="text-sm text-muted-foreground">Loading preventive care opportunities...</p>
                            )}
                            {preventionError && (
                              <p className="text-sm text-destructive">{preventionError}</p>
                            )}
                            {!preventionLoading && !preventionError && filteredPreventionSuggestions.length === 0 && (
                              <p className="text-sm text-muted-foreground">No preventive care suggestions available at the moment.</p>
                            )}
                            {filteredPreventionSuggestions.map((item, index) => (
                              <Tooltip key={`${item.id}-${index}`}>
                                <TooltipTrigger asChild>
                                  <div className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors relative">
                                    <div className="flex items-center gap-3">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 flex items-center justify-center hover:bg-red-100 hover:text-red-700 flex-shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleAddCode(item)
                                        }}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>

                                      <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <p className="text-sm font-medium">{item.recommendation}</p>
                                          <ConfidenceGauge confidence={item.confidence} size={24} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                          {item.source && <span>Source: {item.source}</span>}
                                          {item.priority && (
                                            <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700">
                                              {item.priority}
                                            </Badge>
                                          )}
                                        </div>
                                        {item.reasoning && (
                                          <p className="text-xs text-muted-foreground">{item.reasoning}</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-lg p-0" side="left">
                                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                    <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Heart className="h-4 w-4 text-red-600" />
                                          <span className="font-medium text-red-900">{item.recommendation}</span>
                                        </div>
                                        <ConfidenceGauge confidence={item.confidence} size={24} />
                                      </div>
                                      {item.source && (
                                        <p className="text-xs text-red-800 mt-1">Source: {item.source}</p>
                                      )}
                                    </div>

                                    <div className="p-4 space-y-3">
                                      {item.reasoning && (
                                        <p className="text-xs text-gray-700 leading-relaxed">{item.reasoning}</p>
                                      )}
                                      <div className="text-xs text-muted-foreground space-y-1">
                                        <div>
                                          <span className="font-medium text-gray-900">Priority:</span> {item.priority || 'Standard'}
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-900">Age relevant:</span> {item.ageRelevant ? 'Yes' : 'General recommendation'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        )}

                        {/* Differentials Section */}
                        {config.key === 'differentials' && (
                          <div className="space-y-3">
                            {renderDegradedBanner(
                              differentialsServiceStatus,
                              differentialsRetrySeconds,
                              "The differential assistant"
                            )}
                            {differentialsLoading && (
                              <p className="text-sm text-muted-foreground">Generating differential diagnoses...</p>
                            )}
                            {differentialsError && (
                              <p className="text-sm text-destructive">{differentialsError}</p>
                            )}
                            {!differentialsLoading && !differentialsError && filteredDifferentialSuggestions.length === 0 && (
                              <p className="text-sm text-muted-foreground">No differential diagnoses suggested yet.</p>
                            )}
                            {filteredDifferentialSuggestions.map((item, index) => {
                              const confidenceValue = item.confidence ?? 0
                              return (
                                <Tooltip key={`${item.diagnosis}-${index}`}>
                                  <TooltipTrigger asChild>
                                    <div className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm font-medium">{item.diagnosis}</p>
                                            {item.icdCode && (
                                              <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
                                                  ICD-10
                                                </Badge>
                                                <span className="font-mono text-xs text-muted-foreground">{item.icdCode}</span>
                                              </div>
                                            )}
                                          </div>
                                          <ConfidenceGauge confidence={item.confidence} size={24} />
                                        </div>

                                        {item.reasoning && (
                                          <div className="text-xs text-muted-foreground">
                                            {item.reasoning}
                                          </div>
                                        )}

                                        {(item.supportingFactors && item.supportingFactors.length > 0) || (item.contradictingFactors && item.contradictingFactors.length > 0) ? (
                                          <div className="grid grid-cols-1 gap-2 text-xs">
                                            {item.supportingFactors && item.supportingFactors.length > 0 && (
                                              <div>
                                                <span className="text-green-700 font-medium">Supporting:</span>
                                                <span className="text-muted-foreground ml-1">
                                                  {item.supportingFactors.join(', ')}
                                                </span>
                                              </div>
                                            )}
                                            {item.contradictingFactors && item.contradictingFactors.length > 0 && (
                                              <div>
                                                <span className="text-red-700 font-medium">Against:</span>
                                                <span className="text-muted-foreground ml-1">
                                                  {item.contradictingFactors.join(', ')}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        ) : null}

                                        <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-xs flex-1"
                                            onClick={() => handleAddAsDifferential(item)}
                                          >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add as Differential
                                          </Button>

                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={`h-6 text-xs flex-1 ${confidenceValue < 70 ? 'text-orange-600 hover:text-orange-700' : ''}`}
                                            onClick={() => handleAddAsDiagnosis(item)}
                                          >
                                            {confidenceValue < 70 && <AlertTriangle className="h-3 w-3 mr-1" />}
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add as Diagnosis
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-lg p-0" side="left">
                                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                      <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <Stethoscope className="h-4 w-4 text-green-600" />
                                            <span className="font-medium text-green-900">{item.diagnosis}</span>
                                          </div>
                                          <ConfidenceGauge confidence={item.confidence} size={24} />
                                        </div>
                                        {item.icdCode && (
                                          <p className="text-sm text-green-800 mt-1">{item.icdCode}{item.icdDescription ? ` - ${item.icdDescription}` : ''}</p>
                                        )}
                                      </div>

                                      <div className="p-4 space-y-4">
                                        {item.reasoning && (
                                          <div>
                                            <div className="flex items-center gap-2 mb-2">
                                              <Shield className="h-3 w-3 text-green-600" />
                                              <h5 className="font-medium text-sm text-green-700">Clinical Context</h5>
                                            </div>
                                            <p className="text-xs text-gray-700 leading-relaxed pl-5">{item.reasoning}</p>
                                          </div>
                                        )}

                                        {(item.forFactors && item.forFactors.length > 0) || (item.againstFactors && item.againstFactors.length > 0) ? (
                                          <div className="border-t border-gray-100 pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {item.forFactors && item.forFactors.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                                    <h5 className="font-medium text-sm text-green-700">Supporting Factors</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {item.forFactors.map((factor, factorIndex) => (
                                                      <li key={factorIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {factor}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}

                                              {item.againstFactors && item.againstFactors.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                                    <h5 className="font-medium text-sm text-red-700">Against Factors</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {item.againstFactors.map((factor, factorIndex) => (
                                                      <li key={factorIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {factor}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}

                                        {(item.testsToConfirm && item.testsToConfirm.length > 0) || (item.testsToExclude && item.testsToExclude.length > 0) ? (
                                          <div className="border-t border-gray-100 pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {item.testsToConfirm && item.testsToConfirm.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <TestTube className="h-3 w-3 text-blue-600" />
                                                    <h5 className="font-medium text-sm text-blue-700">Tests to Confirm</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {item.testsToConfirm.map((test, testIndex) => (
                                                      <li key={testIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {test}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}

                                              {item.testsToExclude && item.testsToExclude.length > 0 && (
                                                <div>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <Minus className="h-3 w-3 text-gray-600" />
                                                    <h5 className="font-medium text-sm text-gray-700">Tests to Exclude</h5>
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {item.testsToExclude.map((test, testIndex) => (
                                                      <li key={testIndex} className="text-xs text-gray-700 flex items-start gap-2">
                                                        <div className="w-1 h-1 bg-gray-600 rounded-full mt-2 flex-shrink-0"></div>
                                                        {test}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}

                                        {item.learnMoreUrl && (
                                          <div className="border-t border-gray-100 pt-4">
                                            <a
                                              href={item.learnMoreUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              Learn more about this condition
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        )}

                        {/* Follow-Up Section */}
                        {config.key === 'followUp' && (
                          <div className="space-y-2">
                            {followUpSuggestions.map((item, index) => (
                              <div key={index} className="p-2 rounded border space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm flex-1">{item.interval}</p>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${
                                      item.priority === 'urgent' 
                                        ? 'border-red-200 text-red-700 bg-red-50' 
                                        : 'border-gray-200 text-gray-700 bg-gray-50'
                                    }`}
                                  >
                                    {item.priority}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{item.condition}</p>
                                <Button size="sm" variant="ghost" className="h-6 text-xs">
                                  <Plus className="h-3 w-3 mr-1" />
                                  Schedule Follow-Up
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Confidence Warning Dialog - Fixed overflow issues */}
        <AlertDialog open={showConfidenceWarning} onOpenChange={setShowConfidenceWarning}>
          <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <AlertDialogHeader className="flex-shrink-0">
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Low Confidence Diagnosis Warning
              </AlertDialogTitle>
              <AlertDialogDescription>
                This diagnosis has a confidence level below 70%. Please review the clinical reasoning before adding it as a primary diagnosis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            {selectedDifferential && (
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-orange-900">{selectedDifferential.diagnosis}</h4>
                        <div className="flex items-center gap-2">
                          <ConfidenceGauge confidence={selectedDifferential.confidence} size={24} />
                          <span className="text-sm text-orange-700">
                            {selectedDifferential.confidence != null
                              ? `${selectedDifferential.confidence}% confidence`
                              : 'Confidence unavailable'}
                          </span>
                        </div>
                      </div>
                      {selectedDifferential.reasoning && (
                        <p className="text-sm text-orange-800">{selectedDifferential.reasoning}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm text-green-700">Supporting Evidence</h5>
                        <ul className="space-y-1">
                          {selectedDifferential.forFactors && selectedDifferential.forFactors.length > 0 ? (
                            selectedDifferential.forFactors.map((factor, index) => (
                              <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                                <TrendingUp className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                                {factor}
                              </li>
                            ))
                          ) : (
                            <li className="text-xs text-muted-foreground">No supporting factors provided.</li>
                          )}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-medium text-sm text-red-700">Contradicting Evidence</h5>
                        <ul className="space-y-1">
                          {selectedDifferential.againstFactors && selectedDifferential.againstFactors.length > 0 ? (
                            selectedDifferential.againstFactors.map((factor, index) => (
                              <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                                <TrendingDown className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                                {factor}
                              </li>
                            ))
                          ) : (
                            <li className="text-xs text-muted-foreground">No contradicting factors noted.</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h5 className="font-medium text-sm mb-1">Clinical Reasoning</h5>
                        <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
                          {selectedDifferential.confidenceFactors || selectedDifferential.reasoning || 'No additional reasoning provided.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                            <TestTube className="h-3 w-3" />
                            Recommended Tests to Confirm
                          </h5>
                          <ul className="space-y-1">
                            {selectedDifferential.testsToConfirm && selectedDifferential.testsToConfirm.length > 0 ? (
                              selectedDifferential.testsToConfirm.map((test, index) => (
                                <li key={index} className="text-xs text-muted-foreground">• {test}</li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">No confirmatory tests suggested.</li>
                            )}
                          </ul>
                        </div>

                        <div>
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                            <Minus className="h-3 w-3" />
                            Tests to Rule Out Alternatives
                          </h5>
                          <ul className="space-y-1">
                            {selectedDifferential.testsToExclude && selectedDifferential.testsToExclude.length > 0 ? (
                              selectedDifferential.testsToExclude.map((test, index) => (
                                <li key={index} className="text-xs text-muted-foreground">• {test}</li>
                              ))
                            ) : (
                              <li className="text-xs text-muted-foreground">No exclusion tests recommended.</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {(selectedDifferential.whatItIs || selectedDifferential.learnMoreUrl) && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <h5 className="font-medium text-sm text-blue-900 mb-1">Educational Resource</h5>
                          {selectedDifferential.whatItIs && (
                            <p className="text-xs text-blue-800 mb-2">{selectedDifferential.whatItIs}</p>
                          )}
                          {selectedDifferential.learnMoreUrl && (
                            <a
                              href={selectedDifferential.learnMoreUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Learn more about this condition
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}

            <AlertDialogFooter className="flex-shrink-0">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedDifferential) {
                    const codeValue = selectedDifferential.icdCode || selectedDifferential.diagnosis
                    if (codeValue) {
                      const icdCodeItem = {
                        code: codeValue,
                        type: "ICD-10",
                        category: "diagnoses" as const,
                        description: selectedDifferential.icdDescription || selectedDifferential.diagnosis,
                        rationale: `Added as diagnosis from differential: ${selectedDifferential.diagnosis}. ${selectedDifferential.reasoning || ''}`,
                        confidence: selectedDifferential.confidence
                      }
                      sessionActions.addCode(icdCodeItem)
                    }
                  }
                  setShowConfidenceWarning(false)
                  setSelectedDifferential(null)
                }}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Add as Diagnosis Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}