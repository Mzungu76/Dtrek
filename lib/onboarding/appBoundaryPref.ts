// UX-AUDIT.md P-C1 — nessuna spiegazione, alla primissima apertura, del perché DTrek è due app
// separate (Dtrek web/PWA per pianificare-raccontare-analizzare, DTrek Navigator nativo per
// navigare GPS sul sentiero — docs/navigator-dtrek-boundary.md). Un utente che installa "solo"
// Navigator non capisce perché non trova diario/statistiche/AI; uno che usa solo Dtrek non capisce
// perché la navigazione via web è meno affidabile dell'app nativa. Stesso principio di
// lib/navigation/navOnboardingPref.ts: localStorage semplice, legato al dispositivo/WebView (le
// due app hanno storage isolato per origine, quindi le due chiavi non si toccano mai a vicenda),
// non un dato utente da sincronizzare tra dispositivi — è pura spiegazione, non stato di prodotto.
const DTREK_KEY = 'dtrek_app_boundary_seen_dtrek'
const NAVIGATOR_KEY = 'dtrek_app_boundary_seen_navigator'

function hasSeen(key: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return true
  }
}

function markSeen(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Storage non disponibile (navigazione privata/quota esaurita) — ricomparirà alla prossima
    // sessione, non è un errore da segnalare.
  }
}

export const hasSeenDtrekAppBoundaryInfo = () => hasSeen(DTREK_KEY)
export const markDtrekAppBoundaryInfoSeen = () => markSeen(DTREK_KEY)
export const hasSeenNavigatorAppBoundaryInfo = () => hasSeen(NAVIGATOR_KEY)
export const markNavigatorAppBoundaryInfoSeen = () => markSeen(NAVIGATOR_KEY)
