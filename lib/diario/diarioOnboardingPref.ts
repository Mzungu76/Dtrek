// UX-AUDIT.md P-L1/P-L2 — stesso principio di lib/navigation/navOnboardingPref.ts: una
// preferenza "l'ho già visto" legata al dispositivo (localStorage semplice, non l'outbox di sync),
// non un dato utente da portarsi dietro tra dispositivi diversi.
const KEY = 'dtrek_diario_onboarding_seen'

export function hasSeenDiarioOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markDiarioOnboardingSeen(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Storage non disponibile (navigazione privata/quota esaurita) — ricomparirà alla prossima
    // sessione, non è un errore da segnalare.
  }
}
