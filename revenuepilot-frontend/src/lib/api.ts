export type AuthTokenStorageKey = "token" | "accessToken" | "authToken"

const TOKEN_STORAGE_KEYS: AuthTokenStorageKey[] = ["token", "accessToken", "authToken"]
const REFRESH_TOKEN_STORAGE_KEY = "refreshToken"
const AUTH_REFRESH_ENDPOINT = "/api/auth/refresh"
const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//

let cachedApiBaseUrl: string | null | undefined

type MaybeStorage = Pick<Storage, "getItem"> | undefined

function getStorageCandidates(): MaybeStorage[] {
  if (typeof window === "undefined") {
    return []
  }

  return [typeof window.localStorage !== "undefined" ? window.localStorage : undefined, typeof window.sessionStorage !== "undefined" ? window.sessionStorage : undefined]
}

export function getStoredToken(): string | null {
  for (const storage of getStorageCandidates()) {
    if (!storage) {
      continue
    }

    try {
      for (const key of TOKEN_STORAGE_KEYS) {
        const value = storage.getItem(key)
        if (typeof value === "string" && value) {
          return value
        }
      }
    } catch {
      // Ignore storage access errors (e.g. privacy mode)
    }
  }

  return null
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined
  }
  try {
    return typeof window.localStorage !== "undefined" ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

function getSessionStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined
  }
  try {
    return typeof window.sessionStorage !== "undefined" ? window.sessionStorage : undefined
  } catch {
    return undefined
  }
}

function safeSetItem(storage: Storage | undefined, key: string, value: string | null) {
  if (!storage) {
    return
  }
  try {
    if (value === null) {
      storage.removeItem(key)
    } else {
      storage.setItem(key, value)
    }
  } catch {
    // ignore storage write failures
  }
}

function sanitizeToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function shouldRememberTokens(): boolean {
  const local = getLocalStorage()
  if (!local) {
    return false
  }

  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      if (sanitizeToken(local.getItem(key))) {
        return true
      }
    }
    if (sanitizeToken(local.getItem(REFRESH_TOKEN_STORAGE_KEY))) {
      return true
    }
  } catch {
    // ignore access errors and fall back to session-based storage
  }

  return false
}

export interface TokenBundle {
  accessToken: string | null
  refreshToken: string | null
}

export function extractAuthTokens(payload: unknown): TokenBundle {
  if (!isRecord(payload)) {
    return { accessToken: null, refreshToken: null }
  }

  const directAccess = sanitizeToken(payload.accessToken) || sanitizeToken(payload.access_token) || sanitizeToken(payload.token)

  const directRefresh = sanitizeToken(payload.refreshToken) || sanitizeToken(payload.refresh_token)

  const nestedTokens = isRecord(payload.tokens) ? payload.tokens : undefined
  const nestedAccess = sanitizeToken(nestedTokens?.accessToken) || sanitizeToken(nestedTokens?.access_token) || sanitizeToken(nestedTokens?.token)
  const nestedRefresh = sanitizeToken(nestedTokens?.refreshToken) || sanitizeToken(nestedTokens?.refresh_token)

  return {
    accessToken: directAccess || nestedAccess || null,
    refreshToken: directRefresh || nestedRefresh || null,
  }
}

export interface PersistAuthTokensOptions {
  accessToken: string
  refreshToken?: string
  remember?: boolean
}

export function persistAuthTokens(options: PersistAuthTokensOptions): void {
  const { accessToken, refreshToken, remember = false } = options
  if (typeof window === "undefined") {
    return
  }

  const sanitizedAccess = sanitizeToken(accessToken)
  const sanitizedRefresh = sanitizeToken(refreshToken)
  const local = getLocalStorage()
  const session = getSessionStorage()

  if (!sanitizedAccess) {
    for (const key of TOKEN_STORAGE_KEYS) {
      safeSetItem(local, key, null)
      safeSetItem(session, key, null)
    }
  } else if (remember) {
    for (const key of TOKEN_STORAGE_KEYS) {
      safeSetItem(local, key, sanitizedAccess)
      safeSetItem(session, key, sanitizedAccess)
    }
  } else {
    for (const key of TOKEN_STORAGE_KEYS) {
      safeSetItem(session, key, sanitizedAccess)
      safeSetItem(local, key, null)
    }
  }

  if (!sanitizedRefresh) {
    safeSetItem(local, REFRESH_TOKEN_STORAGE_KEY, null)
    safeSetItem(session, REFRESH_TOKEN_STORAGE_KEY, null)
  } else if (remember) {
    safeSetItem(local, REFRESH_TOKEN_STORAGE_KEY, sanitizedRefresh)
    safeSetItem(session, REFRESH_TOKEN_STORAGE_KEY, sanitizedRefresh)
  } else {
    safeSetItem(session, REFRESH_TOKEN_STORAGE_KEY, sanitizedRefresh)
    safeSetItem(local, REFRESH_TOKEN_STORAGE_KEY, null)
  }
}

export function clearStoredTokens(): void {
  if (typeof window === "undefined") {
    return
  }
  const local = getLocalStorage()
  const session = getSessionStorage()
  for (const key of TOKEN_STORAGE_KEYS) {
    safeSetItem(local, key, null)
    safeSetItem(session, key, null)
  }
  safeSetItem(local, REFRESH_TOKEN_STORAGE_KEY, null)
  safeSetItem(session, REFRESH_TOKEN_STORAGE_KEY, null)
}

export function getStoredRefreshToken(): string | null {
  for (const storage of getStorageCandidates()) {
    if (!storage) {
      continue
    }
    try {
      const value = storage.getItem(REFRESH_TOKEN_STORAGE_KEY)
      if (typeof value === "string" && value) {
        return value
      }
    } catch {
      // ignore storage access errors
    }
  }
  return null
}

interface RefreshOutcome {
  tokens: TokenBundle | null
  status: number
}

async function performTokenRefresh(refreshToken: string): Promise<RefreshOutcome> {
  const requestInfo = resolveRequestInfo(AUTH_REFRESH_ENDPOINT)
  const headers = buildAuthHeaders(undefined, { json: true, skipAuth: true })

  try {
    const response = await fetch(requestInfo, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: "include",
    })

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        // ignore parse errors – payload stays null
      }
    }

    if (!response.ok) {
      return { tokens: null, status: response.status }
    }

    if (!payload) {
      return { tokens: { accessToken: null, refreshToken: null }, status: response.status }
    }

    return { tokens: extractAuthTokens(payload), status: response.status }
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      throw error
    }
    return { tokens: null, status: 0 }
  }
}

interface RefreshAttemptResult {
  token: string | null
  invalid: boolean
}

let refreshPromise: Promise<RefreshAttemptResult> | null = null

async function requestAccessTokenRefresh(): Promise<RefreshAttemptResult> {
  const existingRefresh = getStoredRefreshToken()
  if (!existingRefresh) {
    return { token: null, invalid: true }
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const outcome = await performTokenRefresh(existingRefresh)
      const tokenBundle = outcome.tokens
      if (!tokenBundle || !tokenBundle.accessToken) {
        return { token: null, invalid: outcome.status !== 0 }
      }

      const remember = shouldRememberTokens()
      const nextRefresh = tokenBundle.refreshToken || existingRefresh
      persistAuthTokens({
        accessToken: tokenBundle.accessToken,
        refreshToken: nextRefresh,
        remember,
      })
      return { token: tokenBundle.accessToken, invalid: false }
    })()

    refreshPromise.finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

function normalizeBaseUrl(rawBase: string | null | undefined): string | null {
  if (!rawBase) {
    return null
  }

  let base = rawBase.trim()
  if (!base) {
    return null
  }

  if (base.startsWith("//")) {
    const protocol = typeof window !== "undefined" ? window.location.protocol : "https:"
    base = `${protocol}${base}`
  }

  if (!ABSOLUTE_URL_RE.test(base)) {
    if (typeof window === "undefined") {
      return null
    }
    try {
      base = new URL(base, window.location.origin).toString()
    } catch {
      return null
    }
  }

  return base.replace(/\/+$/, "")
}

export function resolveApiBaseUrl(): string | null {
  if (cachedApiBaseUrl !== undefined) {
    return cachedApiBaseUrl
  }

  let candidate: string | null = null

  if (typeof window !== "undefined") {
    const globalBase = (window as unknown as { __BACKEND_URL__?: unknown })?.__BACKEND_URL__
    if (typeof globalBase === "string" && globalBase.trim().length > 0) {
      candidate = globalBase
    }
  }

  if (!candidate && typeof import.meta !== "undefined" && (import.meta as any)?.env) {
    const envBase = (import.meta as any).env.VITE_API_URL
    if (typeof envBase === "string" && envBase.trim().length > 0) {
      candidate = envBase
    }
  }

  if (!candidate && typeof globalThis === "object" && globalThis) {
    const maybeProcess = (globalThis as { process?: { env?: Record<string, unknown> } }).process
    const envVars = maybeProcess?.env
    if (envVars) {
      for (const key of ["VITE_API_URL", "API_URL", "BACKEND_URL"]) {
        const value = envVars[key]
        if (typeof value === "string" && value.trim().length > 0) {
          candidate = value
          break
        }
      }
    }
  }

  cachedApiBaseUrl = normalizeBaseUrl(candidate)
  return cachedApiBaseUrl ?? null
}

function withApiBase(path: string): string | null {
  if (!path) {
    return path
  }

  if (ABSOLUTE_URL_RE.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path
  }

  const base = resolveApiBaseUrl()
  if (!base) {
    return typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path
  }

  try {
    const baseHref = base.endsWith("/") ? base : `${base}/`
    const relative = path.startsWith("/") ? path.slice(1) : path
    return new URL(relative, baseHref).toString()
  } catch {
    return path
  }
}

function resolveRequestInfo(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string") {
    const resolved = withApiBase(input)
    return resolved ?? input
  }

  if (input instanceof URL) {
    const resolved = withApiBase(input.toString())
    return resolved ? new URL(resolved) : input
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    const resolved = withApiBase(input.url)
    if (!resolved) {
      return input
    }
    const cloned = input.clone()
    return new Request(resolved, cloned)
  }

  return input
}

export function resolveWebsocketUrl(path: string): string {
  if (!path) {
    return path
  }

  if (ABSOLUTE_URL_RE.test(path)) {
    try {
      const absolute = new URL(path)
      if (absolute.protocol === "http:") {
        absolute.protocol = "ws:"
      } else if (absolute.protocol === "https:") {
        absolute.protocol = "wss:"
      }
      return absolute.toString()
    } catch {
      return path
    }
  }

  const base = resolveApiBaseUrl()
  let origin: string | null = null
  let protocolSource: string | null = null

  if (base) {
    try {
      const baseUrl = new URL(base)
      origin = baseUrl.origin
      protocolSource = baseUrl.protocol
    } catch {
      origin = null
      protocolSource = null
    }
  }

  if (!origin && typeof window !== "undefined") {
    try {
      const windowOrigin = new URL(window.location.origin)
      origin = windowOrigin.origin
      protocolSource = window.location.protocol
    } catch {
      origin = null
    }
  }

  if (!origin) {
    return path
  }

  try {
    const relative = path.startsWith("/") ? path : `/${path}`
    const resolved = new URL(relative, origin)
    const protocol = protocolSource === "https:" ? "wss:" : "ws:"
    resolved.protocol = protocol
    return resolved.toString()
  } catch {
    return path
  }
}

export interface BuildAuthHeadersOptions {
  /** When true, automatically set the `Content-Type` header to `application/json`. */
  json?: boolean
  /** When true (default), ensure the `Accept` header prefers JSON responses. */
  acceptJson?: boolean
  /** Skip attaching the bearer token even if one is available. */
  skipAuth?: boolean
  /** Explicit content type override. */
  contentType?: string
}

export function buildAuthHeaders(headers?: HeadersInit, options: BuildAuthHeadersOptions = {}): Headers {
  const { json = false, acceptJson = true, skipAuth = false, contentType } = options
  const merged = new Headers(headers ?? undefined)

  if (acceptJson && !merged.has("Accept")) {
    merged.set("Accept", "application/json")
  }

  if (contentType && !merged.has("Content-Type")) {
    merged.set("Content-Type", contentType)
  }

  if (json && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json")
  }

  if (!skipAuth) {
    const token = getStoredToken()
    if (token && !merged.has("Authorization")) {
      merged.set("Authorization", `Bearer ${token}`)
    }
  }

  return merged
}

export interface ApiFetchOptions extends Omit<RequestInit, "body" | "headers"> {
  headers?: HeadersInit
  body?: BodyInit | null
  /** Automatically set JSON headers. Defaults to true when `jsonBody` is provided. */
  json?: boolean
  /** Automatically add an `Accept: application/json` header. Defaults to true. */
  acceptJson?: boolean
  /** Convenience property for JSON payloads. */
  jsonBody?: unknown
  /** Skip attaching the bearer token for this request. */
  skipAuth?: boolean
}

export async function apiFetch(input: RequestInfo | URL, options: ApiFetchOptions = {}): Promise<Response> {
  const { headers, body, credentials, jsonBody, json = jsonBody !== undefined, acceptJson = true, skipAuth = false, ...rest } = options

  const finalBody = jsonBody !== undefined ? JSON.stringify(jsonBody) : body
  const mergedHeaders = buildAuthHeaders(headers, { json, acceptJson, skipAuth })
  const requestInfo = resolveRequestInfo(input)

  let response = await fetch(requestInfo, {
    ...rest,
    body: finalBody ?? undefined,
    headers: mergedHeaders,
    credentials: credentials ?? "include",
  })

  const shouldAttemptRefresh = !skipAuth && !rest.signal?.aborted && (response.status === 401 || response.status === 419)

  let refreshAttempt: RefreshAttemptResult | null = null

  if (shouldAttemptRefresh) {
    refreshAttempt = await requestAccessTokenRefresh()
    if (refreshAttempt.token) {
      mergedHeaders.set("Authorization", `Bearer ${refreshAttempt.token}`)
      response = await fetch(requestInfo, {
        ...rest,
        body: finalBody ?? undefined,
        headers: mergedHeaders,
        credentials: credentials ?? "include",
      })
    } else if (refreshAttempt.invalid) {
      clearStoredTokens()
    }
  }

  if ((response.status === 401 || response.status === 419) && !skipAuth) {
    const retriedWithToken = Boolean(refreshAttempt?.token)
    const shouldClear = !shouldAttemptRefresh || (refreshAttempt ? refreshAttempt.invalid || retriedWithToken : true)
    if (shouldClear) {
      clearStoredTokens()
    }
  }

  return response
}

export interface ApiFetchJsonOptions<T> extends ApiFetchOptions {
  /** Unwrap responses shaped like `{ data: ... }`. */
  unwrapData?: boolean
  /** When true (default), treat empty responses or 204/404 statuses as `null`. */
  returnNullOnEmpty?: boolean
  /** Optional fallback value returned when the response is empty. */
  fallbackValue?: T
}

function describeRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url
  }
  return "request"
}

export async function apiFetchJson<T = unknown>(input: RequestInfo | URL, options: ApiFetchJsonOptions<T> = {}): Promise<T | null> {
  const { unwrapData = false, returnNullOnEmpty = true, fallbackValue, ...fetchOptions } = options
  const requestInfo = resolveRequestInfo(input)
  const response = await apiFetch(requestInfo, fetchOptions)
  const requestLabel = describeRequest(requestInfo)

  if (returnNullOnEmpty && (response.status === 204 || response.status === 404)) {
    return (fallbackValue ?? null) as T | null
  }

  const text = await response.text()

  if (!text) {
    if (!response.ok) {
      throw new Error(`Request to ${requestLabel} failed with status ${response.status}`)
    }
    if (fallbackValue !== undefined) {
      return fallbackValue
    }
    return (returnNullOnEmpty ? null : ({} as T)) as T | null
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    if (!response.ok) {
      throw new Error(text || `Request to ${requestLabel} failed with status ${response.status}`)
    }
    console.error(`Failed to parse JSON response from ${requestLabel}`, error)
    if (fallbackValue !== undefined) {
      return fallbackValue
    }
    return (returnNullOnEmpty ? null : ({} as T)) as T | null
  }

  if (!response.ok) {
    let message = response.statusText || `Request to ${requestLabel} failed with status ${response.status}`
    if (data && typeof data === "object" && data !== null) {
      const maybeMessage = (data as Record<string, unknown>).message
      if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
        message = maybeMessage
      }
    }
    throw new Error(message)
  }

  let result = data
  if (unwrapData && result && typeof result === "object" && result !== null && "data" in result) {
    result = (result as Record<string, unknown>).data
  }

  return (result as T) ?? fallbackValue ?? (returnNullOnEmpty ? null : ({} as T))
}
