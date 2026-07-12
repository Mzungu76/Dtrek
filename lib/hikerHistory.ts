// Storico aggregato delle escursioni completate — usato dalla sezione guida "Su misura per te"
// (app/api/guide/route.ts) per far scrivere a Giulia una valutazione di comfort personalizzata,
// vedi lib/hikerProfile.ts per il profilo dichiarato (esperienza/attenzioni/preferenze) usato in
// coppia con questo. SOLO server-side: importa lib/supabase.ts (chiave service-role), non deve
// mai finire in un bundle client — a differenza di lib/hikerProfile.ts, che resta puro/client-safe.
//
// Aggiornamento incrementale (somme + le ultime 5 uscite), non un ricalcolo completo da tutte le
// attività ad ogni escursione — vedi incrementHistoryStatsForNewActivity. Un backfill una tantum
// da tutte le attività già esistenti scatta solo la prima volta che serve e non c'è ancora nulla
// (readOrBackfillHistoryStats/incrementHistoryStatsForNewActivity condividono la stessa logica).
import { supabase } from './supabase'

export interface RecentHikeEntry {
  distanceKm: number
  elevationGainM: number
  durationMin: number
  completedAt: string
}

export interface HikerHistoryStats {
  count: number
  sumDistanceKm: number
  sumElevationGainM: number
  sumDurationMin: number
  maxDistanceKm: number
  maxElevationGainM: number
  /** Ultime escursioni, più recente per prima — al massimo RECENT_MAX. */
  recent: RecentHikeEntry[]
  updatedAt: string
}

const RECENT_MAX = 5

function emptyStats(): HikerHistoryStats {
  return {
    count: 0, sumDistanceKm: 0, sumElevationGainM: 0, sumDurationMin: 0,
    maxDistanceKm: 0, maxElevationGainM: 0, recent: [], updatedAt: new Date().toISOString(),
  }
}

function foldIn(stats: HikerHistoryStats, entry: RecentHikeEntry): HikerHistoryStats {
  return {
    count: stats.count + 1,
    sumDistanceKm: stats.sumDistanceKm + entry.distanceKm,
    sumElevationGainM: stats.sumElevationGainM + entry.elevationGainM,
    sumDurationMin: stats.sumDurationMin + entry.durationMin,
    maxDistanceKm: Math.max(stats.maxDistanceKm, entry.distanceKm),
    maxElevationGainM: Math.max(stats.maxElevationGainM, entry.elevationGainM),
    recent: [entry, ...stats.recent].slice(0, RECENT_MAX),
    updatedAt: new Date().toISOString(),
  }
}

/** Un solo aggregate query su tutte le attività dell'utente — mai più di una volta per utente:
 *  da qui in poi gli aggiornamenti restano incrementali (foldIn), vedi le due funzioni sotto. */
async function backfillFromAllActivities(userId: string): Promise<HikerHistoryStats> {
  const { data } = await supabase
    .from('activities')
    .select('distance_meters, elevation_gain, total_time_seconds, start_time')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })

  const rows = data ?? []
  if (rows.length === 0) return emptyStats()

  let sumDistanceKm = 0, sumElevationGainM = 0, sumDurationMin = 0, maxDistanceKm = 0, maxElevationGainM = 0
  for (const r of rows) {
    const distKm = (r.distance_meters ?? 0) / 1000
    const elev = r.elevation_gain ?? 0
    sumDistanceKm += distKm
    sumElevationGainM += elev
    sumDurationMin += (r.total_time_seconds ?? 0) / 60
    if (distKm > maxDistanceKm) maxDistanceKm = distKm
    if (elev > maxElevationGainM) maxElevationGainM = elev
  }

  const recent: RecentHikeEntry[] = rows.slice(0, RECENT_MAX).map(r => ({
    distanceKm: (r.distance_meters ?? 0) / 1000,
    elevationGainM: r.elevation_gain ?? 0,
    durationMin: (r.total_time_seconds ?? 0) / 60,
    completedAt: r.start_time,
  }))

  return { count: rows.length, sumDistanceKm, sumElevationGainM, sumDurationMin, maxDistanceKm, maxElevationGainM, recent, updatedAt: new Date().toISOString() }
}

async function readStats(userId: string): Promise<HikerHistoryStats | null> {
  const { data } = await supabase.from('user_settings').select('hiker_history_stats').eq('user_id', userId).maybeSingle()
  return (data?.hiker_history_stats as HikerHistoryStats | null) ?? null
}

async function writeStats(userId: string, stats: HikerHistoryStats): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, hiker_history_stats: stats, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[hikerHistory] write failed:', error.message)
}

/** Letto dalla generazione guida (app/api/guide/route.ts) — sola lettura, ma con backfill lazy se
 *  lo storico non è mai stato calcolato (utente con attività registrate prima di questa funzione). */
export async function readOrBackfillHistoryStats(userId: string): Promise<HikerHistoryStats> {
  const existing = await readStats(userId)
  if (existing) return existing
  const backfilled = await backfillFromAllActivities(userId)
  await writeStats(userId, backfilled)
  return backfilled
}

/**
 * Chiamata subito dopo che una nuova escursione completata (Resoconto) è stata salvata — la riga
 * `activities` esiste già a questo punto, quindi un eventuale backfill (storico non ancora
 * calcolato) la include già automaticamente, senza bisogno di un "+1" separato sopra.
 */
export async function incrementHistoryStatsForNewActivity(userId: string, entry: RecentHikeEntry): Promise<void> {
  const existing = await readStats(userId)
  const updated = existing ? foldIn(existing, entry) : await backfillFromAllActivities(userId)
  await writeStats(userId, updated)
}

/** Blocco testuale per il prompt della sezione guida "Su misura per te" — vedi app/api/guide/route.ts. */
export function formatHistoryStatsBlock(stats: HikerHistoryStats): string {
  if (stats.count === 0) return 'Nessuna escursione completata registrata: nessuno storico personale disponibile per il confronto.'

  const avgDistanceKm = stats.sumDistanceKm / stats.count
  const avgElevationGainM = stats.sumElevationGainM / stats.count
  const avgDurationMin = stats.sumDurationMin / stats.count
  const recentAvgDistanceKm = stats.recent.length
    ? stats.recent.reduce((s, r) => s + r.distanceKm, 0) / stats.recent.length
    : avgDistanceKm
  const recentAvgElevationGainM = stats.recent.length
    ? stats.recent.reduce((s, r) => s + r.elevationGainM, 0) / stats.recent.length
    : avgElevationGainM

  return [
    `${stats.count} escursioni completate in totale.`,
    `Media storica: ${avgDistanceKm.toFixed(1)} km, ${Math.round(avgElevationGainM)} m D+, ${Math.round(avgDurationMin)} min di durata.`,
    `Record personale: ${stats.maxDistanceKm.toFixed(1)} km di distanza, ${Math.round(stats.maxElevationGainM)} m D+.`,
    stats.recent.length > 0
      ? `Media delle ultime ${stats.recent.length} uscite: ${recentAvgDistanceKm.toFixed(1)} km, ${Math.round(recentAvgElevationGainM)} m D+ (utile per capire se di recente fa uscite più o meno impegnative della sua media storica).`
      : '',
  ].filter(Boolean).join('\n')
}
