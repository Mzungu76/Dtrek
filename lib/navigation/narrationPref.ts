// DTREK-AUDIT.md P4 #38 — l'unico interruttore vocale esistente (speechEnabled in
// ActiveNavigationView.tsx) è tutto-o-niente: spegnerlo silenzia anche gli avvisi di sicurezza
// (fuori percorso, direzione sbagliata, GPS assente, batteria scarica, luce insufficiente per il
// rientro — tutti a priorità 'critical' o comunque operativi, mai narrazione). Non c'era modo di
// tenere accesi quegli avvisi e spegnere solo il "di più" — narrazione POI (engine.on('enteredPoi'))
// e i momenti raccontati da Giulia (engine.on('momentReached')), gli unici due eventi puramente
// narrativi, non di sicurezza. Preferenza indipendente, non sovrapposta a speechEnabled: se
// speechEnabled è spento nulla parla comunque, come oggi; se acceso, questa decide solo se la parte
// "di più" (POI/Giulia) si aggiunge o no agli avvisi operativi.
//
// Default true = narrazione attiva, cioè lo stesso comportamento di sempre per chi non tocca
// l'interruttore — nessun cambio silenzioso per chi già usa l'app. localStorage semplice (non
// l'outbox di sync), stesso principio già seguito da highContrastPref.ts: preferenza legata al
// dispositivo/momento d'uso, non un dato da portare tra dispositivi diversi.
const KEY = 'dtrek_nav_narration'

export function readNarrationPref(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

export function writeNarrationPref(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, enabled ? '1' : '0')
  } catch {
    // Storage non disponibile (navigazione privata/quota esaurita) — il toggle resta valido solo
    // per la sessione corrente, non è un errore da segnalare.
  }
}
