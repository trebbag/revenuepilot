export type AuthErrorCode = "invalid_credentials" | "account_locked" | "server_error" | "mfa_error" | "invalid_email" | "user_not_found" | "rate_limited"

export class DesignLoginSystemError extends Error {
  readonly code: AuthErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(code: AuthErrorCode, message: string, options: { status?: number; details?: unknown } = {}) {
    super(message)
    this.name = "DesignLoginSystemError"
    this.code = code
    this.status = options.status
    this.details = options.details
  }
}

export interface LoginRequest {
  username: string
  password: string
  rememberMe?: boolean
  clinicCode?: string
}

export interface LoginSuccessResult {
  type: "success"
  accessToken: string
  refreshToken?: string | null
  metadata?: Record<string, unknown> | null
}

export interface LoginMfaChallenge {
  type: "mfa"
  mfaSessionToken: string
  metadata?: Record<string, unknown> | null
}

export type LoginResponse = LoginSuccessResult | LoginMfaChallenge

export interface VerifyMfaRequest {
  code: string
  mfaSessionToken: string
  rememberMe?: boolean
}

export type VerifyMfaResponse = LoginSuccessResult

export interface ResendMfaRequest {
  mfaSessionToken: string
}

export interface ForgotPasswordRequest {
  email: string
  clinicCode?: string
}

export interface DesignLoginSystemApi {
  login(request: LoginRequest): Promise<LoginResponse>
  verifyMfa(request: VerifyMfaRequest): Promise<VerifyMfaResponse>
  resendMfa?(request: ResendMfaRequest): Promise<void>
  forgotPassword(request: ForgotPasswordRequest): Promise<void>
  logout(): Promise<void>
}
