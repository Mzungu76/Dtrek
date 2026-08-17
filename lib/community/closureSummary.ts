// DTREK-AUDIT.md P0 #5 — segnale di chiusura sentiero, separato dal CommunitySignal esistente
// (lib/trailConditions/communitySignals.ts) perché quello alimenta solo un piccolo bonus positivo
// a Trail Confidence (mai un avviso, mai un abbassamento — vedi il commento in
// lib/navigation/trailConfidence.ts). Una chiusura è un fatto di sicurezza binario che deve poter
// mostrare un vero avviso, con la stessa prominenza già data a turnback/gps_lost in navigazione.
import { filterNoteText } from './moderation'

export type ClosureStatus = 'unknown' | 'open' | 'reported' | 'confirmed'

export interface ClosureSignal {
  status: ClosureStatus
  /** Utenti distinti dietro lo "streak" di chiusura corrente — 0 se open/unknown. */
  reporterCount: number
  lastReportAt: string | null
  /** Motivo del report più recente non vuoto nello streak corrente, già filtrato (filterNoteText). */
  reason: string | null
}

export interface ClosureReportRow {
  user_id: string
  status: 'closed' | 'reopened'
  reason: string | null
  created_at: string
}

const CLOSURE_WINDOW_MS = 120 * 24 * 60 * 60 * 1000 // oltre, un report è considerato scaduto — nessuna chiusura "per sempre" senza nuova conferma
const CONFIRMED_MIN_REPORTERS = 2 // soglia più bassa dei 3 usati per il bonus di fiducia in communitySignals.ts: un fatto di sicurezza merita di emergere prima
const ROWS_SCANNED = 50 // margine ampio: anche in uno streak di chiusura insolitamente lungo, 50 righe bastano a trovare lo start dello streak o il bordo finestra

const UNKNOWN: ClosureSignal = { status: 'unknown', reporterCount: 0, lastReportAt: null, reason: null }

/**
 * Funzione pura — nessuna chiamata di rete — separata dal wrapper I/O sotto per essere testabile
 * senza mock Supabase, stesso principio già seguito per trailConfidence.ts/offRouteEngine.ts.
 *
 * Logica: il report più recente decide la direzione. Se 'reopened', il sentiero è considerato
 * aperto — nessun avviso. Se 'closed', si cammina all'indietro dai più recenti raccogliendo
 * user_id distinti finché non si incontra un 'reopened' precedente (che chiude lo streak di
 * chiusura corrente, i report ancora più vecchi non contano più) o si esce dalla finestra
 * temporale. reporterCount >= 2 distinti ⇒ 'confirmed'; 1 solo ⇒ 'reported' (avviso più cauto,
 * "segnalato, non confermato" — stesso principio di onestà sull'incertezza già applicato al
 * fallback meteo/Trail Confidence).
 */
export function summarizeClosureReports(rows: ClosureReportRow[], nowMs: number = Date.now()): ClosureSignal {
  const windowStart = nowMs - CLOSURE_WINDOW_MS
  const recent = rows
    .filter((r) => new Date(r.created_at).getTime() >= windowStart)
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (recent.length === 0) return UNKNOWN
  if (recent[0].status === 'reopened') {
    return { status: 'open', reporterCount: 0, lastReportAt: recent[0].created_at, reason: null }
  }

  const reporters = new Set<string>()
  let reason: string | null = null
  for (const r of recent) {
    if (r.status === 'reopened') break
    reporters.add(r.user_id)
    if (reason == null && r.reason) reason = r.reason
  }

  return {
    status: reporters.size >= CONFIRMED_MIN_REPORTERS ? 'confirmed' : 'reported',
    reporterCount: reporters.size,
    lastReportAt: recent[0].created_at,
    reason,
  }
}

/** Wrapper I/O — client service-role, mai righe individuali esposte via PostgREST diretto (vedi
 *  add_trail_closure_reports.sql). Non testato per lo stesso motivo per cui non lo è
 *  completionsSummary.ts: nessuna infrastruttura di mock Supabase in questo repo.
 *
 *  Import dinamico di lib/supabase.ts (non in cima al file) — quel modulo istanzia il client
 *  service-role a livello di modulo, che lancia un errore se le variabili d'ambiente Supabase
 *  non sono impostate (vedi il test suite, dove non lo sono). Un import statico costringerebbe
 *  chiunque importi anche solo summarizeClosureReports (la funzione pura sopra) a pagare quel
 *  costo — un import dinamico lo rimanda a quando fetchClosureSummary è davvero chiamata. */
export async function fetchClosureSummary(osmRelationId: number): Promise<ClosureSignal> {
  if (!Number.isFinite(osmRelationId) || osmRelationId <= 0) return UNKNOWN

  const { supabase } = await import('@/lib/supabase')
  const since = new Date(Date.now() - CLOSURE_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('trail_closure_reports')
    .select('user_id, status, reason, created_at')
    .eq('osm_relation_id', osmRelationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(ROWS_SCANNED)
  if (error || !data) return UNKNOWN

  // Ri-filtrato qui, non solo alla scrittura — difesa in profondità (lib/community/moderation.ts),
  // stesso pattern di completionsSummary.ts.
  const rows: ClosureReportRow[] = data.map((row) => ({
    user_id: row.user_id as string,
    status: row.status as 'closed' | 'reopened',
    reason: row.reason && filterNoteText(row.reason as string).ok ? (row.reason as string) : null,
    created_at: row.created_at as string,
  }))

  return summarizeClosureReports(rows)
}
