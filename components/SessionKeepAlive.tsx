'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { isPublicPath } from '@/lib/publicPaths'
import type { User as SupabaseUser, AuthChangeEvent } from '@supabase/supabase-js'

/**
 * Two jobs, both deliberately done client → Supabase directly instead of through Vercel's
 * middleware chain, so neither can ever produce a MIDDLEWARE_INVOCATION_TIMEOUT if Supabase has
 * an outage (see middleware.ts, which no longer makes any Supabase network call, exactly to
 * avoid that failure mode — this component is what makes that safe to do):
 *
 * 1. Merely instantiating the browser client below arms the Supabase JS SDK's own background
 *    auto-refresh timer, which keeps the session cookie's access token from expiring. That used
 *    to be middleware's job (the only place that could rewrite the cookie), which meant every
 *    navigation paid for a network round trip to Supabase Auth — and a slow/unreachable Auth
 *    service could hang the whole app on every route.
 * 2. A getUser() check once per app load, plus an onAuthStateChange subscription for the rest of
 *    the session, catches a session that's genuinely invalid (expired refresh token, signed out
 *    elsewhere) and redirects to /login — the equivalent of what middleware used to do for an
 *    expired/invalid cookie, just moved off the request path. If Supabase is unreachable, this
 *    silently does nothing (no redirect) rather than blocking anything — the app keeps showing
 *    whatever's already loaded/cached instead of breaking for everyone.
 *
 * Mounted once in app/layout.tsx, outside `{children}`, so it never unmounts across client-side
 * navigations — one subscription for the whole session, not one per page.
 */
export default function SessionKeepAlive() {
  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    const supabase = getBrowserSupabase()

    const redirectIfProtected = () => {
      if (isPublicPath(pathnameRef.current)) return
      router.push(`/login?next=${encodeURIComponent(pathnameRef.current)}`)
    }

    supabase.auth.getUser()
      .then(({ data }: { data: { user: SupabaseUser | null } }) => { if (!data.user) redirectIfProtected() })
      .catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') redirectIfProtected()
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
