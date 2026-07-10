// Paths that never require a session — static assets, auth pages, public share links. Shared by
// middleware.ts (server-side redirect gate) and components/SessionKeepAlive.tsx (client-side
// redirect gate) so the two never disagree about what's public.
const AUTH_PATHS = ['/login', '/signup', '/auth/']

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/leggi/') ||
    /\.(ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?|mjs)$/.test(pathname) ||
    AUTH_PATHS.some((p) => pathname.startsWith(p))
  )
}
