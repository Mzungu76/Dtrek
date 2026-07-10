import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

/**
 * Short-lived, in-memory cache for the outcome of validating a Supabase session cookie via
 * supabase.auth.getUser() — a real network round-trip to Supabase's Auth service, not a local
 * cookie read. middleware.ts no longer does this validation at all (see its own comment — it's a
 * cookie-presence-only redirect now, deliberately network-free), but opening a hike still fires
 * a handful of parallel API requests that each carry the same session cookie and each
 * independently re-validate that identical JWT over the network via getUserFromRequest
 * (lib/supabaseAuth.ts) — this cache lets a burst of those share one validated result for a few
 * seconds instead of each re-hitting Supabase Auth for the exact same still-valid token.
 *
 * Keyed by the raw session cookie value(s), not by user id, so a genuine login/logout/refresh
 * (which changes the cookie) always misses and revalidates for real — this only skips redundant
 * re-checks of the SAME still-valid token within a few seconds, it never trusts a token for
 * longer than Supabase itself already would.
 *
 * Only effective within a single warm serverless/edge instance (module state resets on cold
 * start, and middleware/edge vs. route-handler/node runtimes don't share memory with each other
 * either) — a best-effort speedup, never a correctness requirement: every caller still falls back
 * to a real validation on a miss.
 */
const CACHE_TTL_MS = 20_000
const MAX_ENTRIES = 500

interface Entry {
  user: User | null
  expiresAt: number
}

const cache = new Map<string, Entry>()

function cacheKey(request: NextRequest): string | null {
  const relevant = request.cookies.getAll().filter(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (relevant.length === 0) return null
  return relevant.map(c => `${c.name}=${c.value}`).sort().join('&')
}

export async function getUserCached(
  request: NextRequest,
  validate: () => Promise<User | null>,
): Promise<User | null> {
  const key = cacheKey(request)
  if (!key) return validate()

  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.user

  const user = await validate()

  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of Array.from(cache)) { if (v.expiresAt <= now) cache.delete(k) }
  }
  cache.set(key, { user, expiresAt: now + CACHE_TTL_MS })
  return user
}
