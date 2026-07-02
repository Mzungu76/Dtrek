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
import type { SupabaseClient, User } from '@supabase/supabase-js'

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
  const supabase = anonClientForRequest(request)
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { user, supabase }
}
