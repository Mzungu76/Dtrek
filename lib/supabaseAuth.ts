/**
 * Validates the caller's session JWT (from cookies) in API route handlers.
 * Returns the authenticated User, or null if no valid session.
 *
 * Uses the anon key so the auth check never bypasses RLS checks in Supabase.
 * The actual DB operations in API routes keep using the service-role client
 * (lib/supabase.ts) but always filter by the user.id returned here.
 */
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { isAuthRetryableFetchError, type SupabaseClient, type User } from '@supabase/supabase-js'
import { getUserCached } from './authTokenCache'
import { verifySupabaseJwtLocally, refreshJwksCache } from './supabaseJwt'

function anonClientForRequest(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},  // read-only — session refresh happens in middleware
      },
      global: {
        // See lib/supabase.ts — Next.js's server-side fetch() patch caches third-party fetches
        // (including this SDK's own auth calls) unless explicitly opted out, independent of the
        // calling route's own dynamic/caching config. A cached getUser()/getSession() response
        // here would mean a request keeps getting treated as unauthenticated (or as a stale user)
        // long after the real session has changed — the exact same failure mode confirmed for
        // data reads, just applied to auth instead.
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )
}

// Tetto massimo per l'intera risoluzione — una richiesta di rete rimasta appesa (né riuscita né
// fallita, es. durante un blackout particolarmente "silenzioso") non deve mai lasciare il
// chiamante in sospeso per sempre: meglio rispondere "non disponibile" entro pochi secondi che
// non rispondere affatto, che lato client si traduce in una fetch che non si risolve mai e quindi
// in nessun messaggio a schermo (né "aggiungi la chiave" né "riprova più tardi" — proprio i
// sintomi segnalati: guida mai generata, nessun avviso, Chiedi a Giulia/fonti mai comparse).
const RESOLVE_TIMEOUT_MS = 8000

// `buildFallback` is a thunk (not a plain value) so the fallback — which may itself need to do a
// bounded, local-only JWT check (see verifyDegradedState below) — is only ever computed when the
// timeout actually fires, not eagerly on every call regardless of whether it's needed.
function withTimeout<T>(promise: Promise<T>, ms: number, buildFallback: () => Promise<T> | T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => { Promise.resolve(buildFallback()).then(resolve) }, ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); Promise.resolve(buildFallback()).then(resolve) },
    )
  })
}

/**
 * Fast, network-bounded attempt to recover an identity — or at least a well-founded "genuinely
 * can't tell right now" — when the live getUser() path is unavailable. Used by both of
 * resolveUser's fallback paths below.
 *
 * `degraded: true` is returned ONLY when the JWKS themselves couldn't be obtained at all (real
 * outage) — never when a token was checked against reachable JWKS and simply failed to verify
 * (forged, tampered, or expired). Conflating those two would let anyone unlock the emergency
 * shared API key (see app/lib/guide/resolveApiKeyAndSettings.ts's resolveEmergencySharedKey) by
 * sending a cookie with the right NAME but a garbage value, any time getUser()'s network call
 * happens to hiccup — far more common than a full Supabase+JWKS outage.
 *
 * `getSessionTimeoutMs`, when given, bounds the (normally-local) cookie decode in case it
 * unexpectedly tries a token refresh over the network; `allowLiveJwksFetch: false` must be used
 * from a path that has already spent its time budget, to guarantee no further network call to
 * supabase.co is attempted here.
 */
async function verifyDegradedState(
  request: NextRequest,
  opts: { allowLiveJwksFetch: boolean; getSessionTimeoutMs?: number },
): Promise<{ user: User | null; degraded: boolean }> {
  const supabase = anonClientForRequest(request)
  let accessToken: string | undefined
  try {
    const sessionPromise = supabase.auth.getSession()
    const { data: { session } } = opts.getSessionTimeoutMs != null
      ? await withTimeout(sessionPromise, opts.getSessionTimeoutMs, () => ({ data: { session: null }, error: null }))
      : await sessionPromise
    accessToken = session?.access_token
  } catch {
    // getSession() ha fallito in modo imprevisto — trattato come "nessun token estraibile" sotto.
  }

  // Nessuna sessione plausibile da verificare — non c'è nulla da cui derivare "degraded: true"
  // (a differenza di prima, non basta più il solo NOME del cookie).
  if (!accessToken) return { user: null, degraded: false }

  const { user: local, jwksAvailable } = await verifySupabaseJwtLocally(accessToken, { allowLiveFetch: opts.allowLiveJwksFetch })
  if (local) return { user: { id: local.id, email: local.email } as User, degraded: false }

  return { user: null, degraded: !jwksAvailable }
}

/**
 * Core resolution shared by every exported helper below. supabase.auth.getUser() (a live network
 * round-trip to Supabase's Auth server) is always tried first and is the source of truth whenever
 * it's reachable — it's the only check that respects an immediate session revocation. Only when
 * that call itself fails on a network error (isAuthRetryableFetchError, e.g. mid-outage) do we
 * fall back to verifying the JWT already sitting in the request's cookies locally, via this
 * project's public JWKS (lib/supabaseJwt.ts) — no network call needed once jose has cached the
 * keys. getSession() just decodes the cookie (no network call of its own in the common case,
 * unlike getUser()); pairing it with our own signature verification is exactly the pattern
 * Supabase's own docs describe for using getSession() safely server-side.
 *
 * `degraded: true` is a further, explicit fallback for when even the JWKS-based verification is
 * unavailable (e.g. a total Supabase outage, JWKS included) — a session cookie is present but
 * cannot be cryptographically verified at all right now. Callers that know how to operate without
 * a confirmed per-user identity (the AI routes, via the shared emergency key — an explicit,
 * user-approved tradeoff, see lib/aiKeyCache.ts's isEmergencySharedKeyEnabled) may treat this as
 * "proceed in emergency mode"; everything else must keep treating it as unauthenticated.
 */
async function resolveUser(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean; degraded: boolean }> {
  return withTimeout(resolveUserInner(request), RESOLVE_TIMEOUT_MS, async () => {
    // resolveUserInner ha superato il tetto di tempo (es. getUser() rimasta appesa) — nessun
    // ulteriore fetch di rete qui (allowLiveJwksFetch: false), solo JWKS già in cache/Redis, ed
    // entro un tempo limitato (getSessionTimeoutMs) per non sommare un'altra attesa lunga.
    const { user, degraded } = await verifyDegradedState(request, { allowLiveJwksFetch: false, getSessionTimeoutMs: 1500 })
    return { user, authUnavailable: true, degraded }
  })
}

async function resolveUserInner(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean; degraded: boolean }> {
  const supabase = anonClientForRequest(request)
  let data: { user: User | null }, error: unknown
  try {
    ;({ data, error } = await supabase.auth.getUser())
  } catch {
    data = { user: null }
    error = new Error('getUser threw')
  }
  if (data.user) {
    // Percorso "tutto ok" — tiene pronta la copia di riserva delle chiavi JWKS (lib/supabaseJwt.ts)
    // per quando servirà davvero. Fire-and-forget: non deve mai rallentare una richiesta riuscita.
    void refreshJwksCache()
    return { user: data.user, authUnavailable: false, degraded: false }
  }
  if (!isAuthRetryableFetchError(error)) return { user: null, authUnavailable: false, degraded: false }

  // Questo percorso non ha ancora speso il proprio budget di tempo — via libera a un fetch JWKS
  // dal vivo se serve (allowLiveJwksFetch: true).
  const { user, degraded } = await verifyDegradedState(request, { allowLiveJwksFetch: true })
  return { user, authUnavailable: true, degraded }
}

export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  return getUserCached(request, async () => (await resolveUser(request)).user)
}

/**
 * Same resolution as getUserFromRequest, but also distinguishes "genuinely no/expired session"
 * from "couldn't verify at all, network or otherwise" (e.g. mid-outage with no usable cookie
 * either) — so a caller checking only `if (!user)` can show "try again shortly" instead of
 * "please log in" / "add your API key". Bypasses getUserCached (kept simple; only a handful of AI
 * routes use this variant so far) — see components/SessionKeepAlive.tsx for the client-side
 * counterpart of this same live-vs-unavailable distinction.
 */
export async function getUserFromRequestDetailed(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean; degraded: boolean }> {
  return resolveUser(request)
}

/**
 * Same JWT validation as getUserFromRequest, but also returns the anon-key
 * client carrying the caller's session — every `.from(...)` query issued
 * through it runs as that user under Postgres RLS, instead of the
 * service-role client (lib/supabase.ts) which bypasses RLS entirely and
 * relies solely on the caller remembering a manual `.eq('user_id', ...)`
 * filter. Use this for routes that read/write user-owned rows directly
 * (e.g. hike_navigation_*), so a missing filter fails closed (RLS denies)
 * instead of failing open (service-role sees everything).
 */
export async function getUserScopedClient(request: NextRequest): Promise<{ user: User; supabase: SupabaseClient } | null> {
  const supabase = anonClientForRequest(request)
  const user = await getUserCached(request, () => withTimeout(
    supabase.auth.getUser().then(({ data }) => data.user ?? null).catch(() => null),
    RESOLVE_TIMEOUT_MS,
    () => null,
  ))
  if (!user) return null
  return { user, supabase }
}
