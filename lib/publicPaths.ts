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
    // /u/[slug] — il sito personale pubblico (lib/publicProfile.ts): come /s/ e /leggi/, un link
    // aperto da chi non ha mai avuto una sessione DTrek. Era assente qui per svista — l'effetto
    // reale (verificato leggendo questo stesso middleware) era che QUALUNQUE visitatore anonimo
    // che apriva un link /u/[slug] veniva rimandato dritto a /login invece di vedere il profilo:
    // l'intera funzione "sito personale pubblico" era irraggiungibile da chi non aveva già un
    // account con un cookie di sessione valido, cioè dall'unico pubblico per cui esiste.
    pathname.startsWith('/u/') ||
    /\.(ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?|mjs)$/.test(pathname) ||
    AUTH_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
}

/**
 * Sottoinsieme più stretto di `isPublicPath`: solo le pagine di contenuto condiviso che un
 * visitatore anonimo apre da un link (`/s/…`, `/leggi/…`, `/u/…`), non anche `/login`, `/api/…` o
 * gli asset statici. Usato da AppChrome (components/AppChrome.tsx) per decidere quali pezzi
 * dell'infrastruttura dell'app — splash screen, service worker, motore di sincronizzazione,
 * gate di onboarding… — non hanno senso su una pagina pubblica e andrebbero solo a intralciare
 * o confondere un visitatore che magari l'app non l'ha nemmeno mai aperta.
 */
export function isSharedContentPath(pathname: string): boolean {
  return pathname.startsWith('/s/') || pathname.startsWith('/leggi/') || pathname.startsWith('/u/')
}
