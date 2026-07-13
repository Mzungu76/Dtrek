/** Thrown by apiFetch on a non-2xx response — carries the HTTP status so callers can distinguish
 *  permanent client errors (4xx — retrying won't help, e.g. 401/403 after a revoked session) from
 *  transient ones (network failure, 5xx) that a retry-then-outbox fallback should still cover. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** True for HTTP statuses where retrying the exact same request is pointless — the server has
 *  already told us definitively "no" for a reason retrying won't fix (bad/expired auth, ownership
 *  mismatch, malformed body). 408 (timeout) and 429 (rate limit) are deliberately excluded — those
 *  ARE worth retrying. */
export function isPermanentClientError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, `API ${url} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
