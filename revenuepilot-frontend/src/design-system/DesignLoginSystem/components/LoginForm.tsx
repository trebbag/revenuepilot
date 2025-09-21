import { useCallback, useMemo, useState } from "react"
import { Shield, WifiOff } from "lucide-react"

import { persistAuthTokens } from "../../../lib/api"
import { DesignLoginSystemApi, DesignLoginSystemError, LoginSuccessResult } from "../types"
import { Alert } from "./Alert"
import { Badge } from "./Badge"
import { Button } from "./Button"
import { Card, CardContent, CardFooter, CardHeader } from "./Card"
import { Checkbox } from "./Checkbox"
import { FooterLinks } from "./FooterLinks"
import { MFADialog } from "./MFADialog"
import { TextField } from "./TextField"
import { Toast } from "./Toast"
import { Toggle } from "./Toggle"

type LoginState = "default" | "loading" | "error" | "mfa" | "success"
type ErrorType = "invalid_credentials" | "account_locked" | "server_error" | "mfa_error" | null
type MFADialogState = "codeEntry" | "verifying" | "error"

type ToastType = "success" | "error" | "info"

interface LoginFormProps {
  authApi: Pick<DesignLoginSystemApi, "login" | "verifyMfa" | "resendMfa">
  mode?: "default" | "offline" | "maintenance"
  multiTenant?: boolean
  hasOfflineSession?: boolean
  onSuccess?: () => void
  onForgotPassword?: () => void
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function LoginForm({ authApi, mode = "default", multiTenant = false, hasOfflineSession = false, onSuccess, onForgotPassword }: LoginFormProps) {
  const [loginState, setLoginState] = useState<LoginState>("default")
  const [errorType, setErrorType] = useState<ErrorType>(null)
  const [mfaState, setMfaState] = useState<MFADialogState>("codeEntry")
  const [mfaSessionToken, setMfaSessionToken] = useState<string | null>(null)

  const [clinicCode, setClinicCode] = useState("")
  const [emailOrUsername, setEmailOrUsername] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [workOffline, setWorkOffline] = useState(false)

  const [toast, setToast] = useState<{ type: ToastType; message: string; visible: boolean }>({
    type: "info",
    message: "",
    visible: false,
  })

  const isOfflineMode = mode === "offline"
  const isMaintenanceMode = mode === "maintenance"

  const canSignIn = useMemo(() => !isMaintenanceMode && (!isOfflineMode || hasOfflineSession), [isMaintenanceMode, isOfflineMode, hasOfflineSession])

  const validateForm = useCallback(() => {
    if (multiTenant && !normalizeString(clinicCode)) return false
    if (!normalizeString(emailOrUsername)) return false
    if (!normalizeString(password)) return false
    return true
  }, [multiTenant, clinicCode, emailOrUsername, password])

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message, visible: true })
  }, [])

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleAuthenticationSuccess = useCallback(
    (result: LoginSuccessResult) => {
      setMfaSessionToken(null)
      persistAuthTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? undefined,
        remember: rememberMe,
      })
      showToast("success", "Welcome back!")
      setLoginState("success")
      setTimeout(() => onSuccess?.(), 50)
    },
    [onSuccess, rememberMe, showToast],
  )

  const mapErrorToState = useCallback((error: unknown, fallback: ErrorType = "server_error"): ErrorType => {
    if (error instanceof DesignLoginSystemError) {
      if (error.code === "invalid_credentials" || error.code === "account_locked" || error.code === "mfa_error") {
        return error.code
      }
      return fallback
    }
    return fallback
  }, [])

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()

      if (!validateForm() || !canSignIn) {
        return
      }

      setLoginState("loading")
      setErrorType(null)
      setMfaSessionToken(null)

      try {
        const result = await authApi.login({
          username: normalizeString(emailOrUsername),
          password,
          rememberMe,
          clinicCode: multiTenant ? normalizeString(clinicCode) : undefined,
        })

        if (result.type === "mfa") {
          setMfaSessionToken(result.mfaSessionToken)
          setLoginState("mfa")
          setMfaState("codeEntry")
          return
        }

        handleAuthenticationSuccess(result)
      } catch (error) {
        console.error("Login request failed", error)
        setErrorType(mapErrorToState(error))
        setLoginState("error")
      }
    },
    [authApi, emailOrUsername, password, rememberMe, multiTenant, clinicCode, validateForm, canSignIn, handleAuthenticationSuccess, mapErrorToState],
  )

  const handleMFAVerify = useCallback(
    async (code: string) => {
      if (!mfaSessionToken) {
        setErrorType("mfa_error")
        setMfaState("error")
        return
      }

      setMfaState("verifying")

      try {
        const result = await authApi.verifyMfa({
          code,
          mfaSessionToken,
          rememberMe,
        })
        handleAuthenticationSuccess(result)
      } catch (error) {
        console.error("MFA verification failed", error)
        setErrorType(mapErrorToState(error, "mfa_error"))
        setMfaState("error")
      }
    },
    [authApi, handleAuthenticationSuccess, mapErrorToState, mfaSessionToken, rememberMe],
  )

  const handleMFACancel = useCallback(() => {
    setLoginState("default")
    setMfaState("codeEntry")
    setErrorType(null)
  }, [])

  const handleMFAResend = useCallback(async () => {
    if (!mfaSessionToken) {
      showToast("error", "Unable to resend code right now")
      return
    }

    if (!authApi.resendMfa) {
      showToast("error", "Resend not available")
      return
    }

    try {
      await authApi.resendMfa({ mfaSessionToken })
      showToast("info", "Verification code sent")
      setMfaState("codeEntry")
      setErrorType(null)
    } catch (error) {
      console.error("Failed to resend MFA code", error)
      showToast("error", "Failed to send code")
    }
  }, [authApi, mfaSessionToken, showToast])

  const handleOfflineWork = useCallback(() => {
    showToast("info", "Working offline with limited features")
    setTimeout(() => onSuccess?.(), 1000)
  }, [onSuccess, showToast])

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {isOfflineMode && (
            <div className="mb-4 flex justify-center">
              <Badge tone="warning" className="gap-2">
                <WifiOff className="w-4 h-4" />
                You're offline
              </Badge>
            </div>
          )}

          {isMaintenanceMode && (
            <div className="mb-4">
              <Alert tone="warning">System maintenance in progress. Sign in may be temporarily unavailable.</Alert>
            </div>
          )}

          <Card size="lg">
            <CardHeader
              logo={
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
              }
              title="Sign in"
              subtitle="Access your workspace"
            />

            <CardContent>
              {loginState === "error" && errorType && (
                <Alert tone="error" className="mb-4">
                  {(() => {
                    switch (errorType) {
                      case "invalid_credentials":
                        return "That email/username or password didn't match."
                      case "account_locked":
                        return "Too many attempts. Try again in 15 minutes."
                      case "server_error":
                        return "Service unavailable. Please try again."
                      case "mfa_error":
                        return "That code wasn't recognized. Try again."
                      default:
                        return ""
                    }
                  })()}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {multiTenant && (
                  <TextField
                    type="text"
                    label="Clinic Code"
                    placeholder="Enter your clinic code"
                    value={clinicCode}
                    onChange={setClinicCode}
                    required
                    disabled={loginState === "loading"}
                    id="clinic-code"
                  />
                )}

                <TextField
                  type="email"
                  label="Email or Username"
                  placeholder="Enter your email or username"
                  value={emailOrUsername}
                  onChange={setEmailOrUsername}
                  iconLeft="user"
                  required
                  disabled={loginState === "loading"}
                  id="email-username"
                />

                <TextField
                  type="password"
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={setPassword}
                  iconLeft="lock"
                  required
                  disabled={loginState === "loading"}
                  id="password"
                />

                <Checkbox checked={rememberMe} onChange={setRememberMe} label="Remember me on this device" disabled={loginState === "loading"} id="remember-me" />

                {isOfflineMode && hasOfflineSession && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Toggle checked={workOffline} onChange={setWorkOffline} label="Work offline (limited features)" disabled={loginState === "loading"} id="work-offline" />
                    <p className="text-xs text-muted-foreground mt-2">Access cached data and continue working without internet</p>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loginState === "loading"} disabled={!validateForm() || loginState === "loading" || !canSignIn}>
                  {isOfflineMode && workOffline ? "Continue offline" : "Sign in"}
                </Button>

                {isOfflineMode && hasOfflineSession && workOffline && (
                  <Button type="button" variant="secondary" size="lg" fullWidth onClick={handleOfflineWork} disabled={loginState === "loading"}>
                    Continue offline
                  </Button>
                )}

                {isOfflineMode && !hasOfflineSession && <p className="text-sm text-muted-foreground text-center">Please connect to the internet to sign in</p>}
              </form>

              <div className="mt-6 text-center">
                <Button variant="link" className="text-sm" onClick={onForgotPassword} disabled={loginState === "loading"}>
                  Forgot password?
                </Button>
              </div>
            </CardContent>

            <CardFooter>
              <FooterLinks />
            </CardFooter>
          </Card>
        </div>
      </div>

      <MFADialog
        state={mfaState}
        isOpen={loginState === "mfa"}
        onVerify={handleMFAVerify}
        onCancel={handleMFACancel}
        onResend={handleMFAResend}
        errorMessage={errorType === "mfa_error" ? "That code wasn't recognized. Try again." : undefined}
      />

      <Toast type={toast.type} message={toast.message} isVisible={toast.visible} onClose={hideToast} />
    </>
  )
}
