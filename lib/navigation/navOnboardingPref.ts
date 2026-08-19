// DTREK-AUDIT.md P2 #26 — nessun onboarding contestuale della UI di navigazione (SOS, vie
// d'uscita, layer, colori POI): il wizard iniziale copre solo il profilo escursionista
// (components/onboarding/OnboardingWizard.tsx), un escursionista scopre questi controlli per la
// prima volta sul sentiero — proprio nel momento peggiore per farlo, non prima che serva davvero.
// localStorage semplice, non l'outbox di sync — stesso principio già usato da
// lib/navigation/highContrastPref.ts: una preferenza "l'ho già visto" legata al dispositivo, non
// un dato utente da portarsi dietro tra dispositivi diversi.
const KEY = 'dtrek_nav_onboarding_seen'

export function hasSeenNavOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markNavOnboardingSeen(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Storage non disponibile (navigazione privata/quota esaurita) — l'onboarding ricomparirà
    // alla prossima sessione, non è un errore da segnalare.
  }
}
