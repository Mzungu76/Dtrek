import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserCached } from '@/lib/authTokenCache'

const AUTH_PATHS = ['/login', '/signup', '/auth/']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static assets, auth pages, and public share links without a session check
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/leggi/') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?|mjs)$/) ||
    AUTH_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  // Create a Supabase client that can read and refresh the session cookie
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          // Forward fresh cookies to both the request and the response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // No session cookie at all ⇒ definitely logged out, no need to ask Supabase — redirect
  // straight away without touching the network. This is the common case on a cold PWA launch
  // for a logged-out user, and previously paid for a full getUser() round trip just to learn
  // what the absence of a cookie already told us for free.
  const hasSessionCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (!hasSessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // getSession() only decodes the session already sitting in the cookie (via the SDK's own
  // storage layer) — no network call, which is exactly why Supabase's docs warn not to trust it
  // for anything security-sensitive. That's fine here: this middleware is a UX redirect, not the
  // security boundary (every API route re-validates authoritatively via getUserFromRequest and
  // returns 401 independently of what this middleware decided). It's used purely to read
  // expires_at locally and skip the expensive getUser() network validation for the common case
  // of a token that still has plenty of life left.
  const EXPIRY_BUFFER_S = 60
  let expiresAt: number | null = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    expiresAt = session?.expires_at ?? null
  } catch {
    expiresAt = null
  }

  if (expiresAt != null && expiresAt - EXPIRY_BUFFER_S > Date.now() / 1000) {
    return response
  }

  // Token missing/unparsed or within a minute of (or past) expiry — fall back to the real
  // network validation, which also transparently refreshes the access token cookie via the
  // refresh token if needed (the one thing getSession() above can't do). Same safety net as
  // before: an unreachable/slow Auth service degrades to "let the page load" via the timeout
  // race instead of taking the whole app down, since API routes re-validate independently.
  const TIMED_OUT = Symbol('auth-timeout')
  const result = await Promise.race([
    getUserCached(request, async () => (await supabase.auth.getUser()).data.user),
    new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), 8000)),
  ])

  if (result === TIMED_OUT) {
    console.error(`middleware: supabase.auth.getUser() timed out for ${pathname} — letting the request through`)
    return response
  }

  const user = result

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  // Run on every request that isn't a static Next.js asset
  matcher: ['/((?!_next/static|_next/image).*)'],
}
