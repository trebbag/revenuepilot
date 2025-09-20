import { useCallback, useMemo, useState } from "react"
import { ArrowLeft, Mail, CheckCircle } from "lucide-react"

import { apiFetch } from "../../lib/api"
import { Alert } from "./Alert"
import { Button } from "./Button"
import { Card, CardContent, CardFooter, CardHeader } from "./Card"
import { FooterLinks } from "./FooterLinks"
import { TextField } from "./TextField"

type ForgotPasswordState = "input" | "loading" | "success" | "error"
type ErrorType = "invalid_email" | "user_not_found" | "server_error" | "rate_limited" | null

interface ForgotPasswordFormProps {
  onBackToLogin: () => void
  multiTenant?: boolean
}

interface ForgotPasswordResponse {
  error?: string
  detail?: string
  message?: string
  [key: string]: unknown
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function mapErrorType(response: Response, data: ForgotPasswordResponse | null): ErrorType {
  if (response.status === 404) {
    return "user_not_found"
  }
  if (response.status === 429) {
    return "rate_limited"
  }

  const message = normalizeString(data?.error ?? data?.detail ?? data?.message)
  if (message) {
    const lower = message.toLowerCase()
    if (lower.includes("not found")) {
      return "user_not_found"
    }
    if (lower.includes("rate")) {
      return "rate_limited"
    }
  }

  return "server_error"
}

export function ForgotPasswordForm({ onBackToLogin, multiTenant = false }: ForgotPasswordFormProps) {
  const [state, setState] = useState<ForgotPasswordState>("input")
  const [errorType, setErrorType] = useState<ErrorType>(null)
  const [clinicCode, setClinicCode] = useState("")
  const [email, setEmail] = useState("")
  const [submittedEmail, setSubmittedEmail] = useState("")

  const canSubmit = useMemo(() => {
    if (!isValidEmail(normalizeString(email))) {
      return false
    }
    if (multiTenant && !normalizeString(clinicCode)) {
      return false
    }
    return true
  }, [email, multiTenant, clinicCode])

  const getErrorMessage = useCallback((type: ErrorType) => {
    switch (type) {
      case "invalid_email":
        return "Please enter a valid email address."
      case "user_not_found":
        return "No account found with this email address."
      case "server_error":
        return "Service unavailable. Please try again later."
      case "rate_limited":
        return "Too many requests. Please wait before trying again."
      default:
        return ""
    }
  }, [])

  const submitRequest = useCallback(
    async (targetEmail: string) => {
      const payload: Record<string, unknown> = { email: targetEmail }
      if (multiTenant) {
        payload.clinicCode = normalizeString(clinicCode)
      }

      const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        jsonBody: payload,
        skipAuth: true
      })

      const data = (await response.json().catch(() => null)) as ForgotPasswordResponse | null

      if (!response.ok) {
        throw mapErrorType(response, data)
      }
    },
    [clinicCode, multiTenant]
  )

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()

      if (!canSubmit) {
        setErrorType("invalid_email")
        setState("error")
        return
      }

      setState("loading")
      setErrorType(null)

      try {
        const trimmedEmail = normalizeString(email)
        setSubmittedEmail(trimmedEmail)
        await submitRequest(trimmedEmail)
        setState("success")
      } catch (error) {
        const mapped = typeof error === "string" ? (error as ErrorType) : null
        setErrorType(mapped ?? "server_error")
        setState("error")
      }
    },
    [canSubmit, email, submitRequest]
  )

  const handleTryAgain = useCallback(() => {
    setState("input")
    setErrorType(null)
  }, [])

  const handleResendEmail = useCallback(async () => {
    if (!submittedEmail) {
      return
    }

    setState("loading")
    setErrorType(null)

    try {
      await submitRequest(submittedEmail)
      setState("success")
    } catch (error) {
      const mapped = typeof error === "string" ? (error as ErrorType) : null
      setErrorType(mapped ?? "server_error")
      setState("error")
    }
  }, [submitRequest, submittedEmail])

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          <Card size="lg">
            <CardContent>
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/15 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 shadow-lg shadow-primary/10">
                  <CheckCircle className="w-10 h-10 text-primary dark:text-primary" />
                </div>

                <div>
                  <h1 className="text-card-foreground mb-2">Check your email</h1>
                  <p className="text-muted-foreground mb-4">We've sent password reset instructions to:</p>
                  <p className="font-medium text-foreground">{submittedEmail}</p>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the email? Check your spam folder or try again.
                  </p>

                  <div className="flex flex-col gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      onClick={handleResendEmail}
                      disabled={state === "loading"}
                      loading={state === "loading"}
                    >
                      Resend email
                    </Button>

                    <Button variant="link" onClick={onBackToLogin} iconLeft={<ArrowLeft className="w-4 h-4" />}>
                      Back to sign in
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <FooterLinks />
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-md">
        <Card size="lg">
          <CardHeader
            logo={
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
            }
            title="Reset your password"
            subtitle="Enter your email and we'll send you reset instructions"
          />

          <CardContent>
            {state === "error" && errorType && (
              <Alert tone="error" className="mb-4">
                {getErrorMessage(errorType)}
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
                  disabled={state === "loading"}
                  id="clinic-code"
                  state={
                    state === "error" && errorType === "invalid_email" && !normalizeString(clinicCode)
                      ? "error"
                      : "default"
                  }
                />
              )}

              <TextField
                type="email"
                label="Email Address"
                placeholder="Enter your email address"
                value={email}
                onChange={setEmail}
                iconLeft="mail"
                required
                disabled={state === "loading"}
                id="email"
                autoComplete="email"
                state={
                  state === "error" && errorType === "invalid_email" && !isValidEmail(normalizeString(email))
                    ? "error"
                    : "default"
                }
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={state === "loading"}
                disabled={state === "loading" || !canSubmit}
              >
                Send reset link
              </Button>
            </form>

            <div className="mt-6 text-center flex flex-col gap-3">
              {state === "error" && (
                <Button variant="secondary" fullWidth onClick={handleTryAgain} disabled={state === "loading"}>
                  Try again
                </Button>
              )}

              <Button variant="link" onClick={onBackToLogin} iconLeft={<ArrowLeft className="w-4 h-4" />}>
                Back to sign in
              </Button>
            </div>
          </CardContent>

          <CardFooter>
            <FooterLinks />
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
