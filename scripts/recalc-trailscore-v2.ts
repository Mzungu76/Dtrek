/**
 * One-time recalculation: forza il ricalcolo dell'Affidabilita (CL) di OGNI percorso pianificato
 * con la correzione di densita dati (lib/cl/signals/densitySignal.ts), poi ricalcola l'aggregato
 * Trail Score v2 (lib/trailScoreV2.ts) combinando quell'Affidabilita fresca con Sicurezza/Comfort
 * TrailScore/Ombra&Acqua gia cachati (quelle formule non sono cambiate, quindi si leggono cosi
 * come sono — non vengono ricalcolate da zero).
 *
 * A differenza di scripts/backfill-planned-si.ts (che processa solo le righe MAI calcolate
 * prima), questo script processa TUTTE le righe, azzerando le scadenze TTL invece di usare
 * opts.force: force ha un cooldown di 24h pensato per il pulsante utente "Aggiorna CL" (vedi
 * lib/cl/computeCL.ts's FORCE_REFRESH_COOLDOWN_MS), che non ha senso per un ricalcolo
 * amministrativo una tantum dopo un cambio di formula.
 *
 * Percorsi con osm_relation_id condividono la cache `trails` — vengono ricalcolati una sola volta
 * per relation id anche se piu percorsi pianificati puntano allo stesso sentiero, invece di
 * rifare le stesse chiamate Overpass/GBIF/iNaturalist/Open-Meteo/Planetary Computer piu volte.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/recalc-trailscore-v2.ts [--dry-run]
 */
import { supabase } from '../lib/supabase'
import { computeCL, computeCLForPlannedHike } from '../lib/cl/computeCL'
import type { CLResult } from '../lib/cl/types'
import { computeTrailScoreV2 } from '../lib/trailScoreV2'
import { computeBbox } from '../lib/geoUtils'

const DRY_RUN = process.argv.includes('--dry-run')
const PAGE_SIZE = 100

interface PlannedRow {
  id: string
  route_polyline: [number, number][] | null
  distance_meters: number | null
  elevation_gain: number | null
  elevation_loss: number | null
  osm_relation_id: number | null
  cached_safety_score: { overall: number } | null
  cached_trail_score: number | null
  s2_shade_score: number | null
}

async function fetchPage(offset: number): Promise<PlannedRow[]> {
  const { data, error } = await supabase
    .from('planned_hikes')
    .select('id, route_polyline, distance_meters, elevation_gain, elevation_loss, osm_relation_id, cached_safety_score, cached_trail_score, s2_shade_score')
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error
  return (data ?? []) as PlannedRow[]
}

async function clearPlannedSiTimestamps(id: string) {
  const { error } = await supabase
    .from('planned_hikes')
    .update({ si_static_computed_at: null, si_dynamic_computed_at: null, si_satellite_computed_at: null })
    .eq('id', id)
  if (error) throw error
}

async function clearTrailsSiTimestamps(osmRelationId: number) {
  const { error } = await supabase
    .from('trails')
    .update({ si_static_computed_at: null, si_dynamic_computed_at: null, si_satellite_computed_at: null })
    .eq('osm_relation_id', osmRelationId)
  if (error) throw error
}

// Cache in-process per osm_relation_id — piu percorsi pianificati possono puntare allo stesso
// sentiero condiviso (`trails`), non ha senso ricalcolarlo piu volte nella stessa run.
const trailClCache = new Map<number, CLResult>()

async function recomputeCl(row: PlannedRow): Promise<CLResult> {
  if (row.osm_relation_id != null) {
    const cached = trailClCache.get(row.osm_relation_id)
    if (cached) return cached
    await clearTrailsSiTimestamps(row.osm_relation_id)
    const result = await computeCL(row.osm_relation_id)
    trailClCache.set(row.osm_relation_id, result)
    return result
  }
  await clearPlannedSiTimestamps(row.id)
  const polyline = row.route_polyline!
  const distanceKm = row.distance_meters != null ? row.distance_meters / 1000 : null
  const [minLat, minLon, maxLat, maxLon] = computeBbox(polyline, 0.005).split(',').map(Number)
  return computeCLForPlannedHike(row.id, polyline, { minLat, minLon, maxLat, maxLon }, distanceKm, row.elevation_gain, row.elevation_loss)
}

async function processRow(row: PlannedRow) {
  const polyline = row.route_polyline
  if (!polyline || polyline.length < 2) {
    console.log(`  [skip] ${row.id} — nessun route_polyline`)
    return
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${row.id} → forzerebbe il ricalcolo CL${row.osm_relation_id != null ? ` (trails condivisa, osm_relation_id=${row.osm_relation_id})` : ' (standalone)'}`)
    return
  }

  const cl = await recomputeCl(row)

  const shadeWaterValue = row.s2_shade_score != null ? row.s2_shade_score * 100 : null
  const ts = computeTrailScoreV2({
    cts: row.cached_trail_score ?? null,
    ombraAcqua: shadeWaterValue,
    safety: row.cached_safety_score?.overall ?? null,
    affidabilita: cl.si,
    // Nessuna temperatura prevista qui (non e uno specifico giorno di escursione live) — Trail
    // Score v2 degrada correttamente ai pesi statici (0.78/0.22), stesso comportamento che
    // avrebbe app/guida/useForecastTemp.ts se non trovasse una data pianificata valida.
  })

  const densityNote = `Affidabilita ${cl.siRaw}→${cl.si} (fattore densita ${cl.dataDensityFactor.toFixed(2)})`
  if (ts) {
    const { error } = await supabase.from('planned_hikes').update({ cached_ts_total: ts.score }).eq('id', row.id)
    if (error) { console.error(`  [ts-persist-error] ${row.id}`, error); return }
    console.log(`  [done] ${row.id} — ${densityNote}, TS v2 = ${ts.score.toFixed(1)}`)
  } else {
    console.log(`  [parziale] ${row.id} — ${densityNote}, TS v2 non calcolabile (manca Sicurezza o Comfort TrailScore gia cachati)`)
  }
}

async function main() {
  let offset = 0
  let total = 0
  while (true) {
    const page = await fetchPage(offset)
    if (page.length === 0) break
    console.log(`Pagina a offset ${offset}: ${page.length} righe`)
    for (const row of page) {
      await processRow(row).catch(err => console.error(`  [error] ${row.id}`, err))
      total++
    }
    offset += PAGE_SIZE
  }
  console.log(`Ricalcolo completato — ${total} riga/e processata/e.${DRY_RUN ? ' (dry-run, nessuna scrittura)' : ''}`)
}

main().catch(err => {
  console.error('Ricalcolo fallito:', err)
  process.exit(1)
})
