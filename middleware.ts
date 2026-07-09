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

  // getUser() validates the JWT server-side (not just reading the cookie) — but it's a network
  // call to Supabase Auth on EVERY page navigation, and this middleware has no built-in timeout:
  // if Supabase Auth is slow or briefly unreachable, the request just hangs until the platform
  // itself kills it, surfacing as a 504 MIDDLEWARE_INVOCATION_TIMEOUT for the whole app (every
  // route goes through this same middleware). Racing it against a timeout keeps that failure
  // mode local — a slow/unreachable Auth service degrades to "let the page load" instead of
  // taking the entire app down, since every API route already re-validates the session itself
  // (getUserFromRequest) and returns 401 independently of what this middleware decided.
  //
  // getUserCached also means a page navigation and the burst of API calls it triggers right
  // after (POIs, punteggi, Sentinel-2, …) share one validated result for a few seconds instead
  // of each re-hitting Supabase Auth for the exact same still-valid session cookie.
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
