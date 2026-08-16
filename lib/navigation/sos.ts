// Fase 2 di docs/navigator-orizzonti-roadmap.md — funzioni pure, nessuna dipendenza da React
// né da rete: il chiamante (SosButton.tsx) le usa per costruire i 4 livelli della UI di
// emergenza, letti da un semplice punto GPS già in memoria (mai una chiamata API).
export interface EmergencyFix {
  lat: number
  lon: number
  accuracyM?: number | null
}

export const EMERGENCY_NUMBER = '112'

/** Livello 1 — l'unico canale universalmente affidabile in UE. Apre il dialer, non chiama
 *  direttamente (un tap in più per confermare) — nessun permesso Android invasivo richiesto. */
export function buildEmergencyCallLink(): string {
  return `tel:${EMERGENCY_NUMBER}`
}

/** Livello 2 — esplicitamente best-effort: in molti paesi UE l'SMS al 112 richiede
 *  registrazione preventiva o è riservato a categorie specifiche di utenti, non è garantito
 *  per il pubblico generico. Il chiamante deve etichettarlo come "prova a inviare", mai con la
 *  stessa sicurezza della chiamata. */
export function buildEmergencySmsLink(fix: EmergencyFix | null): string {
  const body = fix
    ? `Ho bisogno di aiuto. Posizione: ${formatCoordinatesForDisplay(fix)} — https://maps.google.com/?q=${fix.lat},${fix.lon}`
    : 'Ho bisogno di aiuto. Posizione non ancora disponibile.'
  return `sms:${EMERGENCY_NUMBER}?body=${encodeURIComponent(body)}`
}

/** Livello 3 — non un'azione, solo testo sempre leggibile (e dettabile a voce) anche se
 *  chiamata/SMS non funzionano per mancanza di segnale. Nessuna quota: non esiste oggi uno
 *  stato React con l'altitudine corrente (solo transitoria nel flusso di tracciamento), non
 *  introdotto qui per restare nello scope di questa fase. */
export function formatCoordinatesForDisplay(fix: EmergencyFix): string {
  const coords = `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`
  return fix.accuracyM != null && Number.isFinite(fix.accuracyM)
    ? `${coords} (±${Math.round(fix.accuracyM)} m)`
    : coords
}
