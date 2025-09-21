import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { TooltipProvider } from "./components/ui/tooltip"
import { NavigationSidebar } from "./components/NavigationSidebar"
import { Dashboard } from "./components/Dashboard"
import { Analytics } from "./components/Analytics"
import { Settings } from "./components/Settings"
import { ActivityLog } from "./components/ActivityLog"
import { Drafts } from "./components/Drafts"
import { Schedule, type ScheduleChartUploadStatus } from "./components/Schedule"
import { Builder } from "./components/Builder"
import { NoteEditor } from "./components/NoteEditor"
import type { BeautifyResultState, EhrExportState } from "./components/BeautifiedView"
import { SuggestionPanel } from "./components/SuggestionPanel"
import { SelectedCodesBar } from "./components/SelectedCodesBar"
import { StyleGuide } from "./components/StyleGuide"
import { FigmaComponentLibrary } from "./components/FigmaComponentLibrary"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable"
import { Button } from "./components/ui/button"
import { Badge } from "./components/ui/badge"
import {
  FinalizationWizardAdapter,
  type FinalizationWizardLaunchOptions
} from "./components/FinalizationWizardAdapter"
import type { StoredFinalizationSession } from "./features/finalization/workflowTypes"
import { useAuth } from "./contexts/AuthContext"
import { useSession } from "./contexts/SessionContext"
import type { SessionCode, SuggestionCodeInput } from "./contexts/SessionContext"
import { apiFetch, apiFetchJson } from "./lib/api"
import { mapServerViewToViewKey, type ViewKey } from "./lib/navigation"
import type { FinalizeResult } from "./features/finalization"

interface RawScheduleAppointment {
  id: number | string
  patient: string
  patientId?: string | number | null
  encounterId?: string | number | null
  reason: string
  start: string
  end: string
  provider?: string | null
  status?: string | null
  location?: string | null
  visitSummary?: Record<string, unknown> | null
}

interface ScheduleApiResponse {
  appointments?: RawScheduleAppointment[]
  visitSummaries?: Record<string, Record<string, unknown>>
}

interface ScheduleAppointmentView {
  id: string
  patientId: string
  encounterId: string
  patientName: string
  patientPhone: string
  patientEmail: string
  appointmentTime: string
  duration: number
  appointmentType: 'Wellness' | 'Follow-up' | 'New Patient' | 'Urgent' | 'Consultation'
  provider: string
  location: string
  status: 'Scheduled' | 'Checked In' | 'In Progress' | 'Completed' | 'No Show' | 'Cancelled'
  notes?: string
  fileUpToDate: boolean
  priority: 'low' | 'medium' | 'high'
  isVirtual: boolean
  sourceStatus: string
  visitSummary?: Record<string, unknown> | null
}

interface ScheduleDataState {
  data: ScheduleAppointmentView[] | null
  loading: boolean
  error: string | null
}

interface ScheduleFiltersSnapshot {
  provider: string
  status: string
  appointmentType: string
  viewMode: string
  date: string
  search: string
}

interface DraftAnalyticsSummary {
  drafts: number
}


type NoteViewMode = "draft" | "beautified"

interface ActiveDraftState {
  noteId: string
  content: string
  patientId?: string
  encounterId?: string
  patientName?: string
}


const VIEW_PERMISSIONS: Partial<Record<ViewKey, string>> = {
  analytics: "view:analytics",
  settings: "manage:settings",
  activity: "view:activity-log",
  drafts: "view:drafts",
  schedule: "view:schedule",
  builder: "manage:builder",
  "figma-library": "view:design-library"
}

const VIEW_LABELS: Record<ViewKey, string> = {
  home: "Home",
  app: "Documentation",
  finalization: "Finalization",
  analytics: "Analytics",
  settings: "Settings",
  activity: "Activity Log",
  drafts: "Drafts",
  schedule: "Schedule",
  builder: "Builder",
  "style-guide": "Style Guide",
  "figma-library": "Figma Library"
}

export function ProtectedApp() {
  const auth = useAuth()
  const {
    state: sessionState,
    actions: sessionActions,
    hydrated: sessionHydrated,
    syncing: sessionSyncing
  } = useSession()

  const [currentView, setCurrentView] = useState<ViewKey>('home')
  const [viewHydrated, setViewHydrated] = useState(false)
  const [prePopulatedPatient, setPrePopulatedPatient] = useState<{
    patientId: string
    encounterId: string
  } | null>(null)
  const [activeDraft, setActiveDraft] = useState<ActiveDraftState | null>(null)
  const [noteEditorContent, setNoteEditorContent] = useState<string>(activeDraft?.content ?? "")
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null)
  const [finalizationRequest, setFinalizationRequest] = useState<FinalizationWizardLaunchOptions | null>(null)
  const finalizationReturnViewRef = useRef<ViewKey>("app")

  const userRole = (auth.user?.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user'

  const currentUser = useMemo(
    () => ({
      id: auth.user?.id ?? 'user-unknown',
      name:
        typeof auth.user?.name === 'string' && auth.user.name.trim().length > 0
          ? auth.user.name
          : typeof auth.user?.fullName === 'string' && auth.user.fullName.trim().length > 0
            ? auth.user.fullName
            : 'Clinician',
      fullName:
        typeof auth.user?.fullName === 'string' && auth.user.fullName.trim().length > 0
          ? auth.user.fullName
          : typeof auth.user?.name === 'string' && auth.user.name.trim().length > 0
            ? auth.user.name
            : 'Clinician',
      role: userRole,
      specialty:
        typeof auth.user?.specialty === 'string' && auth.user.specialty.trim().length > 0
          ? auth.user.specialty
          : 'General Medicine'
    }),
    [auth.user, userRole]
  )

  const { selectedCodes, selectedCodesList, addedCodes, isSuggestionPanelOpen, layout } = sessionState
  const isFinalizationView = currentView === 'finalization'
  const finalizationSessionSnapshot = useMemo<StoredFinalizationSession | null>(() => {
    if (!finalizationRequest) {
      return null
    }
    const sessions = sessionState.finalizationSessions
    if (!sessions || Object.keys(sessions).length === 0) {
      return null
    }

    const normalize = (value?: string | number | null): string => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value).trim().toLowerCase()
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed.toLowerCase() : ''
      }
      return ''
    }

    const normalizedNoteId = normalize(finalizationRequest.noteId ?? null)
    const normalizedEncounterId = normalize(finalizationRequest.patientInfo?.encounterId ?? null)
    const normalizedPatientId = normalize(finalizationRequest.patientInfo?.patientId ?? null)

    const entries = Object.values(sessions).filter(
      (entry): entry is StoredFinalizationSession => Boolean(entry && typeof entry === 'object')
    )

    if (!entries.length) {
      return null
    }

    const sorted = entries.slice().sort((a, b) => {
      const parseTimestamp = (input?: string | null) => {
        if (typeof input !== 'string') {
          return 0
        }
        const timestamp = Date.parse(input)
        return Number.isNaN(timestamp) ? 0 : timestamp
      }
      const bTime = parseTimestamp(b.updatedAt ?? b.createdAt)
      const aTime = parseTimestamp(a.updatedAt ?? a.createdAt)
      return bTime - aTime
    })

    if (normalizedNoteId) {
      const match = sorted.find(
        session => normalize(session.noteId ?? null) === normalizedNoteId
      )
      if (match) {
        return match
      }
    }

    if (normalizedEncounterId) {
      const match = sorted.find(
        session => normalize(session.encounterId ?? null) === normalizedEncounterId
      )
      if (match) {
        return match
      }
    }

    if (normalizedPatientId) {
      const match = sorted.find(
        session => normalize(session.patientId ?? null) === normalizedPatientId
      )
      if (match) {
        return match
      }
    }

    return null
  }, [finalizationRequest, sessionState.finalizationSessions])

  const finalizationAdapterProps = useMemo(() => {
    if (!finalizationRequest) {
      return null
    }
    const {
      onClose: _onClose,
      displayMode,
      initialPreFinalizeResult,
      initialSessionSnapshot,
      ...rest
    } = finalizationRequest
    const snapshot = finalizationSessionSnapshot ?? initialSessionSnapshot ?? null
    return {
      ...rest,
      displayMode: displayMode ?? 'embedded',
      initialPreFinalizeResult: initialPreFinalizeResult ?? snapshot?.lastPreFinalize ?? null,
      initialSessionSnapshot: snapshot ?? null
    }
  }, [finalizationRequest, finalizationSessionSnapshot])

  const [appointmentsState, setAppointmentsState] = useState<ScheduleDataState>({
    data: null,
    loading: true,
    error: null
  })
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0)
  const [scheduleFilters, setScheduleFilters] = useState<ScheduleFiltersSnapshot | null>(null)
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [chartUploadStatuses, setChartUploadStatuses] = useState<Record<string, ScheduleChartUploadStatus>>({})

  const [noteViewMode, setNoteViewMode] = useState<NoteViewMode>("draft")
  const [beautifiedNoteState, setBeautifiedNoteState] = useState<BeautifyResultState | null>(null)
  const [ehrExportStatus, setEhrExportStatus] = useState<EhrExportState | null>(null)

  useEffect(() => {
    setNoteEditorContent(activeDraft?.content ?? "")
  }, [activeDraft])

  const normalizeText = useCallback((value?: string | number | null, fallback = "") => {
    if (value === undefined || value === null) {
      return fallback
    }
    const trimmed = String(value).trim()
    return trimmed.length > 0 ? trimmed : fallback
  }, [])

  const mapScheduleStatus = useCallback((status?: string | null): ScheduleAppointmentView['status'] => {
    switch ((status ?? '').toLowerCase()) {
      case 'checked in':
      case 'check-in':
        return 'Checked In'
      case 'in-progress':
      case 'in progress':
      case 'start':
        return 'In Progress'
      case 'completed':
        return 'Completed'
      case 'cancelled':
      case 'canceled':
        return 'Cancelled'
      case 'no show':
      case 'no-show':
        return 'No Show'
      default:
        return 'Scheduled'
    }
  }, [])

  const determineVisitType = useCallback((reason: string): ScheduleAppointmentView['appointmentType'] => {
    const lower = reason.toLowerCase()
    if (lower.includes('wellness')) return 'Wellness'
    if (lower.includes('follow')) return 'Follow-up'
    if (lower.includes('urgent') || lower.includes('emergency')) return 'Urgent'
    if (lower.includes('new')) return 'New Patient'
    if (lower.includes('consult')) return 'Consultation'
    return 'Consultation'
  }, [])

  const determinePriority = useCallback((start: Date, status: ScheduleAppointmentView['status'], reason: string): ScheduleAppointmentView['priority'] => {
    if (status === 'Cancelled') {
      return 'low'
    }
    if (/urgent|emergency|stat/.test(reason.toLowerCase())) {
      return 'high'
    }
    const diffHours = (start.getTime() - Date.now()) / (1000 * 60 * 60)
    if (diffHours <= 1) {
      return 'high'
    }
    if (diffHours <= 4) {
      return 'medium'
    }
    return 'low'
  }, [])

  const buildPatientEmail = useCallback((name: string, id: number | string) => {
    const baseName = name.toLowerCase().replace(/[^a-z0-9]/g, '.') || 'patient'
    const idComponent = String(id ?? '').trim().replace(/[^a-z0-9]/g, '.')
    const suffix = idComponent.length > 0 ? `.${idComponent}` : ''
    return `${baseName}${suffix}@example.com`
  }, [])

  const transformAppointment = useCallback(
    (raw: RawScheduleAppointment): ScheduleAppointmentView => {
      const startCandidate = new Date(raw.start)
      const start = Number.isNaN(startCandidate.getTime()) ? new Date() : startCandidate
      const endCandidate = new Date(raw.end)
      const end = Number.isNaN(endCandidate.getTime())
        ? new Date(start.getTime() + 30 * 60 * 1000)
        : endCandidate
      const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / (1000 * 60)) || 30)

      const summary =
        raw.visitSummary && typeof raw.visitSummary === 'object'
          ? (raw.visitSummary as Record<string, unknown>)
          : null
      const readString = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
      }

      const idString = typeof raw.id === 'string' ? raw.id : String(raw.id ?? '')
      const idDigits = idString.replace(/[^0-9]/g, '')

      const patientName = normalizeText(
        readString(summary?.patientName) ?? raw.patient,
        `Patient ${idString || '0'}`
      )
      const summaryReason = readString(summary?.chiefComplaint) ?? readString(summary?.reason)
      const reason = normalizeText(summaryReason ?? raw.reason, 'Scheduled visit')
      const summaryProvider = readString(summary?.provider)
      const provider = normalizeText(summaryProvider ?? raw.provider, 'Unassigned')
      const summaryStatus = readString(summary?.status)
      const status = mapScheduleStatus(summaryStatus ?? raw.status)
      const encounterType = readString(summary?.encounterType)
      const rawLocation = readString(raw.location) ?? readString(summary?.location)
      const isVirtual = Boolean(
        (encounterType && /tele|virtual/.test(encounterType.toLowerCase())) ||
          (rawLocation && /virtual/.test(rawLocation.toLowerCase())) ||
          /virtual|telehealth|telemedicine/.test(reason.toLowerCase())
      )
      const location = normalizeText(rawLocation, isVirtual ? 'Virtual' : 'Main Clinic')

      const patientIdSource =
        raw.patientId ??
        readString(summary?.patientId) ??
        readString(summary?.patientID) ??
        readString(summary?.mrn)
      const fallbackPatientId = idDigits
        ? `PT-${idDigits.padStart(4, '0')}`
        : `PT-${(idString || '0').padStart(4, '0')}`
      const patientId = normalizeText(patientIdSource, fallbackPatientId)

      const encounterIdSource =
        raw.encounterId ?? readString(summary?.encounterId) ?? readString(summary?.encounterID)
      const fallbackEncounterId = idDigits
        ? `ENC-${idDigits.padStart(4, '0')}`
        : `ENC-${(idString || '0').padStart(4, '0')}`
      const encounterId = normalizeText(encounterIdSource, fallbackEncounterId)

      const documentationComplete =
        typeof summary?.documentationComplete === 'boolean'
          ? summary.documentationComplete
          : undefined
      const summaryNotes =
        readString(summary?.summary) ?? readString(summary?.notes) ?? readString(summary?.chiefComplaint)

      return {
        id: idString || patientId,
        patientId,
        encounterId,
        patientName,
        patientPhone: '(555) 000-0000',
        patientEmail: buildPatientEmail(patientName, raw.patientId ?? raw.id ?? patientId),
        appointmentTime: start.toISOString(),
        duration: durationMinutes,
        appointmentType: determineVisitType(reason),
        provider,
        location,
        status,
        notes: summaryNotes ?? reason,
        fileUpToDate: documentationComplete ?? status === 'Completed',
        priority: determinePriority(start, status, reason),
        isVirtual,
        sourceStatus: normalizeText(summaryStatus ?? raw.status, 'scheduled'),
        visitSummary: summary,
      }
    },
    [
      buildPatientEmail,
      determinePriority,
      determineVisitType,
      mapScheduleStatus,
      normalizeText
    ]
  )

  const statusToAction = useCallback((status: ScheduleAppointmentView['status']): string | null => {
    switch (status) {
      case 'Scheduled':
        return 'scheduled'
      case 'Checked In':
        return 'check-in'
      case 'In Progress':
        return 'start'
      case 'Completed':
        return 'complete'
      case 'Cancelled':
      case 'No Show':
        return 'cancelled'
      default:
        return null
    }
  }, [])

  const deriveScheduleOperations = useCallback(
    (previous: ScheduleAppointmentView[], next: ScheduleAppointmentView[]) => {
      const operations: Array<{ id: string; action: string; time?: string }> = []
      const previousMap = new Map(previous.map(item => [item.id, item]))

      next.forEach(appointment => {
        const prior = previousMap.get(appointment.id)
        if (!prior) {
          return
        }
        if (appointment.appointmentTime !== prior.appointmentTime) {
          operations.push({ id: appointment.id, action: 'reschedule', time: appointment.appointmentTime })
        }
        if (appointment.status !== prior.status) {
          const action = statusToAction(appointment.status)
          if (action) {
            operations.push({ id: appointment.id, action })
          }
        }
      })

      return operations
    },
    [statusToAction]
  )

  const triggerScheduleRefresh = useCallback(() => {
    setScheduleRefreshKey(prev => prev + 1)
  }, [])

  const applyScheduleOperations = useCallback(
    async (operations: Array<{ id: string; action: string; time?: string }>) => {
      if (!operations.length) {
        return
      }

      const updates = operations
        .map(operation => {
          const numericId = Number(operation.id)
          if (!Number.isFinite(numericId)) {
            return null
          }
          const payload: { id: number; action: string; time?: string } = {
            id: numericId,
            action: operation.action
          }
          if (operation.time) {
            payload.time = new Date(operation.time).toISOString()
          }
          return payload
        })
        .filter((item): item is { id: number; action: string; time?: string } => Boolean(item))

      if (!updates.length) {
        return
      }

      setAppointmentsState(prev => ({ ...prev, loading: true }))

      try {
        const result = await apiFetchJson<{ succeeded?: number; failed?: number }>(
          '/api/schedule/bulk-operations',
          {
            method: 'POST',
            jsonBody: {
              updates,
              provider: normalizeText(currentUser?.name)
            },
            returnNullOnEmpty: true
          }
        )

        if (result?.failed && result.failed > 0) {
          setAppointmentsState(prev => ({
            ...prev,
            loading: false,
            error: `Unable to update ${result.failed} appointment${result.failed === 1 ? '' : 's'}.`
          }))
        } else {
          setAppointmentsState(prev => ({ ...prev, error: null }))
        }
        triggerScheduleRefresh()
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') {
          return
        }
        setAppointmentsState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to update schedule.'
        }))
      }
    },
    [currentUser?.name, normalizeText, triggerScheduleRefresh]
  )

  const handleAppointmentsChange = useCallback(
    (updater: ScheduleAppointmentView[] | ((prev: ScheduleAppointmentView[]) => ScheduleAppointmentView[])) => {
      setAppointmentsState(prev => {
        const current = prev.data ?? []
        const next = typeof updater === 'function'
          ? (updater as (prev: ScheduleAppointmentView[]) => ScheduleAppointmentView[])(current)
          : updater

        if (!Array.isArray(next)) {
          return prev
        }

        const operations = deriveScheduleOperations(current, next)
        if (operations.length > 0) {
          applyScheduleOperations(operations).catch(error => {
            if ((error as DOMException)?.name !== 'AbortError') {
              console.error('Failed to apply schedule operations', error)
            }
          })
        }

        return { ...prev, data: next }
      })
    },
    [applyScheduleOperations, deriveScheduleOperations]
  )

  const handleScheduleFiltersChange = useCallback((filters: ScheduleFiltersSnapshot) => {
    setScheduleFilters(prev => {
      if (prev && JSON.stringify(prev) === JSON.stringify(filters)) {
        return prev
      }
      return filters
    })
  }, [])

  const loadAppointments = useCallback(
    async (signal?: AbortSignal) => {
      setAppointmentsState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const response = await apiFetchJson<ScheduleApiResponse>(
          '/api/schedule/appointments',
          { signal, returnNullOnEmpty: true }
        )
        if (signal?.aborted) {
          return
        }
        const summaries = response?.visitSummaries ?? {}
        const transformed = (response?.appointments ?? []).map(appt => {
          const idKey = appt?.id !== undefined && appt?.id !== null ? String(appt.id) : undefined
          const summary = idKey ? summaries[idKey] : undefined
          const enriched = summary && !appt.visitSummary ? { ...appt, visitSummary: summary } : appt
          return transformAppointment(enriched)
        })
        setAppointmentsState({ data: transformed, loading: false, error: null })
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') {
          return
        }
        setAppointmentsState(prev => ({
          data: prev.data,
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load schedule.'
        }))
      }
    },
    [transformAppointment]
  )

  const filtersKey = useMemo(() => (scheduleFilters ? JSON.stringify(scheduleFilters) : 'base'), [scheduleFilters])

  useEffect(() => {
    const controller = new AbortController()
    loadAppointments(controller.signal).catch(error => {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('Unexpected schedule load error', error)
      }
    })
    return () => controller.abort()
  }, [loadAppointments, scheduleRefreshKey, filtersKey])

  useEffect(() => {
    const controller = new AbortController()
    apiFetchJson<DraftAnalyticsSummary>('/api/analytics/drafts', { signal: controller.signal })
      .then(summary => {
        if (summary && typeof summary.drafts === 'number') {
          setDraftCount(summary.drafts)
        }
      })
      .catch(error => {
        if ((error as DOMException)?.name !== 'AbortError') {
          console.error('Failed to load draft analytics summary', error)
        }
      })
    return () => controller.abort()
  }, [])

  const canAccessView = useCallback(
    (view: ViewKey) => {
      const permission = VIEW_PERMISSIONS[view]
      if (!permission) return true
      return auth.hasPermission(permission)
    },
    [auth]
  )

  useEffect(() => {
    if (viewHydrated) {
      return
    }

    let active = true
    const controller = new AbortController()

    const hydrateView = async () => {
      try {
        const response = await apiFetchJson<{ currentView?: string }>("/api/user/current-view", {
          signal: controller.signal,
          returnNullOnEmpty: true
        })

        if (!active) {
          return
        }

        const serverView = response?.currentView
        if (!serverView) {
          setViewHydrated(true)
          return
        }

        const resolved = mapServerViewToViewKey(serverView)
        setCurrentView(prev => {
          const allowed = canAccessView(resolved) ? resolved : "home"
          return prev === allowed ? prev : allowed
        })
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Failed to load current view", error)
        }
      } finally {
        if (active) {
          setViewHydrated(true)
        }
      }
    }

    hydrateView()

    return () => {
      active = false
      controller.abort()
    }
  }, [viewHydrated, canAccessView])

  useEffect(() => {
    if (!canAccessView(currentView)) {
      setCurrentView('home')
    }
  }, [currentView, canAccessView])

  useEffect(() => {
    if (!accessDeniedMessage) {
      return
    }
    const timer = window.setTimeout(() => setAccessDeniedMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [accessDeniedMessage])

  const handleNavigate = useCallback(
    (view: ViewKey) => {
      if (!canAccessView(view)) {
        setAccessDeniedMessage(`You do not have permission to access ${VIEW_LABELS[view] ?? view}.`)
        return
      }
      setViewHydrated(true)
      setCurrentView(view)
    },
    [canAccessView]
  )

  const accessMessage = accessDeniedMessage ? (
    <div className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      {accessDeniedMessage}
    </div>
  ) : null

  const handleAddCode = useCallback(
    (code: SuggestionCodeInput | SessionCode) => {
      sessionActions.addCode(code)
    },
    [sessionActions]
  )

  const handleRemoveCode = useCallback(
    (code: SessionCode, action: 'clear' | 'return', reasoning?: string) => {
      sessionActions.removeCode(code, {
        returnToSuggestions: action === 'return',
        reasoning
      })
    },
    [sessionActions]
  )

  const handleChangeCategoryCode = useCallback(
    (code: SessionCode, newCategory: 'diagnoses' | 'differentials') => {
      sessionActions.changeCodeCategory(code, newCategory)
    },
    [sessionActions]
  )

  const handleOpenFinalization = useCallback(
    (options: FinalizationWizardLaunchOptions) => {
      finalizationReturnViewRef.current = currentView
      setFinalizationRequest(options)
      setCurrentView('finalization')
    },
    [currentView]
  )

  const handleFinalizationViewClose = useCallback(
    (result?: FinalizeResult) => {
      if (finalizationRequest?.onClose) {
        finalizationRequest.onClose(result)
      }
      setFinalizationRequest(null)
      setCurrentView(prev => {
        if (prev !== 'finalization') {
          return prev
        }
        const target =
          finalizationReturnViewRef.current && finalizationReturnViewRef.current !== 'finalization'
            ? finalizationReturnViewRef.current
            : 'app'
        finalizationReturnViewRef.current = 'app'
        return target
      })
    },
    [finalizationRequest]
  )

  useEffect(() => {
    if (currentView !== 'finalization' && finalizationRequest) {
      finalizationRequest.onClose?.()
      setFinalizationRequest(null)
      finalizationReturnViewRef.current = 'app'
    }
  }, [currentView, finalizationRequest])

  const handleLayoutChange = useCallback(
    (sizes: number[]) => {
      if (!Array.isArray(sizes) || sizes.length === 0) {
        return
      }
      sessionActions.setLayout({
        noteEditor: typeof sizes[0] === 'number' ? sizes[0] : layout.noteEditor,
        suggestionPanel: typeof sizes[1] === 'number' ? sizes[1] : layout.suggestionPanel
      })
    },
    [sessionActions, layout.noteEditor, layout.suggestionPanel]
  )

  if (!sessionHydrated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    )
  }

  const extractDraftField = useCallback((content: string, pattern: RegExp) => {
    const match = pattern.exec(content)
    if (!match || typeof match[1] !== 'string') {
      return undefined
    }
    const value = match[1].trim()
    return value.length > 0 ? value : undefined
  }, [])

  const handleEditDraft = useCallback(
    async (draftId: string) => {
      const normalizedId = draftId.replace(/^draft-/i, '').trim()
      if (!normalizedId) {
        return
      }

      sessionActions.reset()

      try {
        let draftContent = ''
        const versions = await apiFetchJson<any[]>(`/api/notes/versions/${encodeURIComponent(normalizedId)}`, {
          fallbackValue: [],
          returnNullOnEmpty: true
        })
        if (Array.isArray(versions) && versions.length > 0) {
          const latest = versions[versions.length - 1]
          if (latest && typeof latest.content === 'string') {
            draftContent = latest.content
          }
        }

        if (!draftContent) {
          const drafts = await apiFetchJson<any[]>("/api/notes/drafts", {
            fallbackValue: [],
            returnNullOnEmpty: true
          })
          const match = Array.isArray(drafts)
            ? drafts.find(entry => String(entry?.id) === normalizedId)
            : undefined
          if (match && typeof match.content === 'string') {
            draftContent = match.content
          }
        }

        const patientId = extractDraftField(draftContent, /patient\s*id\s*[:\-]\s*([^\n]+)/i)
        const encounterId = extractDraftField(draftContent, /encounter\s*id\s*[:\-]\s*([^\n]+)/i)
        const patientName = extractDraftField(
          draftContent,
          /patient\s*(?:name)?\s*[:\-]\s*([^\n]+)/i,
        )

        setActiveDraft({
          noteId: normalizedId,
          content: draftContent,
          patientId,
          encounterId,
          patientName
        })

        if (patientId || encounterId) {
          setPrePopulatedPatient({
            patientId: patientId ?? '',
            encounterId: encounterId ?? ''
          })
        } else {
          setPrePopulatedPatient(null)
        }

        handleNavigate('app')
      } catch (error) {
        console.error('Failed to load draft note', error)
      }
    },
    [apiFetchJson, extractDraftField, handleNavigate, sessionActions],
  )

  const handleStartVisit = useCallback(
    async (appointmentId: string, patientId: string, encounterId: string) => {
      try {
        await applyScheduleOperations([{ id: appointmentId, action: 'start' }])
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') {
          console.error('Failed to update appointment status', error)
        }
      }
      setActiveDraft(null)
      setPrePopulatedPatient({ patientId, encounterId })
      handleNavigate('app')
    },
    [applyScheduleOperations, handleNavigate]
  )

  const handleDraftSummaryUpdate = useCallback((summary: { total: number }) => {
    setDraftCount(summary.total)
  }, [])

  const handleUploadChart = useCallback((patientId: string) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf,.txt,.rtf,.doc,.docx,.json,.xml"

    const cleanup = () => {
      input.value = ""
      input.remove()
    }

    const uploadFile = async (file: File) => {
      const boundary = `----RevenuePilotUpload${Math.random().toString(16).slice(2)}`
      const encoder = new TextEncoder()
      const safeFileName = file.name.replace(/"/g, "%22") || "chart-upload"
      const prefixBytes = encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFileName}"\r\nContent-Type: ${
          file.type || "application/octet-stream"
        }\r\n\r\n`
      )
      const suffixBytes = encoder.encode("\r\n--" + boundary + "--\r\n")
      const totalBytes = Math.max(prefixBytes.byteLength + file.size + suffixBytes.byteLength, 1)
      let uploadedBytes = 0
      const reader = file.stream().getReader()

      const updateProgress = (progress: number, status: ScheduleChartUploadStatus["status"] = "uploading", error?: string) => {
        const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)))
        setChartUploadStatuses(prev => ({
          ...prev,
          [patientId]: {
            status,
            progress: boundedProgress,
            fileName: file.name,
            error
          }
        }))
      }

      updateProgress(0)

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(prefixBytes)
          uploadedBytes += prefixBytes.byteLength
          updateProgress((uploadedBytes / totalBytes) * 100)

          const pump = (): void => {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  controller.enqueue(suffixBytes)
                  uploadedBytes += suffixBytes.byteLength
                  updateProgress((uploadedBytes / totalBytes) * 100)
                  controller.close()
                  return
                }

                if (value) {
                  controller.enqueue(value)
                  uploadedBytes += value.byteLength
                  updateProgress((uploadedBytes / totalBytes) * 100)
                }

                pump()
              })
              .catch(error => {
                controller.error(error)
              })
          }

          pump()
        },
        cancel(reason) {
          reader.cancel(reason).catch(() => undefined)
        }
      })

      const controller = new AbortController()

      try {
        const response = await apiFetch("/api/charts/upload", {
          method: "POST",
          body: stream,
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`
          },
          signal: controller.signal
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || "Unable to upload chart.")
        }

        try {
          await response.json()
        } catch {
          // Ignore JSON parsing issues – upload succeeded
        }

        updateProgress(100, "success")

        setAppointmentsState(prev => {
          if (!prev.data) {
            return prev
          }
          return {
            ...prev,
            data: prev.data.map(appointment =>
              appointment.patientId === patientId
                ? { ...appointment, fileUpToDate: true }
                : appointment
            )
          }
        })

        try {
          await apiFetchJson("/api/activity/log", {
            method: "POST",
            jsonBody: {
              action: "chart.upload",
              category: "chart",
              details: {
                patientId,
                fileName: file.name,
                size: file.size
              }
            }
          })
        } catch (error) {
          console.error("Failed to log chart upload", error)
        }

        triggerScheduleRefresh()
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return
        }
        const message = error instanceof Error ? error.message : "Unable to upload chart."
        updateProgress(0, "error", message)
      }
    }

    input.addEventListener("change", () => {
      const file = input.files?.[0]
      if (!file) {
        cleanup()
        return
      }
      void uploadFile(file).finally(cleanup)
    })

    input.click()
  }, [triggerScheduleRefresh])

  // Calculate user's draft count for navigation badge
  const getUserDraftCount = () => {
    if (typeof draftCount === 'number') {
      return draftCount
    }
    return 0
  }

  // Home Dashboard View
  if (currentView === 'home') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="home" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">RevenuePilot Dashboard</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                    View Style Guide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Dashboard onNavigate={handleNavigate} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Analytics View
  if (currentView === 'analytics') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="analytics" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Analytics Dashboard</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Admin Access' : 'User Access'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Analytics userRole={userRole} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Activity Log View
  if (currentView === 'activity') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="activity" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Activity Log</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Administrator' : 'User'} Access
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('analytics')}>
                    Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('settings')}>
                    Settings
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <ActivityLog
                  currentUser={currentUser}
                  userRole={userRole}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Settings View
  if (currentView === 'settings') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="settings" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Settings & Configuration</h1>
                  <Badge variant="outline" className="ml-2">
                    {userRole === 'admin' ? 'Administrator' : 'User'} Access
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Settings userRole={userRole} />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Drafts View
  if (currentView === 'drafts') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="drafts" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Draft Notes Management</h1>
                  <Badge variant="outline" className="ml-2">
                    {getUserDraftCount()} Drafts Available
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    New Note
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Drafts
                  onEditDraft={handleEditDraft}
                  currentUser={currentUser}
                  onDraftsSummaryUpdate={handleDraftSummaryUpdate}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Schedule View
  if (currentView === 'schedule') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="schedule" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Patient Schedule</h1>
                  <Badge variant="outline" className="ml-2">
                    Today's Appointments
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('drafts')}>
                    Drafts
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('activity')}>
                    Activity Log
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Schedule
                  currentUser={currentUser}
                  onStartVisit={handleStartVisit}
                  onUploadChart={handleUploadChart}
                  uploadStatuses={chartUploadStatuses}
                  appointments={appointmentsState.data ?? []}
                  loading={appointmentsState.loading}
                  error={appointmentsState.error}
                  onRefresh={triggerScheduleRefresh}
                  onFiltersChange={handleScheduleFiltersChange}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Builder View
  if (currentView === 'builder') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="builder" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Schedule Builder</h1>
                  <Badge variant="outline" className="ml-2">
                    Template Creator
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('schedule')}>
                    Schedule
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('app')}>
                    Documentation
                  </Button>
                </div>
              </div>
              
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <Builder
                  currentUser={currentUser}
                  appointments={appointmentsState.data ?? []}
                  onAppointmentsChange={handleAppointmentsChange}
                />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Style Guide View
  if (currentView === 'style-guide') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="style-guide" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">RevenuePilot Design System</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Back to Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                    Figma Library
                  </Button>
                </div>
              </div>
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <StyleGuide />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Figma Library View
  if (currentView === 'figma-library') {
    return (
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <div className="flex h-screen w-full bg-background">
            <NavigationSidebar 
              currentView="figma-library" 
              onNavigate={handleNavigate}
              currentUser={currentUser}
              userDraftCount={getUserDraftCount()}
            />
            
            <main className="flex-1 flex flex-col min-w-0">
              <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <h1 className="text-lg font-medium">Figma Component Library</h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                    Back to Dashboard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                    Style Guide
                  </Button>
                </div>
              </div>
              {accessMessage}

              <div className="flex-1 overflow-auto">
                <FigmaComponentLibrary />
              </div>
            </main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    )
  }

  // Main App View (Documentation Editor)
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="flex h-screen w-full bg-background">
          <NavigationSidebar 
            currentView="app" 
            onNavigate={handleNavigate}
            currentUser={currentUser}
            userDraftCount={getUserDraftCount()}
          />
          
          <main className="flex-1 flex flex-col min-w-0">
            <div className="border-b bg-background p-4 flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <h1 className="text-lg font-medium">
                  {isFinalizationView ? "Finalization Wizard" : "Clinical Documentation Assistant"}
                </h1>
                <Badge variant="outline" className="ml-2">
                  {isFinalizationView ? "Finalization Mode" : "Active Session"}
                </Badge>
                {prePopulatedPatient && (
                  <Badge variant="secondary" className="ml-2">
                    Patient: {prePopulatedPatient.patientId}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isFinalizationView && (
                  <Button variant="outline" size="sm" onClick={() => handleFinalizationViewClose()}>
                    Exit Finalization
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleNavigate('home')}>
                  Dashboard
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('analytics')}>
                  Analytics
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('settings')}>
                  Settings
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('drafts')}>
                  Drafts
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('schedule')}>
                  Schedule
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('activity')}>
                  Activity Log
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('style-guide')}>
                  Style Guide
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleNavigate('figma-library')}>
                  Figma Library
                </Button>
                {sessionSyncing && (
                  <Badge variant="outline" className="text-xs">
                    Syncing…
                  </Badge>
                )}
              </div>
            </div>

            {accessMessage}

            {isFinalizationView && finalizationAdapterProps ? (
              <div className="flex-1 overflow-hidden p-6">
                <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                  <FinalizationWizardAdapter
                    isOpen
                    onClose={handleFinalizationViewClose}
                    {...finalizationAdapterProps}
                  />
                </div>
              </div>
            ) : (
              <>
                <ResizablePanelGroup
                  direction="horizontal"
                  className="flex-1"
                  onLayout={handleLayoutChange}
                >
                  <ResizablePanel defaultSize={layout.noteEditor} minSize={50}>
                    <div className="flex flex-col h-full">
                      <NoteEditor
                        prePopulatedPatient={prePopulatedPatient}
                        initialNoteData={activeDraft ?? undefined}
                        selectedCodes={selectedCodes}
                        selectedCodesList={selectedCodesList}
                        onNoteContentChange={setNoteEditorContent}
                        onNavigateToDrafts={() => handleNavigate('drafts')}
                        initialViewMode="draft"
                        viewMode={noteViewMode}
                        onViewModeChange={setNoteViewMode}
                        beautifiedNote={beautifiedNoteState}
                        onBeautifiedNoteChange={setBeautifiedNoteState}
                        ehrExportState={ehrExportStatus}
                        onEhrExportStateChange={setEhrExportStatus}
                        onOpenFinalization={handleOpenFinalization}
                      />
                      <SelectedCodesBar
                        selectedCodes={selectedCodes}
                        onUpdateCodes={() => undefined}
                        selectedCodesList={selectedCodesList}
                        onRemoveCode={handleRemoveCode}
                        onChangeCategoryCode={handleChangeCategoryCode}
                      />
                    </div>
                  </ResizablePanel>

                  {isSuggestionPanelOpen && (
                    <>
                      <ResizableHandle />
                      <ResizablePanel defaultSize={layout.suggestionPanel} minSize={25} maxSize={40}>
                        <SuggestionPanel
                          onClose={() => sessionActions.setSuggestionPanelOpen(false)}
                          selectedCodes={selectedCodes}
                          onUpdateCodes={() => undefined}
                          onAddCode={handleAddCode}
                          addedCodes={addedCodes}
                          noteContent={noteEditorContent}
                          selectedCodesList={selectedCodesList}
                        />
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>

                {!isSuggestionPanelOpen && (
                  <button
                    onClick={() => sessionActions.setSuggestionPanelOpen(true)}
                    className="fixed right-4 top-4 p-2 bg-primary text-primary-foreground rounded-md shadow-md"
                  >
                    Show Suggestions
                  </button>
                )}
              </>
            )}
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  )
}