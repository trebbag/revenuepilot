import { apiFetch, extractAuthTokens } from "../../lib/api"
import { DesignLoginSystemApi, DesignLoginSystemError, ForgotPasswordRequest, LoginRequest, LoginResponse, LoginSuccessResult, ResendMfaRequest, VerifyMfaRequest } from "./types"

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function mapLoginError(status: number, payload: unknown): DesignLoginSystemError {
  const details = isRecord(payload) ? payload : undefined
  const rawMessage = normalizeString((details?.error as string | undefined) ?? (details?.detail as string | undefined) ?? (details?.message as string | undefined))
  const message = rawMessage || "Unable to sign in"

  if (status === 401) {
    return new DesignLoginSystemError("invalid_credentials", message, { status, details })
  }

  if (status === 423) {
    return new DesignLoginSystemError("account_locked", message, { status, details })
  }

  if (status === 429) {
    return new DesignLoginSystemError("server_error", message, { status, details })
  }

  if (rawMessage) {
    const lower = rawMessage.toLowerCase()
    if (lower.includes("invalid")) {
      return new DesignLoginSystemError("invalid_credentials", message, { status, details })
    }
    if (lower.includes("lock")) {
      return new DesignLoginSystemError("account_locked", message, { status, details })
    }
    if (lower.includes("mfa")) {
      return new DesignLoginSystemError("mfa_error", message, { status, details })
    }
  }

  return new DesignLoginSystemError("server_error", message, { status, details })
}

function mapForgotPasswordError(status: number, payload: unknown): DesignLoginSystemError {
  const details = isRecord(payload) ? payload : undefined
  const rawMessage = normalizeString((details?.error as string | undefined) ?? (details?.detail as string | undefined) ?? (details?.message as string | undefined))
  const message = rawMessage || "Unable to submit password reset request"

  if (status === 404) {
    return new DesignLoginSystemError("user_not_found", message, { status, details })
  }

  if (status === 429) {
    return new DesignLoginSystemError("rate_limited", message, { status, details })
  }

  if (rawMessage.toLowerCase().includes("not found")) {
    return new DesignLoginSystemError("user_not_found", message, { status, details })
  }

  if (rawMessage.toLowerCase().includes("rate")) {
    return new DesignLoginSystemError("rate_limited", message, { status, details })
  }

  return new DesignLoginSystemError("server_error", message, { status, details })
}

function assertAccessToken(result: LoginSuccessResult, context: string): LoginSuccessResult {
  if (!result.accessToken) {
    throw new DesignLoginSystemError("server_error", `${context} missing access token`, {
      details: result.metadata ?? undefined,
    })
  }
  return result
}

export function createDesignLoginSystemApiClient(): DesignLoginSystemApi {
  return {
    async login(request: LoginRequest): Promise<LoginResponse> {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        jsonBody: {
          username: normalizeString(request.username),
          password: request.password,
          rememberMe: Boolean(request.rememberMe),
          ...(request.clinicCode ? { clinicCode: normalizeString(request.clinicCode) } : {}),
        },
        skipAuth: true,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw mapLoginError(response.status, data)
      }

      if (isRecord(data) && (data.requiresMFA || data.requires_mfa)) {
        const sessionToken = normalizeString(data.mfaSessionToken) || normalizeString(data.mfa_session_token)
        if (!sessionToken) {
          throw new DesignLoginSystemError("mfa_error", "Missing MFA session token", { details: data })
        }
        return {
          type: "mfa",
          mfaSessionToken: sessionToken,
          metadata: data,
        }
      }

      const tokens = extractAuthTokens(data)
      const result: LoginSuccessResult = {
        type: "success",
        accessToken: tokens.accessToken ?? "",
        refreshToken: tokens.refreshToken,
        metadata: isRecord(data) ? data : null,
      }

      return assertAccessToken(result, "Authentication response")
    },

    async verifyMfa(request: VerifyMfaRequest): Promise<LoginSuccessResult> {
      const response = await apiFetch("/api/auth/verify-mfa", {
        method: "POST",
        jsonBody: {
          code: normalizeString(request.code),
          mfaSessionToken: normalizeString(request.mfaSessionToken),
          rememberMe: Boolean(request.rememberMe),
        },
        skipAuth: true,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw mapLoginError(response.status, data)
      }

      const tokens = extractAuthTokens(data)
      const result: LoginSuccessResult = {
        type: "success",
        accessToken: tokens.accessToken ?? "",
        refreshToken: tokens.refreshToken,
        metadata: isRecord(data) ? data : null,
      }

      return assertAccessToken(result, "MFA verification response")
    },

    async resendMfa(request: ResendMfaRequest): Promise<void> {
      const response = await apiFetch("/api/auth/resend-mfa", {
        method: "POST",
        jsonBody: { mfaSessionToken: normalizeString(request.mfaSessionToken) },
        skipAuth: true,
      })

      if (!response.ok) {
        throw new DesignLoginSystemError("mfa_error", "Unable to resend MFA code", {
          status: response.status,
        })
      }
    },

    async forgotPassword(request: ForgotPasswordRequest): Promise<void> {
      const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        jsonBody: {
          email: normalizeString(request.email),
          ...(request.clinicCode ? { clinicCode: normalizeString(request.clinicCode) } : {}),
        },
        skipAuth: true,
      })

      if (response.status === 204) {
        return
      }

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw mapForgotPasswordError(response.status, data)
      }
    },

    async logout(): Promise<void> {
      try {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          json: false,
        })
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return
        }
        throw error
      }
    },
  }
}
