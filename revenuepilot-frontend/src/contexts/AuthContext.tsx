import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, clearStoredTokens, getStoredRefreshToken } from "../lib/api"

export type AuthStatus = "authenticated" | "unauthenticated"

export interface AuthUser {
  id: string
  name: string
  email?: string
  role?: string
  permissions?: string[]
  fullName?: string
  specialty?: string
  [key: string]: unknown
}

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  checking: boolean
  lastCheckedAt: number | null
}

interface RefreshOptions {
  silent?: boolean
}

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  checking: boolean
  lastCheckedAt: number | null
  refresh: (options?: RefreshOptions) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const AUTH_REFRESH_INTERVAL = 5 * 60 * 1000

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error("Failed to parse auth response", error)
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "unauthenticated",
    user: null,
    checking: true,
    lastCheckedAt: null,
  })
  const refreshController = useRef<AbortController | null>(null)

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const { silent = false } = options
    refreshController.current?.abort()
    const controller = new AbortController()
    refreshController.current = controller

    if (!silent) {
      setState((prev) => ({ ...prev, checking: true }))
    }

    try {
      const response = await apiFetch("/api/auth/status", {
        method: "GET",
        signal: controller.signal,
        // Skip automatic JSON content-type since this is a simple GET
        json: false,
      })

      if (response.status === 401 || response.status === 419) {
        clearStoredTokens()
        setState({
          status: "unauthenticated",
          user: null,
          checking: false,
          lastCheckedAt: Date.now(),
        })
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch auth status: ${response.status}`)
      }

      const data = await parseJsonResponse<{ authenticated?: boolean; user?: AuthUser }>(response)

      if (data?.authenticated) {
        setState({
          status: "authenticated",
          user: data.user ?? null,
          checking: false,
          lastCheckedAt: Date.now(),
        })
      } else {
        setState({
          status: "unauthenticated",
          user: null,
          checking: false,
          lastCheckedAt: Date.now(),
        })
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return
      }
      console.error("Unable to refresh auth status", error)
      setState({
        status: "unauthenticated",
        user: null,
        checking: false,
        lastCheckedAt: Date.now(),
      })
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const refreshToken = getStoredRefreshToken()
      const options = refreshToken ? { method: "POST", jsonBody: { token: refreshToken }, skipAuth: true } : { method: "POST", json: false, skipAuth: true as const }

      await apiFetch("/api/auth/logout", options)
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        console.error("Failed to call logout endpoint", error)
      }
    } finally {
      refreshController.current?.abort()
      clearStoredTokens()
      setState({
        status: "unauthenticated",
        user: null,
        checking: false,
        lastCheckedAt: Date.now(),
      })
    }
  }, [])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!permission) return true
      if (state.user?.role === "admin") return true
      const permissions = Array.isArray(state.user?.permissions) ? state.user?.permissions : []
      return permissions.includes(permission)
    },
    [state.user],
  )

  useEffect(() => {
    refresh()
    return () => {
      refreshController.current?.abort()
    }
  }, [refresh])

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh({ silent: true })
    }, AUTH_REFRESH_INTERVAL)
    return () => window.clearInterval(interval)
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      checking: state.checking,
      lastCheckedAt: state.lastCheckedAt,
      refresh,
      logout,
      hasPermission,
    }),
    [state, refresh, logout, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
