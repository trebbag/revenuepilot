import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Stethoscope,
  ChevronRight
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar
} from "./ui/sidebar"
import { Badge } from "./ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { Separator } from "./ui/separator"
import { Avatar, AvatarFallback } from "./ui/avatar"
import { getPrimaryNavItems, secondaryNavItems, bottomNavItems } from "./navigation/NavigationConfig"
import { NotificationsPanel } from "./navigation/NotificationsPanel"
import { Notification } from "./navigation/NotificationUtils"
import { apiFetch, apiFetchJson, resolveWebsocketUrl } from "../lib/api"
import { isViewKey, mapServerViewToViewKey, mapViewKeyToServerView } from "../lib/navigation"
import type { ViewKey } from "../lib/navigation"

interface UIPreferences {
  sidebarCollapsed?: boolean
  [key: string]: unknown
}

interface CurrentViewResponse {
  currentView: string | null
}

interface UserProfileResponse {
  currentView: string | null
  clinic?: string | null
  preferences: Record<string, unknown>
  uiPreferences: UIPreferences
}

interface UiPreferencesResponse {
  uiPreferences: UIPreferences
}

interface NotificationListResponse {
  items?: Array<{
    id?: string | number
    eventId?: string | number
    title?: string
    message?: string
    severity?: string
    timestamp?: string
    createdAt?: string
    created_at?: string
    isRead?: boolean
    is_read?: boolean
    readAt?: string | null
    read_at?: string | null
  }>
  total?: number
  limit?: number
  offset?: number
  nextOffset?: number | null
  unreadCount?: number
}

interface NotificationUpdateResponse {
  unreadCount?: number
}

const NOTIFICATION_ERROR_ID = "notifications-error"
const NOTIFICATION_PAGE_SIZE = 20

interface CurrentUser {
  id: string
  name: string
  fullName: string
  role: 'admin' | 'user'
  specialty: string
}

interface NavigationSidebarProps {
  currentView?: ViewKey
  onNavigate?: (view: string) => void
  currentUser?: CurrentUser
  userDraftCount?: number
}

interface NavItemProps {
  item: ReturnType<typeof getPrimaryNavItems>[0]
  isCollapsed: boolean
  onClick?: () => void
  isCurrentView?: boolean
  isNotifications?: boolean
  buttonRef?: React.RefObject<HTMLDivElement>
}

function NavItem({ item, isCollapsed, onClick, isCurrentView, isNotifications = false, buttonRef }: NavItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isActive = isCurrentView

  const content = (
    <motion.div
      ref={isNotifications ? buttonRef : undefined}
      className={`relative flex items-center ${isCollapsed ? 'w-12 h-12 p-2 justify-center mx-auto' : 'w-full p-3'} rounded-xl transition-all duration-200 cursor-pointer group ${ 
        isActive
          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' 
          : 'hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground'
      }`}
      whileHover={{ scale: isCollapsed ? 1.05 : 1.02 }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      layout
    >
      <motion.div
        className="relative flex items-center justify-center"
      >
        <item.icon 
          className={`w-5 h-5 transition-all duration-200 ${ 
            isActive ? 'text-sidebar-primary-foreground' : isHovered ? item.accentColor : 'text-sidebar-foreground'
          }`} 
        />
      </motion.div>

      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            className="flex items-center justify-between flex-1 ml-3 overflow-hidden"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex flex-col">
              <motion.span 
                className={`font-medium text-sm leading-tight transition-colors duration-200 ${
                  isActive ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground'
                }`}
                layout="position"
              >
                {item.title}
              </motion.span>
              {isHovered && (
                <motion.span 
                  className={`text-xs mt-0.5 leading-tight transition-colors duration-200 ${
                    isActive ? 'text-sidebar-primary-foreground/80' : 'text-sidebar-foreground/70'
                  }`}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.15 }}
                >
                  {item.description}
                </motion.span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {item.badge && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Badge 
                    variant={isActive ? "secondary" : "outline"}
                    className={`text-xs px-2 py-0.5 font-medium transition-colors duration-200 ${
                      isActive 
                        ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground border-sidebar-primary-foreground/30' 
                        : 'border-border/50'
                    }`}
                  >
                    {item.badge}
                  </Badge>
                </motion.div>
              )}
              
              <motion.div
                animate={{ x: isHovered ? 3 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <ChevronRight className={`w-4 h-4 transition-colors duration-200 ${
                  isActive ? 'text-sidebar-primary-foreground/70' : 'text-sidebar-foreground/50'
                }`} />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isCollapsed && item.badge && (
        <motion.div
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full flex items-center justify-center border border-sidebar shadow-sm"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <span className="text-[10px] font-medium px-1">
            {item.badge}
          </span>
        </motion.div>
      )}
    </motion.div>
  )

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex flex-col bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary/20">
            <span className="font-medium">{item.title}</span>
            <span className="text-xs opacity-80">{item.description}</span>
            {item.badge && (
              <span className="text-xs mt-1 opacity-90">
                {item.badge} items
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}

interface NavSectionProps {
  title?: string
  items: ReturnType<typeof getPrimaryNavItems>
  isCollapsed: boolean
  currentView?: ViewKey
  onNavigate?: (view: string) => void
  onNotificationClick?: () => void
  notificationButtonRef?: React.RefObject<HTMLDivElement>
}

function NavSection({ title, items, isCollapsed, currentView, onNavigate, onNotificationClick, notificationButtonRef }: NavSectionProps) {
  return (
    <motion.div
      className="space-y-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {title && !isCollapsed && (
        <motion.div
          className="px-3 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h4 className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wide">
            {title}
          </h4>
        </motion.div>
      )}
      
      <div className="space-y-1">
        {items.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 0.2, 
              delay: index * 0.03,
              ease: "easeOut"
            }}
          >
            <NavItem 
              item={item} 
              isCollapsed={isCollapsed}
              isCurrentView={currentView === item.key}
              isNotifications={item.key === 'notifications'}
              buttonRef={item.key === 'notifications' ? notificationButtonRef : undefined}
              onClick={() => {
                if (item.key === 'notifications') {
                  onNotificationClick?.()
                } else {
                  onNavigate?.(item.key)
                }
              }}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function NavigationSidebarContent({ currentView, onNavigate, currentUser, userDraftCount = 0 }: NavigationSidebarProps) {
  const { state, setOpen } = useSidebar()
  const isCollapsed = state === "collapsed"

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationCount, setNotificationCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationButtonRef = useRef<HTMLDivElement>(null)

  const [profile, setProfile] = useState<UserProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [serverCurrentView, setServerCurrentView] = useState<ViewKey | null>(null)

  const [uiPreferences, setUiPreferences] = useState<UIPreferences>({})
  const [uiPreferencesError, setUiPreferencesError] = useState<string | null>(null)

  const uiPreferencesRef = useRef<UIPreferences>({})
  const lastPersistedPrefsRef = useRef<UIPreferences>({})
  const isApplyingInitialPreferencesRef = useRef(true)
  const hasLoadedUiPreferencesRef = useRef(false)
  const lastPersistedViewRef = useRef<string | null>(null)

  const normalizedCurrentView = useMemo(() => {
    if (!currentView) {
      return undefined
    }
    return isViewKey(currentView) ? currentView : mapServerViewToViewKey(currentView)
  }, [currentView])

  useEffect(() => {
    uiPreferencesRef.current = uiPreferences
  }, [uiPreferences])

  const applyNotificationsResponse = useCallback((response: NotificationListResponse | null | undefined) => {
    const items = Array.isArray(response?.items) ? response?.items ?? [] : []
    const mapped: Notification[] = items.map(item => {
      const timestamp =
        typeof item.timestamp === 'string'
          ? item.timestamp
          : typeof item.createdAt === 'string'
            ? item.createdAt
            : typeof item.created_at === 'string'
              ? item.created_at
              : new Date().toISOString()
      const severity = typeof item.severity === 'string' ? item.severity : 'info'
      const title =
        typeof item.title === 'string' && item.title.trim().length > 0 ? item.title : 'Notification'
      const message =
        typeof item.message === 'string' && item.message.trim().length > 0
          ? item.message
          : 'You have a new notification.'
      const readAt =
        typeof item.readAt === 'string'
          ? item.readAt
          : typeof item.read_at === 'string'
            ? item.read_at
            : null
      const readFlag =
        typeof item.isRead === 'boolean'
          ? item.isRead
          : typeof item.is_read === 'boolean'
            ? item.is_read
            : undefined
      const idSource = item.id ?? item.eventId ?? Math.random().toString(36).slice(2)
      return {
        id: String(idSource),
        title,
        message,
        severity,
        timestamp,
        isRead: typeof readFlag === 'boolean' ? readFlag : Boolean(readAt),
        readAt
      }
    })

    setNotifications(mapped)
    const unread =
      typeof response?.unreadCount === 'number'
        ? response.unreadCount
        : mapped.reduce((acc, item) => (item.isRead ? acc : acc + 1), 0)
    setNotificationCount(unread)
    setNotificationsError(null)
  }, [])

  useEffect(() => {
    let active = true

    const loadSidebarData = async () => {
      try {
        setNotificationsLoading(true)
        setProfileLoading(true)

        const [viewResult, notificationsResult, profileResult, prefsResult] = await Promise.allSettled([
          apiFetchJson<CurrentViewResponse>("/api/user/current-view"),
          apiFetchJson<NotificationListResponse>(`/api/notifications?limit=${NOTIFICATION_PAGE_SIZE}&offset=0`),
          apiFetchJson<UserProfileResponse>("/api/user/profile"),
          apiFetchJson<UiPreferencesResponse>("/api/user/ui-preferences")
        ])

        if (!active) {
          return
        }

        let profileMessage: string | null = null

        if (viewResult.status === "fulfilled") {
          const fetchedView = viewResult.value?.currentView
          if (fetchedView) {
            const mappedView = mapServerViewToViewKey(fetchedView)
            setServerCurrentView(mappedView)
            lastPersistedViewRef.current = mapViewKeyToServerView(mappedView)
          } else {
            setServerCurrentView(null)
            lastPersistedViewRef.current = null
          }
        } else if (viewResult.status === "rejected") {
          profileMessage = "Unable to load current view."
          console.error(viewResult.reason)
        }

        if (profileResult.status === "fulfilled") {
          const profileData = profileResult.value ?? null
          setProfile(profileData)
          if (profileData?.currentView) {
            const mappedView = mapServerViewToViewKey(profileData.currentView)
            setServerCurrentView(mappedView)
            lastPersistedViewRef.current = mapViewKeyToServerView(mappedView)
          }
        } else if (profileResult.status === "rejected") {
          profileMessage = profileMessage ?? "Unable to load user profile."
          console.error(profileResult.reason)
        }

        if (prefsResult.status === "fulfilled") {
          const prefs = prefsResult.value?.uiPreferences ?? {}
          setUiPreferences(prefs)
          uiPreferencesRef.current = prefs
          lastPersistedPrefsRef.current = prefs
        } else if (prefsResult.status === "rejected") {
          profileMessage = profileMessage ?? "Unable to load UI preferences."
          console.error(prefsResult.reason)
        }

        setProfileError(profileMessage)

        if (notificationsResult.status === "fulfilled") {
          applyNotificationsResponse(notificationsResult.value ?? undefined)
        } else {
          setNotificationsError("Unable to load notifications.")
          if (notificationsResult.status === "rejected") {
            console.error(notificationsResult.reason)
          }
        }
      } catch (error) {
        if (!active) {
          return
        }
        const message = error instanceof Error ? error.message : "Failed to load sidebar data."
        setProfileError(message)
        setNotificationsError(prev => prev ?? message)
      } finally {
        if (active) {
          setProfileLoading(false)
          setNotificationsLoading(false)
          hasLoadedUiPreferencesRef.current = true
        }
      }
    }

    loadSidebarData()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedUiPreferencesRef.current || !isApplyingInitialPreferencesRef.current) {
      return
    }

    const collapsedPreference = uiPreferences.sidebarCollapsed
    if (typeof collapsedPreference === "boolean") {
      setOpen(!collapsedPreference)
    }

    isApplyingInitialPreferencesRef.current = false
  }, [uiPreferences, setOpen])

  const persistUiPreferences = useCallback(async (prefs: UIPreferences) => {
    try {
      setUiPreferencesError(null)
      const response = await apiFetchJson<UiPreferencesResponse>("/api/user/ui-preferences", {
        method: "PUT",
        jsonBody: { uiPreferences: prefs }
      })
      lastPersistedPrefsRef.current = response?.uiPreferences ?? prefs
      setProfile(prev => {
        if (!prev) {
          return prev
        }
        return {
          ...prev,
          uiPreferences: response?.uiPreferences ?? prefs
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save UI preferences."
      setUiPreferencesError(message)
    }
  }, [])

  const persistCurrentView = useCallback(
    async (view: ViewKey) => {
      if (profileLoading) {
        return
      }

      const serverView = mapViewKeyToServerView(view)
      if (lastPersistedViewRef.current === serverView) {
        return
      }

      const payload = {
        currentView: serverView,
        clinic: profile?.clinic ?? null,
        preferences: profile?.preferences ?? {},
        uiPreferences: {
          ...(profile?.uiPreferences ?? {}),
          ...uiPreferencesRef.current
        }
      }

      try {
        setProfileError(prev => (prev && prev.startsWith("Unable to save current view") ? null : prev))
        const response = await apiFetch("/api/user/profile", {
          method: "PUT",
          jsonBody: payload
        })
        if (!response.ok) {
          throw new Error(`Failed to persist current view: ${response.status}`)
        }
        lastPersistedViewRef.current = serverView
        setProfile(prev => {
          if (!prev) {
            return {
              currentView: payload.currentView,
              clinic: payload.clinic,
              preferences: payload.preferences,
              uiPreferences: payload.uiPreferences
            } as UserProfileResponse
          }
          return {
            ...prev,
            currentView: payload.currentView,
            clinic: payload.clinic,
            preferences: payload.preferences,
            uiPreferences: payload.uiPreferences
          }
        })
        setProfileError(prev => (prev && prev.startsWith("Unable to save current view") ? null : prev))
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return
        }
        console.error("Failed to persist current view", error)
        setProfileError(prev => prev ?? "Unable to save current view.")
      }
    },
    [profile, profileLoading]
  )

  useEffect(() => {
    if (!hasLoadedUiPreferencesRef.current || isApplyingInitialPreferencesRef.current) {
      return
    }

    const collapsed = state === "collapsed"
    const currentPrefs = uiPreferencesRef.current
    if (currentPrefs.sidebarCollapsed === collapsed) {
      return
    }

    const nextPrefs: UIPreferences = { ...currentPrefs, sidebarCollapsed: collapsed }
    uiPreferencesRef.current = nextPrefs
    setUiPreferences(nextPrefs)

    const lastPersisted = lastPersistedPrefsRef.current
    const hasChanged = JSON.stringify(lastPersisted) !== JSON.stringify(nextPrefs)
    if (hasChanged) {
      persistUiPreferences(nextPrefs)
    }
  }, [state, persistUiPreferences])

  useEffect(() => {
    setNotifications(prev => {
      if (!notificationsError) {
        return prev.filter(notification => notification.id !== NOTIFICATION_ERROR_ID)
      }

      const errorNotification: Notification = {
        id: NOTIFICATION_ERROR_ID,
        title: "Notifications unavailable",
        message: notificationsError,
        severity: "error",
        timestamp: new Date().toISOString(),
        isRead: false
      }

      const others = prev.filter(notification => notification.id !== NOTIFICATION_ERROR_ID)
      return [errorNotification, ...others]
    })
  }, [notificationsError])

  useEffect(() => {
    if (!normalizedCurrentView || profileLoading) {
      return
    }
    setServerCurrentView(normalizedCurrentView)
    persistCurrentView(normalizedCurrentView)
  }, [normalizedCurrentView, persistCurrentView, profileLoading])

  const normaliseNotificationPayload = useCallback((payload: Record<string, any>): Notification => {
    const severityCandidate =
      typeof payload.severity === 'string'
        ? payload.severity
        : typeof payload.level === 'string'
          ? payload.level
          : typeof payload.type === 'string'
            ? payload.type
            : 'info'

    const timestamp =
      typeof payload.timestamp === 'string'
        ? payload.timestamp
        : typeof payload.createdAt === 'string'
          ? payload.createdAt
          : typeof payload.created_at === 'string'
            ? payload.created_at
            : new Date().toISOString()
    const titleCandidate = typeof payload.title === 'string' ? payload.title : undefined

    const descriptionCandidate =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.description === 'string'
          ? payload.description
          : typeof payload.detail === 'string'
            ? payload.detail
            : undefined

    const message =
      typeof descriptionCandidate === 'string' && descriptionCandidate.trim().length > 0
        ? descriptionCandidate
        : 'You have a new notification.'

    const idSource =
      payload.eventId ??
      payload.id ??
      payload.notificationId ??
      Math.random().toString(36).slice(2)

    const readAt =
      typeof payload.readAt === 'string'
        ? payload.readAt
        : typeof payload.read_at === 'string'
          ? payload.read_at
          : undefined

    const readFlag =
      typeof payload.isRead === 'boolean'
        ? payload.isRead
        : typeof payload.is_read === 'boolean'
          ? payload.is_read
          : undefined

    return {
      id: String(idSource),
      title: typeof titleCandidate === 'string' && titleCandidate.trim().length > 0 ? titleCandidate : 'Notification',
      message,
      severity: typeof severityCandidate === 'string' ? severityCandidate : 'info',
      timestamp,
      isRead: typeof readFlag === 'boolean' ? readFlag : Boolean(readAt),
      readAt
    }
  }, [])

  const refreshNotifications = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) {
        setNotificationsLoading(true)
      }
      try {
        const response = await apiFetchJson<NotificationListResponse>(
          `/api/notifications?limit=${NOTIFICATION_PAGE_SIZE}&offset=0`
        )
        applyNotificationsResponse(response ?? undefined)
        return response ?? undefined
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load notifications.'
        setNotificationsError(prev => prev ?? message)
        throw error
      } finally {
        setNotificationsLoading(false)
      }
    },
    [applyNotificationsResponse]
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let pollTimer: number | null = null
    let closed = false

    const fetchCount = async () => {
      try {
        const response = await refreshNotifications({ silent: true })
        if (closed) {
          return
        }
        if (response && typeof response.unreadCount === 'number') {
          setNotificationCount(response.unreadCount)
        }
        setNotificationsError(null)
      } catch (error) {
        if (closed) {
          return
        }
        const message = error instanceof Error ? error.message : 'Unable to refresh notifications.'
        setNotificationsError(prev => prev ?? message)
      }
    }

    const startPolling = () => {
      if (pollTimer !== null) {
        return
      }
      fetchCount()
      pollTimer = window.setInterval(fetchCount, 30000)
    }

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data)
        if (typeof parsed.unreadCount === 'number') {
          setNotificationCount(parsed.unreadCount)
        } else if (typeof parsed.count === 'number') {
          setNotificationCount(parsed.count)
        }

        if (parsed.event === 'notification' || parsed.channel === 'notifications') {
          const notification = normaliseNotificationPayload(parsed)
          setNotifications(prev => {
            const withoutError = prev.filter(item => item.id !== NOTIFICATION_ERROR_ID)
            const existingIndex = withoutError.findIndex(item => item.id === notification.id)
            let updated: Notification[]
            if (existingIndex !== -1) {
              updated = [...withoutError]
              updated[existingIndex] = notification
            } else {
              updated = [notification, ...withoutError]
            }
            if (updated.length > NOTIFICATION_PAGE_SIZE) {
              updated = updated.slice(0, NOTIFICATION_PAGE_SIZE)
            }
            return updated
          })
        }

        setNotificationsError(null)
        setNotificationsLoading(false)
      } catch (error) {
        console.error("Failed to parse notification payload", error)
      }
    }

    const connect = () => {
      if (!("WebSocket" in window)) {
        startPolling()
        return
      }

      try {
        const url = resolveWebsocketUrl('/ws/notifications')
        ws = new WebSocket(url)
      } catch (error) {
        setNotificationsError(prev => prev ?? "Unable to connect to notifications channel.")
        startPolling()
        return
      }

      if (!ws) {
        startPolling()
        return
      }

      ws.onopen = () => {
        setNotificationsLoading(false)
        setNotificationsError(null)
        stopPolling()
      }

      ws.onmessage = handleMessage

      ws.onerror = () => {
        setNotificationsError(prev => prev ?? "Notifications connection error.")
      }

      ws.onclose = () => {
        if (closed) {
          return
        }
        setNotificationsLoading(false)
        setNotificationsError(prev => prev ?? "Notifications connection lost. Retrying…")
        startPolling()
        reconnectTimer = window.setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer)
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [normaliseNotificationPayload, refreshNotifications])

  const resolvedCurrentUser = useMemo<CurrentUser | undefined>(() => {
    if (currentUser) {
      return currentUser
    }
    if (!profile) {
      return undefined
    }

    const prefs = (profile.preferences ?? {}) as Record<string, unknown>
    const readString = (key: string) => {
      const value = prefs[key]
      return typeof value === "string" ? value : undefined
    }

    const name = readString("name") ?? readString("displayName")
    if (!name) {
      return undefined
    }

    const fullName = readString("fullName") ?? name
    const id = readString("id") ?? "current-user"
    const roleCandidate = readString("role")
    const role: 'admin' | 'user' = roleCandidate === 'admin' || roleCandidate === 'user' ? roleCandidate : 'user'
    const specialty = readString("specialty") ?? ""

    return {
      id,
      name,
      fullName,
      role,
      specialty
    }
  }, [currentUser, profile])

  const resolvedCurrentView = normalizedCurrentView ?? serverCurrentView ?? undefined

  const primaryNavItems = useMemo(() => getPrimaryNavItems(userDraftCount), [userDraftCount])

  const bottomNavItemsWithCount = useMemo(() => {
    const unreadFromList = notifications.reduce((acc, notification) => {
      if (notification.id === NOTIFICATION_ERROR_ID) {
        return acc
      }
      return !notification.isRead ? acc + 1 : acc
    }, 0)

    const resolvedCount = Math.max(notificationCount, unreadFromList)
    const badge = notificationsLoading ? "…" : notificationsError ? "!" : resolvedCount > 0 ? resolvedCount.toString() : null

    return bottomNavItems.map(item => {
      if (item.key !== 'notifications') {
        return item
      }

      const description = notificationsError ?? (notificationsLoading ? 'Loading notifications...' : item.description)

      return {
        ...item,
        badge,
        description
      }
    })
  }, [notifications, notificationCount, notificationsLoading, notificationsError])

  const handleNavigateInternal = useCallback(
    (view: string) => {
      if (isViewKey(view)) {
        setServerCurrentView(view)
        persistCurrentView(view)
      }
      onNavigate?.(view)
    },
    [onNavigate, persistCurrentView]
  )

  const handleNotificationClick = useCallback(() => {
    setShowNotifications(prev => !prev)
  }, [])

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      if (!id || id === NOTIFICATION_ERROR_ID) {
        return
      }
      try {
        const response = await apiFetchJson<NotificationUpdateResponse>(
          `/api/notifications/${encodeURIComponent(id)}/read`,
          {
            method: 'POST'
          }
        )
        await refreshNotifications({ silent: true }).catch(() => undefined)
        if (response && typeof response.unreadCount === 'number') {
          setNotificationCount(response.unreadCount)
        }
        setNotificationsError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update notification.'
        setNotificationsError(prev => prev ?? message)
      }
    },
    [refreshNotifications]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      const response = await apiFetchJson<NotificationUpdateResponse>(
        '/api/notifications/read-all',
        { method: 'POST' }
      )
      await refreshNotifications({ silent: true }).catch(() => undefined)
      if (response && typeof response.unreadCount === 'number') {
        setNotificationCount(response.unreadCount)
      } else {
        setNotificationCount(0)
      }
      setNotificationsError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to mark notifications as read.'
      setNotificationsError(prev => prev ?? message)
    }
  }, [refreshNotifications])

  const handleCloseNotifications = useCallback(() => {
    setShowNotifications(false)
  }, [])

  return (
    <>
      <SidebarContent className={`${isCollapsed ? 'p-3' : 'p-5'} space-y-6 bg-sidebar border-sidebar-border/50`}>
        {/* Clean Header */}
        <motion.div
          className={`flex items-center gap-3 ${isCollapsed ? 'px-0 justify-center' : 'px-2'}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: "spring" }}
        >
          <div className="w-9 h-9 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-sm">
            <Stethoscope className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>

          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="font-semibold text-sidebar-foreground">RevenuePilot</h2>
                <p className={`text-xs ${profileError ? 'text-red-500' : 'text-sidebar-foreground/60'}`}>
                  {profileError
                    ? profileError
                    : profileLoading
                      ? 'Loading your workspace...'
                      : resolvedCurrentUser
                        ? `Welcome, ${resolvedCurrentUser.name}`
                        : 'Clinical AI Assistant'}
                </p>
                {uiPreferencesError && (
                  <p className="text-[11px] text-red-500/90 mt-1">
                    {uiPreferencesError}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Primary Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0">
              <NavSection
                items={primaryNavItems}
                isCollapsed={isCollapsed}
                currentView={resolvedCurrentView}
                onNavigate={handleNavigateInternal}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Clean Separator */}
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Separator className="bg-sidebar-border/60" />
          </motion.div>
        )}

        {/* Secondary Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0">
              <NavSection
                title="Tools & Resources"
                items={secondaryNavItems}
                isCollapsed={isCollapsed}
                currentView={resolvedCurrentView}
                onNavigate={handleNavigateInternal}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Navigation */}
        <motion.div
          className={`mt-auto pt-4 ${!isCollapsed ? 'border-t border-sidebar-border/60' : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0">
                <NavSection
                  items={bottomNavItemsWithCount}
                  isCollapsed={isCollapsed}
                  currentView={resolvedCurrentView}
                  onNavigate={handleNavigateInternal}
                  onNotificationClick={handleNotificationClick}
                  notificationButtonRef={notificationButtonRef}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </motion.div>
      </SidebarContent>

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={showNotifications}
        onClose={handleCloseNotifications}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        buttonRef={notificationButtonRef}
      />
    </>
  )
}

export function NavigationSidebar({ currentView, onNavigate, currentUser, userDraftCount }: NavigationSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
      <NavigationSidebarContent 
        currentView={currentView} 
        onNavigate={onNavigate}
        currentUser={currentUser}
        userDraftCount={userDraftCount}
      />
    </Sidebar>
  )
}