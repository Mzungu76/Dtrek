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

// How old a GET response's `Date` header can be before it's treated as a stale service-worker
// cache fallback rather than a genuinely fresh answer from the server. Generous enough to cover a
// slow round-trip, tight enough to catch a fallback response that's actually minutes/hours/days
// old — see isStaleSwResponse below.
const STALE_RESPONSE_THRESHOLD_MS = 30_000

/**
 * True when a response was served from public/sw.js's offline fallback cache (only happens when
 * the live network fetch failed or timed out) rather than fetched fresh just now — detected via
 * the origin's `Date` header, which a cached Response keeps unchanged from whenever it was first
 * stored. Every local-first store in this app treats "couldn't refresh" as "keep what's already
 * cached, retry later" — a stale response slipping through as if it were fresh instead looks like
 * real, current server data: it gets written straight into the local cache, and worse, feeds
 * lib/sync/pullEngine.ts's digest pruning, which deletes anything missing from it as "deleted
 * elsewhere". Confirmed as the exact mechanism behind a real report: a device kept reverting to
 * an older state on every open, self-fixing only after a manual service worker reset.
 */
export function isStaleSwResponse(res: Response): boolean {
  const responseDate = res.headers.get('date')
  return !!responseDate && Date.now() - new Date(responseDate).getTime() > STALE_RESPONSE_THRESHOLD_MS
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, `API ${url} → ${res.status}: ${text}`)
  }
  if ((options?.method ?? 'GET').toUpperCase() === 'GET' && isStaleSwResponse(res)) {
    throw new ApiError(0, `API ${url} → served from a stale offline cache, treating as unavailable`)
  }
  return res.json() as Promise<T>
}
