import { useCallback, useMemo, useState } from "react"
import { ArrowLeft, Mail, CheckCircle } from "lucide-react"

import { DesignLoginSystemApi, DesignLoginSystemError } from "../types"
import { Alert } from "./Alert"
import { Button } from "./Button"
import { Card, CardContent, CardFooter, CardHeader } from "./Card"
import { FooterLinks } from "./FooterLinks"
import { TextField } from "./TextField"

type ForgotPasswordState = "input" | "loading" | "success" | "error"
type ErrorType = "invalid_email" | "user_not_found" | "server_error" | "rate_limited" | null

interface ForgotPasswordFormProps {
  authApi: Pick<DesignLoginSystemApi, "forgotPassword">
  onBackToLogin: () => void
  multiTenant?: boolean
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function ForgotPasswordForm({ authApi, onBackToLogin, multiTenant = false }: ForgotPasswordFormProps) {
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

  const mapErrorToState = useCallback((error: unknown): ErrorType => {
    if (error instanceof DesignLoginSystemError) {
      if (error.code === "user_not_found" || error.code === "rate_limited") {
        return error.code
      }
      return "server_error"
    }
    if (typeof error === "string") {
      return error as ErrorType
    }
    return "server_error"
  }, [])

  const submitRequest = useCallback(
    async (targetEmail: string) => {
      await authApi.forgotPassword({
        email: targetEmail,
        clinicCode: multiTenant ? normalizeString(clinicCode) : undefined
      })
    },
    [authApi, clinicCode, multiTenant]
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
        setErrorType(mapErrorToState(error))
        setState("error")
      }
    },
    [canSubmit, email, mapErrorToState, submitRequest]
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
      setErrorType(mapErrorToState(error))
      setState("error")
    }
  }, [mapErrorToState, submitRequest, submittedEmail])

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
            icon={<Mail className="w-10 h-10 text-primary" />}
            title="Forgot password"
            subtitle="We'll email you a reset link"
          />

          <CardContent>
            {state === "error" && errorType && (
              <Alert tone="error" className="mb-4">
                {getErrorMessage(errorType)}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <TextField
                type="email"
                label="Work email"
                placeholder="you@example.com"
                value={email}
                onChange={setEmail}
                iconLeft="mail"
                required
                disabled={state === "loading"}
                id="reset-email"
              />

              {multiTenant && (
                <TextField
                  type="text"
                  label="Clinic Code"
                  placeholder="Enter your clinic code"
                  value={clinicCode}
                  onChange={setClinicCode}
                  required
                  disabled={state === "loading"}
                  id="reset-clinic-code"
                />
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={state === "loading"}
                disabled={!canSubmit || state === "loading"}
              >
                Send reset link
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                onClick={onBackToLogin}
                iconLeft={<ArrowLeft className="w-4 h-4" />}
                disabled={state === "loading"}
              >
                Back to sign in
              </Button>
            </form>
          </CardContent>

          <CardFooter>
            <FooterLinks />
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
