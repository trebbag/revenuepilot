import { useCallback, useEffect, useState } from "react"

import { useAuth } from "../contexts/AuthContext"
import { ForgotPasswordForm } from "./auth/ForgotPasswordForm"
import { LoginForm } from "./auth/LoginForm"
import { ThemeToggle } from "./ThemeToggle"

type View = "login" | "forgot-password"

export function LoginExperience() {
  const { refresh } = useAuth()
  const [view, setView] = useState<View>("login")
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  )

  useEffect(() => {
    if (typeof window === "undefined") {
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
  }, [])

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
        <ForgotPasswordForm onBackToLogin={handleBackToLogin} />
      ) : (
        <LoginForm
          mode={isOffline ? "offline" : "default"}
          hasOfflineSession={false}
          onSuccess={handleLoginSuccess}
          onForgotPassword={handleForgotPassword}
        />
      )}
      <ThemeToggle />
    </>
  )
}
