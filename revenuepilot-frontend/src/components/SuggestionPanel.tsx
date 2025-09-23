import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { ScrollArea } from "./ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import { X, ChevronDown, ChevronRight, Code, Shield, Heart, Stethoscope, Calendar, Plus, TrendingUp, TrendingDown, ClipboardList, Minus, ExternalLink, TestTube, AlertTriangle } from "lucide-react"
import { apiFetchJson } from "../lib/api"
import type { ComplianceIssue, LiveCodeSuggestion, NoteContextStageInfo, StreamConnectionState } from "./NoteEditor"

interface SuggestionPanelProps {
  onClose: () => void
  selectedCodes: {
    codes: number
    prevention: number
    diagnoses: number
    differentials: number
  }
  onUpdateCodes: (codes: { codes: number; prevention: number; diagnoses: number; differentials: number }) => void
  onAddCode?: (code: any) => void
  addedCodes?: string[]
  noteContent?: string
  selectedCodesList?: SelectedCodeItem[]
  streamingCompliance?: ComplianceIssue[]
  streamingCodes?: LiveCodeSuggestion[]
  complianceConnection?: StreamConnectionState
  codesConnection?: StreamConnectionState
  contextInfo?: NoteContextStageInfo | null
}

interface SelectedCodeItem {
  code?: string
  type?: string
  category?: string
  description?: string
  rationale?: string
  confidence?: number
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

export function SuggestionPanel({
  onClose,
  selectedCodes,
  onUpdateCodes,
  onAddCode,
  addedCodes = [],
  noteContent = "",
  selectedCodesList = [],
  streamingCompliance,
  streamingCodes,
  complianceConnection,
  codesConnection,
  contextInfo,
}: SuggestionPanelProps) {
  const [codeSuggestions, setCodeSuggestions] = useState<CodeSuggestionItem[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [codesError, setCodesError] = useState<string | null>(null)

  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlertItem[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [complianceError, setComplianceError] = useState<string | null>(null)

  const [differentialSuggestions, setDifferentialSuggestions] = useState<DifferentialItem[]>([])
  const [differentialsLoading, setDifferentialsLoading] = useState(false)
  const [differentialsError, setDifferentialsError] = useState<string | null>(null)

  const [preventionSuggestions, setPreventionSuggestions] = useState<PreventionSuggestionItem[]>([])
  const [preventionLoading, setPreventionLoading] = useState(false)
  const [preventionError, setPreventionError] = useState<string | null>(null)

  const [expandedCards, setExpandedCards] = useState({
    codes: true,
    compliance: true,
    prevention: false,
    differentials: true,
    followUp: false,
  })

  const [showConfidenceWarning, setShowConfidenceWarning] = useState(false)
  const [selectedDifferential, setSelectedDifferential] = useState<DifferentialItem | null>(null)

  const codesInUse = useMemo(() => (selectedCodesList || []).map((item) => item?.code).filter((code): code is string => Boolean(code)), [selectedCodesList])

  const contextRequestPayload = useMemo(() => {
    if (!contextInfo) {
      return {}
    }
    const payload: Record<string, string> = {}
    if (contextInfo.correlationId) {
      payload.correlation_id = contextInfo.correlationId
    }
    if (contextInfo.bestStage) {
      payload.context_stage = contextInfo.bestStage
    }
    if (contextInfo.contextGeneratedAt) {
      payload.context_generated_at = contextInfo.contextGeneratedAt
    }
    return payload
  }, [contextInfo])

  const filteredCodeSuggestions = useMemo(() => codeSuggestions.filter((code) => !addedCodes.includes(code.code)), [codeSuggestions, addedCodes])

  const filteredPreventionSuggestions = useMemo(() => preventionSuggestions.filter((item) => !addedCodes.includes(item.code)), [preventionSuggestions, addedCodes])

  const filteredDifferentialSuggestions = useMemo(
    () =>
      differentialSuggestions.filter((item) => {
        const identifier = item.icdCode || item.diagnosis || ""
        return !addedCodes.includes(identifier)
      }),
    [differentialSuggestions, addedCodes],
  )

  const codesStreamStatus = codesConnection?.status ?? "idle"
  const complianceStreamStatus = complianceConnection?.status ?? "idle"

  const codesStreamOpen = codesStreamStatus === "open"
  const complianceStreamOpen = complianceStreamStatus === "open"

  const codesStreamAvailable = codesStreamOpen || codesStreamStatus === "connecting"
  const complianceStreamAvailable = complianceStreamOpen || complianceStreamStatus === "connecting"

  const shouldFetchCodes = !codesStreamAvailable
  const shouldFetchCompliance = !complianceStreamAvailable

  const mapStreamingCodes = useCallback((input?: LiveCodeSuggestion[]): CodeSuggestionItem[] => {
    if (!Array.isArray(input)) {
      return []
    }
    return input
      .map((entry, index) => {
        const codeValue = typeof entry.code === "string" ? entry.code.trim() : ""
        const descriptionValue = typeof entry.description === "string" ? entry.description.trim() : ""
        const rationaleValue = typeof entry.rationale === "string" ? entry.rationale.trim() : ""
        const identifier = codeValue || descriptionValue || entry.id || `live-${index + 1}`
        const rawConfidence = typeof entry.confidence === "number" ? entry.confidence : undefined
        const normalizedConfidence = rawConfidence === undefined ? undefined : rawConfidence <= 1 ? Math.round(Math.max(0, Math.min(1, rawConfidence)) * 100) : Math.round(Math.min(rawConfidence, 100))
        return {
          code: codeValue || identifier,
          type: entry.type || "AI",
          description: descriptionValue || rationaleValue || identifier,
          rationale: rationaleValue || descriptionValue || codeValue || identifier,
          reasoning: rationaleValue || undefined,
          confidence: normalizedConfidence,
          whatItIs: descriptionValue || undefined,
        } satisfies CodeSuggestionItem
      })
      .filter((entry): entry is CodeSuggestionItem => Boolean(entry))
  }, [])

  const mapStreamingCompliance = useCallback((input?: ComplianceIssue[]): ComplianceAlertItem[] => {
    if (!Array.isArray(input)) {
      return []
    }
    return input.map((issue) => ({
      text: issue.title || issue.description,
      category: issue.category,
      priority: issue.severity,
      confidence: typeof issue.confidence === "number" ? Math.round(issue.confidence) : undefined,
      reasoning: issue.details || issue.description,
    }))
  }, [])

  useEffect(() => {
    if (!codesStreamOpen) {
      return
    }
    setCodesLoading(false)
    setCodesError(null)
    setCodeSuggestions(mapStreamingCodes(streamingCodes))
  }, [mapStreamingCodes, streamingCodes, codesStreamOpen])

  useEffect(() => {
    if (!complianceStreamOpen) {
      return
    }
    setComplianceLoading(false)
    setComplianceError(null)
    setComplianceAlerts(mapStreamingCompliance(streamingCompliance))
  }, [mapStreamingCompliance, streamingCompliance, complianceStreamOpen])

  const renderConnectionBadge = useCallback((label: string, state?: StreamConnectionState) => {
    const status = state?.status ?? "idle"
    let text = "Idle"
    let className = "border-border bg-muted/50 text-muted-foreground"
    if (status === "open") {
      text = "Live"
      className = "border-emerald-200 bg-emerald-100 text-emerald-700"
    } else if (status === "connecting") {
      text = "Connecting"
      className = "border-amber-200 bg-amber-100 text-amber-700"
    } else if (status === "error") {
      text = "Offline"
      className = "border-red-200 bg-red-100 text-red-700"
    } else if (status === "closed") {
      text = "Retrying"
      className = "border-slate-200 bg-slate-200 text-slate-700"
    }
    return (
      <Badge key={label} variant="outline" className={`gap-2 px-3 py-1 text-xs font-medium ${className}`}>
        <span>{label}</span>
        <span>{text}</span>
      </Badge>
    )
  }, [])

  const describeConnectionStatus = useCallback((state?: StreamConnectionState) => {
    const status = state?.status ?? "idle"
    if (status === "open") {
      return "Live"
    }
    if (status === "connecting") {
      return "Connecting"
    }
    if (status === "error") {
      return "Offline"
    }
    if (status === "closed") {
      return "Retrying"
    }
    return "Idle"
  }, [])

  const describeConnectionDetail = useCallback((state?: StreamConnectionState) => {
    const status = state?.status ?? "idle"
    if (status === "open") {
      return "Live updates are streaming in real time."
    }
    if (status === "connecting") {
      return "Connecting to the live stream…"
    }
    if (status === "error") {
      return state?.lastError ? `Live stream error: ${state.lastError}` : "Live stream unavailable."
    }
    if (status === "closed") {
      return "Live stream disconnected. Retrying shortly."
    }
    return "Waiting for the live stream."
  }, [])

  useEffect(() => {
    const trimmed = noteContent?.trim()

    if (!trimmed) {
      setCodeSuggestions([])
      setComplianceAlerts([])
      setDifferentialSuggestions([])
      return
    }

    const controller = new AbortController()
    const signal = controller.signal

    if (!shouldFetchCodes) {
      setCodesLoading(false)
    }
    if (!shouldFetchCompliance) {
      setComplianceLoading(false)
    }

    const fetchCodes = async () => {
      setCodesLoading(true)
      setCodesError(null)
      try {
        const data =
          (await apiFetchJson<{ suggestions?: any[] }>("/api/ai/codes/suggest", {
            method: "POST",
            jsonBody: { content: trimmed, codes: codesInUse, ...contextRequestPayload },
            signal,
          })) ?? {}

        const normalized: CodeSuggestionItem[] = (data?.suggestions || []).map((item: any) => ({
          code: item.code,
          type: item.type,
          description: item.description,
          rationale: item.reasoning || item.description,
          reasoning: item.reasoning,
          confidence: typeof item.confidence === "number" ? Math.round(item.confidence * 100) : undefined,
          whatItIs: item.whatItIs,
          usageRules: item.usageRules || [],
          reasonsSuggested: item.reasonsSuggested || [],
          potentialConcerns: item.potentialConcerns || [],
        }))
        setCodeSuggestions(normalized)
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return
        }
        console.error("Failed to load code suggestions", error)
        setCodesError("Unable to load code suggestions.")
        setCodeSuggestions([])
      } finally {
        setCodesLoading(false)
      }
    }

    const fetchCompliance = async () => {
      setComplianceLoading(true)
      setComplianceError(null)
      try {
        const data =
          (await apiFetchJson<{ alerts?: any[] }>("/api/ai/compliance/check", {
            method: "POST",
            jsonBody: { content: trimmed, codes: codesInUse },
            signal,
          })) ?? {}

        const normalized: ComplianceAlertItem[] = (data?.alerts || []).map((item: any) => ({
          text: item.text,
          category: item.category,
          priority: item.priority,
          confidence: typeof item.confidence === "number" ? Math.round(item.confidence * 100) : undefined,
          reasoning: item.reasoning,
        }))
        setComplianceAlerts(normalized)
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return
        }
        console.error("Failed to load compliance alerts", error)
        setComplianceError("Unable to load compliance alerts.")
        setComplianceAlerts([])
      } finally {
        setComplianceLoading(false)
      }
    }

    const fetchDifferentials = async () => {
      setDifferentialsLoading(true)
      setDifferentialsError(null)
      try {
        const data =
          (await apiFetchJson<{ differentials?: any[] }>("/api/ai/differentials/generate", {
            method: "POST",
            jsonBody: { content: trimmed, ...contextRequestPayload },
            signal,
          })) ?? {}

        const normalized: DifferentialItem[] = (data?.differentials || []).map((item: any) => {
          const supporting = item.supportingFactors || []
          const contradicting = item.contradictingFactors || []
          const testsToConfirm = item.testsToConfirm || []
          const testsToExclude = item.testsToExclude || []

          return {
            diagnosis: item.diagnosis,
            icdCode: item.icdCode || item.diagnosis,
            icdDescription: item.icdDescription || item.diagnosis,
            confidence: typeof item.confidence === "number" ? Math.round(item.confidence * 100) : undefined,
            reasoning: item.reasoning,
            supportingFactors: supporting,
            contradictingFactors: contradicting,
            forFactors: supporting,
            againstFactors: contradicting,
            testsToConfirm,
            testsToExclude,
            whatItIs: item.whatItIs,
            details: item.details,
            confidenceFactors: item.confidenceFactors,
            learnMoreUrl: item.learnMoreUrl,
          }
        })
        setDifferentialSuggestions(normalized)
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return
        }
        console.error("Failed to load differentials", error)
        setDifferentialsError("Unable to load differential suggestions.")
        setDifferentialSuggestions([])
      } finally {
        setDifferentialsLoading(false)
      }
    }

    const debounceId = window.setTimeout(() => {
      if (shouldFetchCodes) {
        void fetchCodes()
      }
      if (shouldFetchCompliance) {
        void fetchCompliance()
      }
      fetchDifferentials()
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(debounceId)
    }
  }, [noteContent, codesInUse, shouldFetchCodes, shouldFetchCompliance, contextRequestPayload])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    const fetchPrevention = async () => {
      setPreventionLoading(true)
      setPreventionError(null)
      try {
        const data =
          (await apiFetchJson<{ recommendations?: any[] }>("/api/ai/prevention/suggest", {
            method: "POST",
            jsonBody: {},
            signal,
          })) ?? {}

        const normalized: PreventionSuggestionItem[] = (data?.recommendations || []).map((item: any, index: number) => {
          const recommendation = item.recommendation || `Recommendation ${index + 1}`
          return {
            id: recommendation,
            code: recommendation,
            type: "PREVENTION",
            category: "prevention",
            recommendation,
            priority: item.priority,
            source: item.source,
            confidence: typeof item.confidence === "number" ? Math.round(item.confidence * 100) : undefined,
            reasoning: item.reasoning,
            ageRelevant: item.ageRelevant,
            description: item.reasoning || recommendation,
            rationale: item.reasoning,
          }
        })
        setPreventionSuggestions(normalized)
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return
        }
        console.error("Failed to load prevention recommendations", error)
        setPreventionError("Unable to load prevention recommendations.")
        setPreventionSuggestions([])
      } finally {
        setPreventionLoading(false)
      }
    }

    fetchPrevention()

    return () => {
      controller.abort()
    }
  }, [])

  const toggleCard = (cardKey: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
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
    if (!codeValue || !onAddCode) {
      return
    }

    const icdCodeItem = {
      code: codeValue,
      type: "ICD-10",
      category: "diagnoses",
      description: differential.icdDescription || differential.diagnosis,
      rationale: `Added as diagnosis from differential: ${differential.diagnosis}. ${differential.reasoning || ""}`,
      confidence: confidenceValue,
    }

    onAddCode(icdCodeItem)
  }

  const handleAddAsDifferential = (differential: DifferentialItem) => {
    const codeValue = differential.icdCode || differential.diagnosis
    if (!codeValue || !onAddCode) {
      return
    }

    const icdCodeItem = {
      code: codeValue,
      type: "ICD-10",
      category: "differentials",
      description: differential.icdDescription || differential.diagnosis,
      rationale: `Added as differential consideration: ${differential.diagnosis}. ${differential.reasoning || ""}`,
      confidence: differential.confidence,
    }
    onAddCode(icdCodeItem)
  }

  const handleAddCode = (code: any) => {
    if (!code || !code.code) {
      return
    }

    // Determine the correct category for the code
    let updatedCodes = { ...selectedCodes }

    // If the code has a specific category (from differentials), use that
    if (code.category) {
      updatedCodes[code.category] = selectedCodes[code.category] + 1
    } else if (code.type === "CPT") {
      // Categorize CPT codes based on code number
      if (code.code.startsWith("992") || code.code.startsWith("993")) {
        // E/M codes go to consultation
        updatedCodes.codes = selectedCodes.codes + 1
      } else if (code.code.startsWith("999")) {
        // Preventive codes also go to consultation
        updatedCodes.codes = selectedCodes.codes + 1
      } else {
        // Other CPT codes might be procedures
        updatedCodes.diagnoses = selectedCodes.diagnoses + 1
      }
    } else if (code.type === "ICD-10") {
      updatedCodes.diagnoses = selectedCodes.diagnoses + 1
    }

    // Update the selected codes count
    onUpdateCodes(updatedCodes)

    // Call the optional onAddCode callback to track added codes
    if (onAddCode) {
      onAddCode(code)
    }
  }

  const followUpSuggestions = [
    { interval: "2 weeks", condition: "if symptoms persist", priority: "routine" },
    { interval: "3-5 days", condition: "if symptoms worsen", priority: "urgent" },
  ]

  const cardConfigs = [
    { key: "codes", title: "Codes", icon: Code, count: filteredCodeSuggestions.length, color: "text-blue-600" },
    { key: "compliance", title: "Compliance", icon: Shield, count: complianceAlerts.length, color: "text-amber-600" },
    { key: "prevention", title: "Prevention", icon: Heart, count: filteredPreventionSuggestions.length, color: "text-red-600" },
    { key: "differentials", title: "Differentials", icon: Stethoscope, count: filteredDifferentialSuggestions.length, color: "text-purple-600" },
    { key: "followUp", title: "Follow-Up", icon: Calendar, count: followUpSuggestions.length, color: "text-orange-600" },
  ]

  // Circular confidence indicator component
  const ConfidenceGauge = ({ confidence, size = 20 }: { confidence?: number; size?: number }) => {
    const normalizedConfidence = typeof confidence === "number" ? Math.max(0, Math.min(100, confidence)) : 0
    const radius = (size - 4) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (normalizedConfidence / 100) * circumference

    const getColor = (conf: number) => {
      if (conf >= 70) return "#10b981"
      if (conf >= 40) return "#eab308"
      return "#ef4444"
    }

    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth="2" fill="none" />
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
          <span className="text-xs font-medium text-muted-foreground">{typeof confidence === "number" ? normalizedConfidence : "–"}</span>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full border-l bg-sidebar">
        {/* Header */}
        <div className="border-b p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-medium text-base">Suggestions</h2>
              <div className="flex flex-wrap items-center gap-2">
                {renderConnectionBadge("Codes", codesConnection)}
                {renderConnectionBadge("Compliance", complianceConnection)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Live AI recommendations stream in real time when connected.</p>
            {contextInfo?.bestStage === "superficial" && (
              <Badge variant="outline" className="w-max bg-amber-50 text-amber-700 border-amber-200 text-xs">
                Limited context – deep parsing pending
              </Badge>
            )}
          </div>
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
                  <Collapsible open={expandedCards[config.key]} onOpenChange={() => toggleCard(config.key)}>
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
                          {expandedCards[config.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {/* Codes Section */}
                        {config.key === "codes" && (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                              <span>
                                Stream status: <span className="font-medium text-foreground">{describeConnectionStatus(codesConnection)}</span>
                                {shouldFetchCodes && <span className="ml-1 font-medium text-amber-600">• REST fallback active</span>}
                              </span>
                              <span className={codesStreamStatus === "error" ? "text-destructive" : codesStreamStatus === "open" ? "text-emerald-600" : undefined}>
                                {describeConnectionDetail(codesConnection)}
                              </span>
                            </div>
                            {codesLoading && <p className="text-sm text-muted-foreground">Analyzing note for coding opportunities...</p>}
                            {codesError && <p className="text-sm text-destructive">{codesError}</p>}
                            {!codesLoading && !codesError && filteredCodeSuggestions.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                {codesStreamOpen ? "Connected — waiting for live coding suggestions…" : "No code suggestions yet. Start documenting to receive recommendations."}
                              </p>
                            )}
                            {filteredCodeSuggestions.map((code, index) => {
                              const codeTypeColors: Record<string, string> = {
                                CPT: "bg-blue-50 border-blue-200 text-blue-700",
                                "ICD-10": "bg-purple-50 border-purple-200 text-purple-700",
                                HCPCS: "bg-emerald-50 border-emerald-200 text-emerald-700",
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
                                              <Badge variant="outline" className={`text-xs ${codeTypeColors[code.type || ""] || "bg-gray-50 border-gray-200 text-gray-700"}`}>
                                                {code.type || "CODE"}
                                              </Badge>
                                              <span className="font-mono text-sm font-medium">{code.code}</span>
                                            </div>
                                            <ConfidenceGauge confidence={code.confidence} size={24} />
                                          </div>

                                          {code.description && <p className="text-sm font-medium">{code.description}</p>}

                                          <div className="text-xs text-muted-foreground">{rationale}</div>
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
                                            <span className="font-medium text-blue-900">
                                              {code.type || "Code"} {code.code}
                                            </span>
                                          </div>
                                          <ConfidenceGauge confidence={code.confidence} size={24} />
                                        </div>
                                        {code.description && <p className="text-sm text-blue-800 mt-1">{code.description}</p>}
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
                        {config.key === "compliance" && (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                              <span>
                                Stream status: <span className="font-medium text-foreground">{describeConnectionStatus(complianceConnection)}</span>
                                {shouldFetchCompliance && <span className="ml-1 font-medium text-amber-600">• REST fallback active</span>}
                              </span>
                              <span className={complianceStreamStatus === "error" ? "text-destructive" : complianceStreamStatus === "open" ? "text-emerald-600" : undefined}>
                                {describeConnectionDetail(complianceConnection)}
                              </span>
                            </div>
                            {complianceLoading && <p className="text-sm text-muted-foreground">Reviewing documentation for compliance issues...</p>}
                            {complianceError && <p className="text-sm text-destructive">{complianceError}</p>}
                            {!complianceLoading && !complianceError && complianceAlerts.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                {complianceStreamOpen ? "Connected — monitoring for live compliance feedback…" : "No compliance issues detected. Keep documenting thoroughly."}
                              </p>
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
                                          className={`text-xs ${alert.priority === "critical" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}
                                        >
                                          {alert.priority}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <ConfidenceGauge confidence={alert.confidence} size={24} />
                                </div>
                                {alert.reasoning && <p className="text-xs text-muted-foreground leading-relaxed">{alert.reasoning}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Public Health Section */}
                        {config.key === "prevention" && (
                          <div className="space-y-2">
                            {preventionLoading && <p className="text-sm text-muted-foreground">Loading preventive care opportunities...</p>}
                            {preventionError && <p className="text-sm text-destructive">{preventionError}</p>}
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
                                        {item.reasoning && <p className="text-xs text-muted-foreground">{item.reasoning}</p>}
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
                                      {item.source && <p className="text-xs text-red-800 mt-1">Source: {item.source}</p>}
                                    </div>

                                    <div className="p-4 space-y-3">
                                      {item.reasoning && <p className="text-xs text-gray-700 leading-relaxed">{item.reasoning}</p>}
                                      <div className="text-xs text-muted-foreground space-y-1">
                                        <div>
                                          <span className="font-medium text-gray-900">Priority:</span> {item.priority || "Standard"}
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-900">Age relevant:</span> {item.ageRelevant ? "Yes" : "General recommendation"}
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
                        {config.key === "differentials" && (
                          <div className="space-y-3">
                            {differentialsLoading && <p className="text-sm text-muted-foreground">Generating differential diagnoses...</p>}
                            {differentialsError && <p className="text-sm text-destructive">{differentialsError}</p>}
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

                                        {item.reasoning && <div className="text-xs text-muted-foreground">{item.reasoning}</div>}

                                        {(item.supportingFactors && item.supportingFactors.length > 0) || (item.contradictingFactors && item.contradictingFactors.length > 0) ? (
                                          <div className="grid grid-cols-1 gap-2 text-xs">
                                            {item.supportingFactors && item.supportingFactors.length > 0 && (
                                              <div>
                                                <span className="text-green-700 font-medium">Supporting:</span>
                                                <span className="text-muted-foreground ml-1">{item.supportingFactors.join(", ")}</span>
                                              </div>
                                            )}
                                            {item.contradictingFactors && item.contradictingFactors.length > 0 && (
                                              <div>
                                                <span className="text-red-700 font-medium">Against:</span>
                                                <span className="text-muted-foreground ml-1">{item.contradictingFactors.join(", ")}</span>
                                              </div>
                                            )}
                                          </div>
                                        ) : null}

                                        <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                          <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => handleAddAsDifferential(item)}>
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add as Differential
                                          </Button>

                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={`h-6 text-xs flex-1 ${confidenceValue < 70 ? "text-orange-600 hover:text-orange-700" : ""}`}
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
                                          <p className="text-sm text-green-800 mt-1">
                                            {item.icdCode}
                                            {item.icdDescription ? ` - ${item.icdDescription}` : ""}
                                          </p>
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
                        {config.key === "followUp" && (
                          <div className="space-y-2">
                            {followUpSuggestions.map((item, index) => (
                              <div key={index} className="p-2 rounded border space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm flex-1">{item.interval}</p>
                                  <Badge variant="outline" className={`text-xs ${item.priority === "urgent" ? "border-red-200 text-red-700 bg-red-50" : "border-gray-200 text-gray-700 bg-gray-50"}`}>
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
              <AlertDialogDescription>This diagnosis has a confidence level below 70%. Please review the clinical reasoning before adding it as a primary diagnosis.</AlertDialogDescription>
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
                          <span className="text-sm text-orange-700">{selectedDifferential.confidence != null ? `${selectedDifferential.confidence}% confidence` : "Confidence unavailable"}</span>
                        </div>
                      </div>
                      {selectedDifferential.reasoning && <p className="text-sm text-orange-800">{selectedDifferential.reasoning}</p>}
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
                          {selectedDifferential.confidenceFactors || selectedDifferential.reasoning || "No additional reasoning provided."}
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
                                <li key={index} className="text-xs text-muted-foreground">
                                  • {test}
                                </li>
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
                                <li key={index} className="text-xs text-muted-foreground">
                                  • {test}
                                </li>
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
                          {selectedDifferential.whatItIs && <p className="text-xs text-blue-800 mb-2">{selectedDifferential.whatItIs}</p>}
                          {selectedDifferential.learnMoreUrl && (
                            <a href={selectedDifferential.learnMoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
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
                    // Create ICD-10 code item and add as diagnosis (purple card)
                    const codeValue = selectedDifferential.icdCode || selectedDifferential.diagnosis
                    if (codeValue && onAddCode) {
                      const icdCodeItem = {
                        code: codeValue,
                        type: "ICD-10",
                        category: "diagnoses",
                        description: selectedDifferential.icdDescription || selectedDifferential.diagnosis,
                        rationale: `Added as diagnosis from differential: ${selectedDifferential.diagnosis}. ${selectedDifferential.reasoning || ""}`,
                        confidence: selectedDifferential.confidence,
                      }
                      onAddCode(icdCodeItem)
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
