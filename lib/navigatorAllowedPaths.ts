// Confine Navigator/Dtrek, modello "un'icona sola" (docs/navigator-dtrek-boundary.md): finché
// l'account non ha esplicitamente attivato Dtrek, l'app nativa Navigator non deve MAI renderizzare
// una schermata Dtrek, per nessuna via — non solo il bottone rimosso in NavigatorMenu.tsx, ma
// qualunque `router.push`/`<Link>` che un componente profondamente annidato provi a fare (wizard di
// onboarding, percorso omaggio, un bottone di errore che rimanda al dettaglio del percorso...).
// Un elenco sparso di correzioni puntuali si è già dimostrato incompleto una volta; questa è la
// lista definitiva e positiva ("cosa È permesso"), fatta rispettare da un solo guardiano
// (components/navigation/NavigatorRouteGuard.tsx) invece di continuare a rincorrere ogni fuga.
const ALLOWED_PREFIXES = ['/navigatore', '/login', '/signup', '/auth/']

// La schermata di navigazione GPS attiva è funzione propria di Navigator (il motore di
// posizionamento nativo), non "una schermata Dtrek" — vive sotto /guida/{id}/naviga solo per
// riuso di codice con l'app principale. Stesso pattern già usato da
// app/components/GlobalBackInterceptor.tsx per lo stesso motivo.
const NAVIGA_PATTERN = /^\/guida\/[^/]+\/naviga$/

export function isNavigatorAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p)) || NAVIGA_PATTERN.test(pathname)
}
