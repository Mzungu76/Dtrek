// Confine Navigator/Dtrek, direzione Dtrek → Navigator (docs/navigator-dtrek-boundary.md): ogni
// pulsante "Naviga" dentro Dtrek prova prima ad aprire l'app nativa (se il device può averla),
// e solo se non risponde ricade sul navigatore già esistente via web (app/guida/[id]/naviga,
// app/navigatore/traccia — entrambi già funzionanti in un browser qualunque, LocationSource
// degrada da sola a navigator.geolocation quando Capacitor.isNativePlatform() è false).

// Schema registrato dall'intent-filter di MainActivity (android/app/src/main/AndroidManifest.xml)
// — riapre sempre la Home di Navigator, non instrada verso una schermata specifica: bastava per
// il caso "l'app c'è, aprila", che è tutto ciò che serve qui. Un deep-link verso una schermata
// precisa (es. direttamente sulla traccia di un percorso) resta un miglioramento possibile in
// futuro, non necessario oggi.
const NAVIGATOR_SCHEME_URL = 'dtreknavigator://open'

// Tempo entro cui, se il browser è ancora in primo piano, si assume che nessuna app abbia
// risposto allo schema — né troppo breve (falso negativo su un device lento) né troppo lungo
// (attesa percepibile su chi davvero non ha l'app). Stesso ordine di grandezza usato dai banner
// "apri nell'app" di altri prodotti.
const HANDOFF_TIMEOUT_MS = 1600

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/**
 * Prova ad aprire Dtrek Navigator via il suo schema personalizzato; se entro
 * HANDOFF_TIMEOUT_MS il browser è ancora visibile (nessuna app ha preso il controllo), chiama
 * onNotOpened() perché chi chiama ricada sulla pagina web. Su desktop l'apertura non viene
 * nemmeno tentata — nessun'app nativa può aprirsi da un PC, a prescindere da cosa sia installato
 * su un eventuale telefono dello stesso utente — e si passa dritti al fallback.
 */
export function tryOpenNavigatorApp(onNotOpened: () => void): void {
  if (typeof window === 'undefined' || !isMobileDevice()) {
    onNotOpened()
    return
  }
  let handedOff = false
  const onVisibilityChange = () => { if (document.hidden) handedOff = true }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.location.href = NAVIGATOR_SCHEME_URL
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (!handedOff) onNotOpened()
  }, HANDOFF_TIMEOUT_MS)
}
