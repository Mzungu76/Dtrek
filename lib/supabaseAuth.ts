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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
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
 */
async function resolveUser(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean }> {
  return withTimeout(resolveUserInner(request), RESOLVE_TIMEOUT_MS, { user: null, authUnavailable: true })
}

async function resolveUserInner(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean }> {
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
    return { user: data.user, authUnavailable: false }
  }
  if (!isAuthRetryableFetchError(error)) return { user: null, authUnavailable: false }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const local = await verifySupabaseJwtLocally(session.access_token)
      if (local) return { user: { id: local.id, email: local.email } as User, authUnavailable: false }
    }
  } catch {
    // getSession()/la verifica locale hanno fallito in modo imprevisto — considerato comunque
    // "non disponibile" sotto, non un errore da propagare al chiamante.
  }
  return { user: null, authUnavailable: true }
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
export async function getUserFromRequestDetailed(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean }> {
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
    null,
  ))
  if (!user) return null
  return { user, supabase }
}
