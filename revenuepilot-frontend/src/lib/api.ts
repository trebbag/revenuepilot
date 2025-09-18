export type AuthTokenStorageKey = "token" | "accessToken" | "authToken"

const TOKEN_STORAGE_KEYS: AuthTokenStorageKey[] = ["token", "accessToken", "authToken"]

type MaybeStorage = Pick<Storage, "getItem"> | undefined

function getStorageCandidates(): MaybeStorage[] {
  if (typeof window === "undefined") {
    return []
  }

  return [
    typeof window.localStorage !== "undefined" ? window.localStorage : undefined,
    typeof window.sessionStorage !== "undefined" ? window.sessionStorage : undefined
  ]
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
  const {
    headers,
    body,
    credentials,
    jsonBody,
    json = jsonBody !== undefined,
    acceptJson = true,
    skipAuth = false,
    ...rest
  } = options

  const finalBody = jsonBody !== undefined ? JSON.stringify(jsonBody) : body
  const mergedHeaders = buildAuthHeaders(headers, { json, acceptJson, skipAuth })

  return fetch(input, {
    ...rest,
    body: finalBody ?? undefined,
    headers: mergedHeaders,
    credentials: credentials ?? "include"
  })
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

export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  options: ApiFetchJsonOptions<T> = {}
): Promise<T | null> {
  const { unwrapData = false, returnNullOnEmpty = true, fallbackValue, ...fetchOptions } = options
  const response = await apiFetch(input, fetchOptions)
  const requestLabel = describeRequest(input)

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

  return (result as T) ?? (fallbackValue ?? (returnNullOnEmpty ? null : ({} as T)))
}
