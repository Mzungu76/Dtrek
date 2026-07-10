import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isPublicPath } from '@/lib/publicPaths'

// This middleware makes NO network calls to Supabase — cookie presence is the only gate.
// It used to call supabase.auth.getUser()/getSession() here to validate (and, via getUser(),
// transparently refresh) the session on every navigation. That coupled every single page load to
// Supabase Auth's availability: when Supabase had an outage, the network call hung, and even
// with an internal timeout race the whole app started returning 504 MIDDLEWARE_INVOCATION_TIMEOUT
// for every route, since this middleware runs on all of them (Vercel's own middleware timeout is
// 25s, well above the internal race, yet the 504s still happened in practice — relying on a
// timeout to "contain" a hung network call inside middleware isn't reliable enough).
//
// Token refresh now happens client-side instead (components/SessionKeepAlive.tsx, mounted in
// app/layout.tsx): merely instantiating the browser Supabase client there arms the SDK's own
// background auto-refresh timer, which keeps the cookie's access token from expiring without any
// help from this middleware. And "is this session actually still valid" is checked there too, via
// a client → Supabase getUser() call that's entirely outside Vercel's middleware chain — it can
// fail or hang without ever producing a 504, since it isn't gating a response.
//
// This middleware is therefore purely a UX redirect for the "definitely logged out, no cookie at
// all" case — never the security boundary. Every API route still re-validates authoritatively via
// getUserFromRequest (lib/supabaseAuth.ts) and returns 401 independently of what this decided.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const hasSessionCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (!hasSessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on every request that isn't a static Next.js asset
  matcher: ['/((?!_next/static|_next/image).*)'],
}
