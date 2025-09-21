import { useCallback, useEffect, useMemo, useState } from "react"

import { ThemeToggle } from "../../components/ThemeToggle"
import { useAuth } from "../../contexts/AuthContext"
import { ForgotPasswordForm } from "./components/ForgotPasswordForm"
import { LoginForm } from "./components/LoginForm"
import { createDesignLoginSystemApiClient } from "./apiClient"
import { DesignLoginSystemApi } from "./types"

type View = "login" | "forgot-password"

export interface DesignLoginSystemProps {
  api?: DesignLoginSystemApi
  initialView?: View
  multiTenant?: boolean
  enableOfflineMode?: boolean
  hasOfflineSession?: boolean
}

function detectOffline(): boolean {
  if (typeof navigator === "undefined") {
    return false
  }
  return !navigator.onLine
}

export function DesignLoginSystem({ api, initialView = "login", multiTenant = false, enableOfflineMode = true, hasOfflineSession = false }: DesignLoginSystemProps) {
  const { refresh } = useAuth()
  const [view, setView] = useState<View>(initialView)
  const [isOffline, setIsOffline] = useState(() => (enableOfflineMode ? detectOffline() : false))

  const authApi = useMemo(() => api ?? createDesignLoginSystemApiClient(), [api])

  useEffect(() => {
    if (!enableOfflineMode || typeof window === "undefined") {
      return
    }

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [enableOfflineMode])

  const handleLoginSuccess = useCallback(() => {
    void refresh()
  }, [refresh])

  const handleForgotPassword = useCallback(() => {
    setView("forgot-password")
  }, [])

  const handleBackToLogin = useCallback(() => {
    setView("login")
  }, [])

  return (
    <>
      {view === "forgot-password" ? (
        <ForgotPasswordForm authApi={authApi} onBackToLogin={handleBackToLogin} multiTenant={multiTenant} />
      ) : (
        <LoginForm
          authApi={authApi}
          mode={enableOfflineMode && isOffline ? "offline" : "default"}
          multiTenant={multiTenant}
          hasOfflineSession={hasOfflineSession}
          onSuccess={handleLoginSuccess}
          onForgotPassword={handleForgotPassword}
        />
      )}
      <ThemeToggle />
    </>
  )
}
