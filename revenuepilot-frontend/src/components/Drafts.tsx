import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { FilePlus, Calendar, Clock, User, Search, Filter, SortAsc, SortDesc, Eye, Edit, Trash2, AlertTriangle, CheckCircle, FileText, Stethoscope, MoreHorizontal, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Avatar, AvatarFallback } from "./ui/avatar"
import { Separator } from "./ui/separator"
import { Skeleton } from "./ui/skeleton"
import { apiFetch, apiFetchJson } from "../lib/api"
import { downloadPdfWithFallback } from "../utils/pdfFallback"

interface CurrentUser {
  id: string
  name: string
  fullName: string
  role: "admin" | "user"
  specialty: string
}

interface DraftNote {
  id: string
  patientId: string
  encounterId: string
  patientName: string
  visitDate: string
  lastEditDate: string
  daysOld: number
  provider: string
  visitType: "SOAP" | "Wellness" | "Follow-up" | "Consultation"
  completionStatus: number
  urgency: "low" | "medium" | "high"
  noteLength: number
  lastEditor: string
  status: string
  finalizedNoteId?: string | null
  cachedBeautifiedHtml?: string | null
  cachedSummaryHtml?: string | null
}

interface DraftAnalyticsResponse {
  drafts: number
}

interface DraftApiNote {
  id: number
  content?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  finalized_note_id?: string | null
  finalizedNoteId?: string | null
}

interface DraftsPreferences {
  provider?: string
  visitType?: string
  urgency?: string
  ageFilter?: string
  sortBy?: "visitDate" | "lastEdit" | "daysOld" | "urgency"
  sortOrder?: "asc" | "desc"
  searchTerm?: string
}

interface DataState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface DraftsSessionPayload {
  draftsPreferences?: DraftsPreferences
}

interface DraftsProps {
  onEditDraft?: (draftId: string) => void
  currentUser?: CurrentUser
  onDraftsSummaryUpdate?: (summary: { total: number }) => void
}

export function Drafts({ onEditDraft, currentUser, onDraftsSummaryUpdate }: DraftsProps) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("all")
  const [selectedVisitType, setSelectedVisitType] = useState("all")
  const [selectedUrgency, setSelectedUrgency] = useState("all")
  const [sortBy, setSortBy] = useState<"visitDate" | "lastEdit" | "daysOld" | "urgency">("daysOld")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [ageFilter, setAgeFilter] = useState("all")
  const [draftsState, setDraftsState] = useState<DataState<DraftNote[]>>({
    data: null,
    loading: true,
    error: null,
  })
  const [searchState, setSearchState] = useState<DataState<DraftNote[]>>({
    data: null,
    loading: false,
    error: null,
  })
  const [analyticsState, setAnalyticsState] = useState<DataState<DraftAnalyticsResponse>>({
    data: null,
    loading: true,
    error: null,
  })
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [preferencesHydrated, setPreferencesHydrated] = useState(false)
  const [appliedDefaultProvider, setAppliedDefaultProvider] = useState(false)
  const lastSearchRef = useRef<string>("")

  const normalizeProvider = useCallback((value?: string | null) => {
    if (!value) return "Unassigned"
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : "Unassigned"
  }, [])

  const determineVisitType = useCallback((content: string) => {
    const lower = content.toLowerCase()
    if (lower.includes("wellness")) return "Wellness"
    if (lower.includes("follow-up") || lower.includes("follow up")) return "Follow-up"
    if (lower.includes("consult")) return "Consultation"
    if (lower.includes("soap")) return "SOAP"
    if (lower.includes("initial") || lower.includes("new patient")) return "Consultation"
    return "SOAP"
  }, [])

  const extractField = useCallback((content: string, label: RegExp) => {
    const match = content.match(label)
    if (!match) return undefined
    const value = match[1]?.trim()
    return value && value.length > 0 ? value : undefined
  }, [])

  const deriveUrgency = useCallback((daysOld: number, content: string) => {
    const lower = content.toLowerCase()
    if (lower.includes("urgent") || lower.includes("critical") || daysOld >= 14) {
      return "high"
    }
    if (daysOld >= 7 || lower.includes("follow")) {
      return "medium"
    }
    return "low"
  }, [])

  const calculateCompletion = useCallback((content: string) => {
    const sections = content.split(/\n\n+/).filter(Boolean)
    const base = Math.min(95, Math.max(35, Math.round((sections.length / 6) * 100)))
    return base
  }, [])

  const transformDraft = useCallback(
    (raw: DraftApiNote): DraftNote => {
      const content = raw.content ?? ""
      const createdAt = raw.created_at ? new Date(raw.created_at) : new Date()
      const updatedAt = raw.updated_at ? new Date(raw.updated_at) : createdAt
      const now = new Date()
      const daysOld = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))

      const statusValue = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : ""
      const status = statusValue === "finalized" ? "finalized" : "draft"
      const finalizedNoteSource =
        typeof raw.finalized_note_id === "string"
          ? raw.finalized_note_id
          : typeof raw.finalizedNoteId === "string"
            ? raw.finalizedNoteId
            : null
      const finalizedNoteId = finalizedNoteSource && finalizedNoteSource.trim().length > 0 ? finalizedNoteSource.trim() : null

      const patientName = extractField(content, /patient\s*(?:name)?\s*[:\-]\s*([^\n]+)/i) || extractField(content, /name\s*[:\-]\s*([^\n]+)/i) || `Note ${raw.id}`

      const provider = normalizeProvider(extractField(content, /provider\s*[:\-]\s*([^\n]+)/i)) || normalizeProvider(extractField(content, /author\s*[:\-]\s*([^\n]+)/i))

      const patientId = extractField(content, /patient\s*id\s*[:\-]\s*([^\n]+)/i) || `PT-${String(raw.id).padStart(4, "0")}`

      const encounterId = extractField(content, /encounter\s*id\s*[:\-]\s*([^\n]+)/i) || `ENC-${String(raw.id).padStart(4, "0")}`

      const visitType = determineVisitType(content)
      const urgency = deriveUrgency(daysOld, content)
      const noteLength = content.split(/\s+/).filter(Boolean).length
      const completionStatus = calculateCompletion(content)

      const lastEditor = extractField(content, /last\s*edited\s*by\s*[:\-]\s*([^\n]+)/i) || provider || "Unassigned"

      return {
        id: `draft-${raw.id}`,
        patientId,
        encounterId,
        patientName,
        visitDate: createdAt.toISOString(),
        lastEditDate: updatedAt.toISOString(),
        daysOld,
        provider: provider || "Unassigned",
        visitType: visitType as DraftNote["visitType"],
        completionStatus,
        urgency,
        noteLength,
        lastEditor,
        status,
        finalizedNoteId,
      }
    },
    [calculateCompletion, deriveUrgency, determineVisitType, extractField, normalizeProvider],
  )

  const loadDraftData = useCallback(
    async (signal?: AbortSignal) => {
      setDraftsState((prev) => ({ ...prev, loading: true, error: null }))
      setAnalyticsState((prev) => ({ ...prev, loading: true, error: null }))

      const toMessage = (reason: unknown): string => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return ""
        }
        if (reason instanceof Error) {
          return reason.message || "Unable to load drafts."
        }
        return "Unable to load drafts."
      }

      const [draftsResult, analyticsResult] = await Promise.allSettled([
        apiFetchJson<DraftApiNote[]>("/api/notes/drafts", { signal, returnNullOnEmpty: true, fallbackValue: [] }),
        apiFetchJson<DraftAnalyticsResponse>("/api/analytics/drafts", { signal, returnNullOnEmpty: true }),
      ])

      if (signal?.aborted) {
        return
      }

      if (draftsResult.status === "fulfilled") {
        const transformed = (draftsResult.value ?? []).map(transformDraft)
        setDraftsState({ data: transformed, loading: false, error: null })
      } else {
        const message = toMessage(draftsResult.reason)
        if (message) {
          console.error("Failed to load drafts", draftsResult.reason)
        }
        setDraftsState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load draft notes.",
        }))
      }

      if (analyticsResult.status === "fulfilled") {
        setAnalyticsState({ data: analyticsResult.value ?? null, loading: false, error: null })
      } else {
        const message = toMessage(analyticsResult.reason)
        if (message) {
          console.error("Failed to load draft analytics", analyticsResult.reason)
        }
        setAnalyticsState((prev) => ({
          data: prev.data,
          loading: false,
          error: message || prev.error || "Unable to load draft analytics.",
        }))
      }
    },
    [transformDraft],
  )

  const handleRefresh = useCallback(() => {
    setRefreshCounter((prev) => prev + 1)
  }, [])

  const handleDownloadClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, draft: DraftNote, variant: "note" | "summary") => {
      event.stopPropagation()
      event.preventDefault()

      if (!draft.finalizedNoteId) {
        return
      }

      await downloadPdfWithFallback({
        finalizedNoteId: draft.finalizedNoteId,
        variant,
        patientName: draft.patientName,
        noteHtml: draft.cachedBeautifiedHtml,
        summaryHtml: draft.cachedSummaryHtml,
        offlineMessage: t("drafts.pdfUnavailableOffline", "PDF unavailable offline."),
      })
    },
    [t],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadDraftData(controller.signal).catch((error) => {
      if ((error as DOMException)?.name !== "AbortError") {
        console.error("Unexpected drafts load error", error)
      }
    })
    return () => controller.abort()
  }, [loadDraftData, refreshCounter])

  useEffect(() => {
    const controller = new AbortController()
    apiFetchJson<DraftsSessionPayload>("/api/user/session", { signal: controller.signal })
      .then((payload) => {
        const prefs = payload?.draftsPreferences
        if (!prefs) {
          if (currentUser?.name) {
            setSelectedProvider(currentUser.name)
          }
          return
        }
        if (prefs.provider) setSelectedProvider(prefs.provider)
        const validVisitTypes: DraftNote["visitType"][] = ["SOAP", "Wellness", "Follow-up", "Consultation"]
        if (prefs.visitType && validVisitTypes.includes(prefs.visitType as DraftNote["visitType"])) {
          setSelectedVisitType(prefs.visitType as DraftNote["visitType"] | "all")
        }
        const validUrgencies: Array<DraftNote["urgency"]> = ["low", "medium", "high"]
        if (prefs.urgency && validUrgencies.includes(prefs.urgency as DraftNote["urgency"])) {
          setSelectedUrgency(prefs.urgency as DraftNote["urgency"] | "all")
        }
        if (prefs.ageFilter) setAgeFilter(prefs.ageFilter)
        const validSortBy: Array<typeof sortBy> = ["visitDate", "lastEdit", "daysOld", "urgency"]
        if (prefs.sortBy && validSortBy.includes(prefs.sortBy as typeof sortBy)) {
          setSortBy(prefs.sortBy as typeof sortBy)
        }
        const validSortOrder: Array<typeof sortOrder> = ["asc", "desc"]
        if (prefs.sortOrder && validSortOrder.includes(prefs.sortOrder as typeof sortOrder)) {
          setSortOrder(prefs.sortOrder as typeof sortOrder)
        }
        if (prefs.searchTerm) {
          setSearchTerm(prefs.searchTerm)
          lastSearchRef.current = prefs.searchTerm
        }
      })
      .catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Failed to load drafts preferences", error)
        }
      })
      .finally(() => {
        setPreferencesHydrated(true)
      })

    return () => controller.abort()
  }, [currentUser?.name])

  useEffect(() => {
    if (!preferencesHydrated || !currentUser?.name || appliedDefaultProvider) {
      return
    }
    if (selectedProvider === "all") {
      setSelectedProvider(currentUser.name)
    }
    setAppliedDefaultProvider(true)
  }, [preferencesHydrated, currentUser?.name, selectedProvider, appliedDefaultProvider])

  useEffect(() => {
    if (!preferencesHydrated) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      apiFetch("/api/user/session", {
        method: "PUT",
        jsonBody: {
          draftsPreferences: {
            provider: selectedProvider,
            visitType: selectedVisitType,
            urgency: selectedUrgency,
            ageFilter,
            sortBy,
            sortOrder,
            searchTerm,
          },
        },
        signal: controller.signal,
      }).catch((error) => {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Failed to persist drafts preferences", error)
        }
      })
    }, 400)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [selectedProvider, selectedVisitType, selectedUrgency, ageFilter, sortBy, sortOrder, searchTerm, preferencesHydrated])

  useEffect(() => {
    const term = searchTerm.trim()
    if (term.length < 3) {
      setSearchState({ data: null, loading: false, error: null })
      lastSearchRef.current = term
      return
    }

    if (lastSearchRef.current === term && searchState.data) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setSearchState((prev) => ({ ...prev, loading: true, error: null }))
      apiFetchJson<DraftApiNote[]>(`/api/notes/search?q=${encodeURIComponent(term)}&status=draft`, { signal: controller.signal, returnNullOnEmpty: true, fallbackValue: [] })
        .then((results) => {
          const transformed = (results ?? []).map(transformDraft)
          setSearchState({ data: transformed, loading: false, error: null })
          lastSearchRef.current = term
        })
        .catch((error) => {
          if ((error as DOMException)?.name === "AbortError") {
            return
          }
          console.error("Failed to search drafts", error)
          setSearchState((prev) => ({
            data: prev.data,
            loading: false,
            error: error instanceof Error ? error.message : "Unable to search drafts.",
          }))
        })
    }, 300)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [searchTerm, transformDraft])

  const baseDrafts = draftsState.data ?? []
  const activeDrafts = useMemo(() => {
    const term = searchTerm.trim()
    if (term.length >= 3) {
      return searchState.data ?? []
    }
    return baseDrafts
  }, [baseDrafts, searchTerm, searchState.data])

  useEffect(() => {
    if (!onDraftsSummaryUpdate) {
      return
    }
    if (analyticsState.data && typeof analyticsState.data.drafts === "number") {
      onDraftsSummaryUpdate({ total: analyticsState.data.drafts })
      return
    }
    onDraftsSummaryUpdate({ total: baseDrafts.length })
  }, [onDraftsSummaryUpdate, analyticsState.data, baseDrafts.length])

  const filteredDrafts = useMemo(() => {
    let filtered = activeDrafts.filter((draft) => {
      const matchesSearch =
        searchTerm.trim().length === 0 ||
        draft.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        draft.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        draft.encounterId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        draft.provider.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesProvider = selectedProvider === "all" || draft.provider === selectedProvider
      const matchesVisitType = selectedVisitType === "all" || draft.visitType === selectedVisitType
      const matchesUrgency = selectedUrgency === "all" || draft.urgency === selectedUrgency

      let matchesAge = true
      if (ageFilter === "1-3") matchesAge = draft.daysOld >= 1 && draft.daysOld <= 3
      else if (ageFilter === "4-7") matchesAge = draft.daysOld >= 4 && draft.daysOld <= 7
      else if (ageFilter === "8-14") matchesAge = draft.daysOld >= 8 && draft.daysOld <= 14
      else if (ageFilter === "15+") matchesAge = draft.daysOld >= 15

      return matchesSearch && matchesProvider && matchesVisitType && matchesUrgency && matchesAge
    })

    filtered.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case "visitDate":
          comparison = new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime()
          break
        case "lastEdit":
          comparison = new Date(a.lastEditDate).getTime() - new Date(b.lastEditDate).getTime()
          break
        case "daysOld":
          comparison = a.daysOld - b.daysOld
          break
        case "urgency":
          const urgencyOrder = { high: 3, medium: 2, low: 1 }
          comparison = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
          break
      }

      return sortOrder === "asc" ? comparison : -comparison
    })

    return filtered
  }, [activeDrafts, searchTerm, selectedProvider, selectedVisitType, selectedUrgency, ageFilter, sortBy, sortOrder])

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      case "low":
        return "outline"
      default:
        return "outline"
    }
  }

  const getVisitTypeColor = (visitType: string) => {
    switch (visitType) {
      case "SOAP":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "Wellness":
        return "bg-green-50 text-green-700 border-green-200"
      case "Follow-up":
        return "bg-orange-50 text-orange-700 border-orange-200"
      case "Consultation":
        return "bg-purple-50 text-purple-700 border-purple-200"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const getDaysOldColor = (days: number) => {
    if (days <= 3) return "text-green-600"
    if (days <= 7) return "text-yellow-600"
    if (days <= 14) return "text-orange-600"
    return "text-red-600"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const getProviderInitials = (provider: string) => {
    return provider
      .split(" ")
      .map((name) => name[0])
      .join("")
      .toUpperCase()
  }

  const uniqueProviders = useMemo(() => {
    const providers = new Set<string>()
    baseDrafts.forEach((draft) => providers.add(draft.provider))
    searchState.data?.forEach((draft) => providers.add(draft.provider))
    if (currentUser?.name) {
      providers.add(currentUser.name)
    }
    return Array.from(providers).sort((a, b) => a.localeCompare(b))
  }, [baseDrafts, searchState.data, currentUser?.name])

  const searchEnabled = searchTerm.trim().length >= 3
  const listState = searchEnabled ? searchState : draftsState
  const isLoading = listState.loading || (!searchEnabled && draftsState.loading)
  const listError = listState.error || (!searchEnabled ? draftsState.error : null)

  const handleCardClick = (draftId: string) => {
    onEditDraft?.(draftId)
  }

  const handleButtonClick = (event: React.MouseEvent, draftId: string) => {
    event.stopPropagation() // Prevent triggering the card click
    onEditDraft?.(draftId)
  }

  const handleDropdownClick = (event: React.MouseEvent) => {
    event.stopPropagation() // Prevent triggering the card click
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Draft Notes</h1>
          <p className="text-muted-foreground mt-1">
            Manage and continue working on unfinished clinical documentation
            {currentUser && ` • Preferences synced for ${currentUser.name}`}
          </p>
          {analyticsState.error && <p className="text-xs text-destructive mt-2">{analyticsState.error}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            {filteredDrafts.length} of {baseDrafts.length} drafts
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => onEditDraft?.("new")}>
            <FilePlus className="w-4 h-4 mr-2" />
            New Draft
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="w-5 h-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input placeholder="Search by patient name, ID, encounter, or provider..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
              {sortOrder === "asc" ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
            </Button>
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  {uniqueProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                      {currentUser?.name === provider && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          You
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Visit Type</label>
              <Select value={selectedVisitType} onValueChange={setSelectedVisitType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SOAP">SOAP Note</SelectItem>
                  <SelectItem value="Wellness">Wellness Visit</SelectItem>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                  <SelectItem value="Consultation">Consultation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Urgency</label>
              <Select value={selectedUrgency} onValueChange={setSelectedUrgency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="high">High Priority</SelectItem>
                  <SelectItem value="medium">Medium Priority</SelectItem>
                  <SelectItem value="low">Low Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Age Filter</label>
              <Select value={ageFilter} onValueChange={setAgeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ages</SelectItem>
                  <SelectItem value="1-3">1-3 days old</SelectItem>
                  <SelectItem value="4-7">4-7 days old</SelectItem>
                  <SelectItem value="8-14">8-14 days old</SelectItem>
                  <SelectItem value="15+">15+ days old</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daysOld">Days Old</SelectItem>
                  <SelectItem value="lastEdit">Last Edited</SelectItem>
                  <SelectItem value="visitDate">Visit Date</SelectItem>
                  <SelectItem value="urgency">Urgency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Draft Notes List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Card key={`draft-skeleton-${index}`} className="shadow-sm">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : listError ? (
          <Card className="shadow-sm border-destructive/40">
            <CardContent className="py-8 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
              <div className="text-lg font-medium text-destructive">{listError}</div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : filteredDrafts.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No drafts found</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedProvider !== "all" || selectedVisitType !== "all" || selectedUrgency !== "all" || ageFilter !== "all"
                  ? "Try adjusting your filters or search criteria"
                  : "All caught up! No draft notes pending completion."}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredDrafts.map((draft, index) => {
            const isFinalized = draft.status === "finalized"
            return (
              <motion.div key={draft.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card
                  className="hover:shadow-lg transition-all duration-300 cursor-pointer bg-white border-2 border-stone-100/50 hover:border-stone-200/70 shadow-md hover:bg-stone-50/30"
                  onClick={() => handleCardClick(draft.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      {/* Left Section: Patient & Visit Info */}
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Avatar className="w-12 h-12 ring-2 ring-white shadow-sm">
                            <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-medium">
                              {draft.patientName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          {draft.urgency === "high" && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-foreground text-lg">{draft.patientName}</h3>
                            <Badge className={`text-xs font-medium ${getVisitTypeColor(draft.visitType)}`}>{draft.visitType}</Badge>
                            <Badge variant={getUrgencyColor(draft.urgency)} className="text-xs font-medium">
                              {draft.urgency} priority
                            </Badge>
                            {isFinalized && (
                              <Badge className="flex items-center gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium" variant="outline">
                                <CheckCircle className="h-3 w-3" /> Final
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="font-medium">Patient ID: {draft.patientId}</span>
                            <span>•</span>
                            <span className="font-medium">Encounter: {draft.encounterId}</span>
                            <span>•</span>
                            <span className="font-medium">Provider: {draft.provider}</span>
                            {currentUser?.name === draft.provider && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Center Section: Dates & Progress */}
                      <div className="flex items-center gap-8">
                        <div className="text-center p-3 bg-stone-50/80 rounded-lg border border-stone-200/50">
                          <div className="text-sm font-semibold text-foreground mb-1">Visit Date</div>
                          <div className="text-sm text-muted-foreground">{formatDate(draft.visitDate)}</div>
                        </div>

                        <div className="text-center p-3 bg-stone-50/80 rounded-lg border border-stone-200/50">
                          <div className="text-sm font-semibold text-foreground mb-1">Last Edit</div>
                          <div className="text-sm text-muted-foreground">{formatDate(draft.lastEditDate)}</div>
                          <div className="text-xs text-muted-foreground">{formatTime(draft.lastEditDate)}</div>
                        </div>

                        <div className="text-center p-3 bg-stone-50/80 rounded-lg border border-stone-200/50">
                          <div className="text-sm font-semibold text-foreground mb-2">Completion</div>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-3 bg-stone-200 rounded-full overflow-hidden shadow-inner">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 shadow-sm" style={{ width: `${draft.completionStatus}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-foreground">{draft.completionStatus}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Section: Age & Actions */}
                      <div className="flex items-center gap-6">
                        <div className="text-center p-4 bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl border border-stone-200/50 shadow-sm">
                          <div className={`text-3xl font-bold ${getDaysOldColor(draft.daysOld)} mb-1`}>{draft.daysOld}</div>
                          <div className="text-xs text-muted-foreground font-medium">day{draft.daysOld !== 1 ? "s" : ""} old</div>
                        </div>

                        <div className="flex items-center gap-3">
                          {isFinalized ? (
                            <div className="flex flex-col gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="shadow-sm justify-start"
                                aria-label={t("drafts.downloadSummaryPdfAria", {
                                  patient: draft.patientName,
                                })}
                                disabled={!draft.finalizedNoteId}
                                onClick={(event) =>
                                  void handleDownloadClick(event, draft, "summary")
                                }
                              >
                                {t("drafts.downloadSummaryPdf", "Download Patient Summary (PDF)")}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="shadow-sm justify-start"
                                aria-label={t("drafts.downloadNotePdfAria", {
                                  patient: draft.patientName,
                                })}
                                disabled={!draft.finalizedNoteId}
                                onClick={(event) => void handleDownloadClick(event, draft, "note")}
                              >
                                {t("drafts.downloadNotePdf", "Download Note (PDF)")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={(e) => handleButtonClick(e, draft.id)}
                              className="shadow-sm hover:shadow-md transition-shadow"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Continue
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="shadow-sm" onClick={handleDropdownClick}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="w-4 h-4 mr-2" />
                                Preview
                              </DropdownMenuItem>
                              {!isFinalized && (
                                <DropdownMenuItem onClick={(e) => handleButtonClick(e, draft.id)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    {/* Additional Info Row */}
                    <div className="mt-6 pt-4 border-t border-stone-200/50 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {draft.noteLength} words
                        </span>
                        <span>•</span>
                        <span>Last edited by {draft.lastEditor}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {draft.completionStatus < 50 && (
                          <div className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-md border border-orange-200/50">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs font-medium">Needs attention</span>
                          </div>
                        )}
                        {draft.completionStatus >= 90 && (
                          <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-200/50">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-medium">Nearly complete</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Summary Stats */}
      {filteredDrafts.length > 0 && (
        <Card className="shadow-sm bg-gradient-to-r from-stone-50 to-stone-100 border-stone-200/50">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
              <div className="p-4 bg-white rounded-lg shadow-sm border border-stone-200/50">
                <div className="text-3xl font-bold text-foreground mb-1">{filteredDrafts.length}</div>
                <div className="text-sm text-muted-foreground font-medium">Total Drafts</div>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-stone-200/50">
                <div className="text-3xl font-bold text-red-600 mb-1">{filteredDrafts.filter((d) => d.urgency === "high").length}</div>
                <div className="text-sm text-muted-foreground font-medium">High Priority</div>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-stone-200/50">
                <div className="text-3xl font-bold text-blue-600 mb-1">{Math.round(filteredDrafts.reduce((acc, d) => acc + d.completionStatus, 0) / filteredDrafts.length)}%</div>
                <div className="text-sm text-muted-foreground font-medium">Avg Completion</div>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-stone-200/50">
                <div className="text-3xl font-bold text-orange-600 mb-1">{filteredDrafts.filter((d) => d.daysOld > 7).length}</div>
                <div className="text-sm text-muted-foreground font-medium">Over 7 Days Old</div>
              </div>
            </div>
            {analyticsState.data && <div className="mt-4 text-sm text-muted-foreground text-center">System-wide draft count: {analyticsState.data.drafts}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
