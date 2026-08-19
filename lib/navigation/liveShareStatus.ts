// DTREK-AUDIT.md P0 #8 — la verifica ha trovato che lo stato "stale" di LiveShareViewer.tsx/
// GroupShareViewer.tsx non controllava MAI l'età reale di last_live_ts, solo se l'ultima chiamata
// fetch fosse fallita: se il telefono dell'escursionista si scarica o l'app crasha, l'API
// pubblica (che legge solo Supabase, non il telefono) continua a rispondere 200 OK con lo stesso
// last_live_ts vecchio all'infinito — nessun avviso, mai. Funzione pura, nessuna chiamata di
// rete, stesso principio di testabilità già seguito per trailConfidence.ts/closureSummary.ts.
export type LiveShareStatus = 'live' | 'stale' | 'critical'

// Oltre la cadenza di scrittura (~15-20s, vedi liveLocationPublish.ts) più un ampio margine per
// buchi GPS/rete temporanei (galleria, bosco fitto) — non deve scattare per una singola scrittura
// mancata.
export const LIVE_STALE_MS = 3 * 60 * 1000

// Un ordine di grandezza oltre STALE — a questo punto è improbabile sia solo un buco temporaneo,
// merita un avviso davvero difficile da ignorare per chi ha la pagina aperta.
export const LIVE_CRITICAL_MS = 15 * 60 * 1000

export function computeLiveStatus(lastUpdateIso: string, nowMs: number = Date.now()): LiveShareStatus {
  const ageMs = nowMs - new Date(lastUpdateIso).getTime()
  if (ageMs >= LIVE_CRITICAL_MS) return 'critical'
  if (ageMs >= LIVE_STALE_MS) return 'stale'
  return 'live'
}
