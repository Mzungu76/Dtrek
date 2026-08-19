// DTREK-AUDIT.md P1 #20 — nessuna modalità alto contrasto per il sole forte: gli sfondi
// semi-trasparenti dietro il testo di navigazione (bg-black/40-45 in InstructionBanner.tsx/
// NavBottomStrip.tsx), per quanto già rinforzati da un giro di quick win precedente, restano
// insufficienti sotto sole diretto o su uno schermo molto luminoso. Nessun sensore di luce
// ambientale è disponibile alle pagine web in un browser moderno (rimosso ovunque per privacy),
// quindi l'unica strada realistica è un interruttore manuale — stesso pattern già usato per
// "Mantieni lo schermo acceso" nello stesso pannello (NavStatsSheet.tsx).
//
// localStorage semplice, non l'outbox di sync: è una preferenza di visualizzazione legata alle
// condizioni del momento/dello schermo in uso, non un dato utente da portarsi dietro tra
// dispositivi diversi — stesso principio già seguito da components/SpeedChart.tsx/HRChart.tsx
// per la preferenza del layer altimetria.
const KEY = 'dtrek_nav_high_contrast'

export function readHighContrastPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeHighContrastPref(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, enabled ? '1' : '0')
  } catch {
    // Storage non disponibile (navigazione privata/quota esaurita) — il toggle resta valido solo
    // per la sessione corrente, non è un errore da segnalare.
  }
}
