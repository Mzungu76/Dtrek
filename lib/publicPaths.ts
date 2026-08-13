// Paths that never require a session — static assets, auth pages, public share links. Shared by
// middleware.ts (server-side redirect gate) and components/SessionKeepAlive.tsx (client-side
// redirect gate) so the two never disagree about what's public.
const AUTH_PATHS = ['/login', '/signup', '/auth/']
// /prezzi è una pagina di marketing pubblica (docs/navigator-dtrek-boundary.md) — un visitatore
// non loggato deve poter vedere i prezzi; il checkout stesso richiede comunque una sessione
// (CheckoutButton.tsx rimanda al login solo al click, non prima).
const PUBLIC_PAGES = ['/prezzi']

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/leggi/') ||
    /\.(ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?|mjs)$/.test(pathname) ||
    AUTH_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
}

/**
 * Sottoinsieme più stretto di `isPublicPath`: solo le pagine di contenuto condiviso che un
 * visitatore anonimo apre da un link (`/s/…`, `/leggi/…`), non anche `/login`, `/api/…` o gli
 * asset statici. Usato da AppChrome (components/AppChrome.tsx) per decidere quali pezzi
 * dell'infrastruttura dell'app — splash screen, service worker, motore di sincronizzazione,
 * gate di onboarding… — non hanno senso su una pagina pubblica e andrebbero solo a intralciare
 * o confondere un visitatore che magari l'app non l'ha nemmeno mai aperta.
 */
export function isSharedContentPath(pathname: string): boolean {
  return pathname.startsWith('/s/') || pathname.startsWith('/leggi/')
}
