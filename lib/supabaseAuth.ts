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

export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  return getUserCached(request, async () => {
    const supabase = anonClientForRequest(request)
    const { data: { user } } = await supabase.auth.getUser()
    return user ?? null
  })
}

/**
 * Same JWT validation as getUserFromRequest, but also distinguishes "genuinely no/expired
 * session" from "couldn't reach Supabase Auth to check" (e.g. mid-outage) — supabase.auth.getUser()
 * resolves with {user: null, error: AuthRetryableFetchError} on a network failure instead of
 * rejecting, so a caller checking only `if (!user)` can't tell the two apart and would otherwise
 * show "please log in" / "add your API key" during an outage instead of "try again shortly".
 * Bypasses getUserCached (kept simple; only a handful of AI routes use this variant so far) —
 * see components/SessionKeepAlive.tsx for the client-side counterpart of this same distinction.
 */
export async function getUserFromRequestDetailed(request: NextRequest): Promise<{ user: User | null; authUnavailable: boolean }> {
  const supabase = anonClientForRequest(request)
  const { data, error } = await supabase.auth.getUser()
  return { user: data.user ?? null, authUnavailable: !data.user && isAuthRetryableFetchError(error) }
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
  const user = await getUserCached(request, async () => {
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  })
  if (!user) return null
  return { user, supabase }
}
