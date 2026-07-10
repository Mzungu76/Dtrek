// Tiny per-tab memoization for GET endpoints whose result is effectively constant for the
// lifetime of a browser session — account-level data (AI access, user settings) that doesn't
// depend on which hike is open, so it shouldn't be re-fetched every time a component like
// GuidaHub remounts (e.g. navigating away from /guida and back). A failed fetch evicts its own
// cache entry so a transient failure (a slow/unreachable backend) gets retried on the next call
// instead of being remembered as the answer for the rest of the session.
const cache = new Map<string, Promise<unknown>>()

export function fetchOnce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let entry = cache.get(key) as Promise<T> | undefined
  if (!entry) {
    entry = fetcher().catch((err) => { cache.delete(key); throw err })
    cache.set(key, entry)
  }
  return entry
}
