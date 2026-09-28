// Confine Navigator/Dtrek, direzione Dtrek → Navigator (docs/navigator-dtrek-boundary.md): ogni
// pulsante "Naviga" dentro Dtrek prova prima ad aprire l'app nativa (se il device può averla),
// e solo se non risponde ricade sul navigatore già esistente via web (app/guida/[id]/naviga,
// app/navigatore/traccia — entrambi già funzionanti in un browser qualunque, LocationSource
// degrada da sola a navigator.geolocation quando Capacitor.isNativePlatform() è false).

// Schema registrato dall'intent-filter di MainActivity (android/app/src/main/AndroidManifest.xml).
// Il parametro `path` porta la WebView di Navigator direttamente sul percorso richiesto invece di
// riaprire sempre e solo la sua Home — verificato dal vivo: passando da una Guida a "Naviga",
// l'app nativa si apriva ma restava sulla Home, obbligando a ritrovare a mano il percorso appena
// scelto. Letto da components/navigation/NavigatorDeepLinkHandler.tsx (App.addListener
// 'appUrlOpen'), montato solo dentro l'app nativa — un path assente, malformato o non tra quelli
// concessi a Navigator (lib/navigatorAllowedPaths.ts) lascia semplicemente la Home come
// destinazione, mai un crash.
const NAVIGATOR_SCHEME = 'dtreknavigator://open'

function buildNavigatorUrl(targetPath: string): string {
  return `${NAVIGATOR_SCHEME}?path=${encodeURIComponent(targetPath)}`
}

// Tempo entro cui, se il browser è ancora in primo piano, si assume che nessuna app abbia
// risposto allo schema — né troppo breve (falso negativo su un device lento) né troppo lungo
// (attesa percepibile su chi davvero non ha l'app). Stesso ordine di grandezza usato dai banner
// "apri nell'app" di altri prodotti.
const HANDOFF_TIMEOUT_MS = 1600

// Dove torna la scheda Dtrek una volta confermato l'handoff verso l'app nativa — mai lasciarla
// ferma sulla pagina da cui è partito il tentativo (che potrebbe anche essere lei stessa il
// navigatore web di fallback, es. se l'utente ci era già arrivato in un giro precedente):
// segnalato live come "rimane appesa la pagina del navigatore web". Resoconti è dove finisce
// comunque per atterrare chi chiude una registrazione, quindi è una destinazione sensata anche
// per chi in realtà stava per navigare un percorso pianificato, non solo per la traccia libera.
const RESOCONTI_PATH = '/resoconto'

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/**
 * Prova ad aprire Dtrek Navigator via il suo schema personalizzato. Se l'app risponde (la scheda
 * finisce in background prima che scada HANDOFF_TIMEOUT_MS), la scheda Dtrek passa a Resoconti —
 * mai lasciata ferma sulla pagina di partenza. Se nessuna app risponde entro il timeout, naviga
 * su fallbackPath (il navigatore via web). Su desktop l'apertura non viene nemmeno tentata —
 * nessun'app nativa può aprirsi da un PC, a prescindere da cosa sia installato su un eventuale
 * telefono dello stesso utente — e si passa dritti al fallback.
 */
export function tryOpenNavigatorApp(router: { push: (path: string) => void }, fallbackPath: string): void {
  if (typeof window === 'undefined' || !isMobileDevice()) {
    router.push(fallbackPath)
    return
  }
  let handedOff = false
  const onVisibilityChange = () => { if (document.hidden) handedOff = true }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.location.href = buildNavigatorUrl(fallbackPath)
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    // Oltre al flag impostato dall'evento, si ricontrolla document.hidden direttamente qui: se
    // Android ha già portato Navigator in primo piano ma l'evento visibilitychange non ha ancora
    // fatto in tempo a essere consegnato al listener (capita, non è garantito sia sincrono),
    // questo secondo controllo evita comunque il doppio esito "app aperta + fallback web aperto
    // sotto".
    if (handedOff || document.hidden) { router.push(RESOCONTI_PATH); return }
    router.push(fallbackPath)
  }, HANDOFF_TIMEOUT_MS)
}
