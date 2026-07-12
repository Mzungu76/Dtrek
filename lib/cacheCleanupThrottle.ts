/**
 * Throttles the lazy "delete expired rows" cleanup that each *Cache.ts module fires off on every
 * read. Without this, a single request that resolves N points/tiles (e.g. a hike's terrain
 * profile calling fetchGeologiaAtPointCached once per segment) fires N parallel DELETE queries
 * against the same cache table — the kind of "sudden spike in database activity" Supabase's own
 * troubleshooting docs cite as the top cause of a project's Postgres instance crashing OOM and
 * returning Cloudflare 522s across Auth/REST until restarted.
 *
 * Same "in-memory, best-effort, resets on cold start" tradeoff as authTokenCache.ts — rows past
 * their TTL just sit unused until the next allowed cleanup, they're never served (every read
 * already filters `gt('expires_at', now)`), so throttling cleanup only delays deletion, it never
 * causes stale data to be returned.
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

const lastCleanupAt = new Map<string, number>()

export function shouldRunCleanup(table: string): boolean {
  const now = Date.now()
  const last = lastCleanupAt.get(table) ?? 0
  if (now - last < CLEANUP_INTERVAL_MS) return false
  lastCleanupAt.set(table, now)
  return true
}
