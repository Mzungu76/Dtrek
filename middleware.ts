import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_PATHS = ['/login', '/signup', '/auth/']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static assets and auth pages without a session check
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?)$/) ||
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

  // getUser() validates the JWT server-side (not just reading the cookie)
  const { data: { user } } = await supabase.auth.getUser()

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
