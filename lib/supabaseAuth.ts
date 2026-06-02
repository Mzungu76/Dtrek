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
import type { User } from '@supabase/supabase-js'

export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},  // read-only — session refresh happens in middleware
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}
