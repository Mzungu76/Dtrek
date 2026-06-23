/**
 * One-time backfill: compute SI + Sentinel-2 for planned_hikes rows that
 * predate this feature (no osm_relation_id / si_computed_at yet).
 *
 * For each row missing si_computed_at:
 *   - try findTrailForPolyline(routePolyline) → if matched, persist
 *     osm_relation_id and compute against the shared `trails` cache
 *     (computeSI / computeSentinel2 — same as Esplora's fast path).
 *   - if no match, compute standalone against the planned_hikes row itself
 *     (computeSIForPlannedHike / computeSentinel2ForPlannedHike).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-planned-si.ts [--dry-run]
 */
import { supabase } from '../lib/supabase'
import { computeSI, computeSIForPlannedHike } from '../lib/si/computeSI'
import { computeSentinel2, computeSentinel2ForPlannedHike } from '../lib/sentinel2/computeSentinel2'
import { findTrailForPolyline } from '../lib/si/matchTrail'
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
}

async function fetchPendingPage(offset: number): Promise<PlannedRow[]> {
  const { data, error } = await supabase
    .from('planned_hikes')
    .select('id, route_polyline, distance_meters, elevation_gain, elevation_loss, osm_relation_id')
    .is('si_computed_at', null)
    .range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error
  return (data ?? []) as PlannedRow[]
}

async function processRow(row: PlannedRow) {
  const polyline = row.route_polyline
  if (!polyline || polyline.length < 2) {
    console.log(`  [skip] ${row.id} — no route_polyline`)
    return
  }

  let osmRelationId = row.osm_relation_id
  if (osmRelationId == null) {
    osmRelationId = await findTrailForPolyline(polyline).catch(err => {
      console.error(`  [match-error] ${row.id}`, err)
      return null
    })
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${row.id} → ${osmRelationId != null ? `matched osm_relation_id=${osmRelationId}` : 'no match, standalone'}`)
    return
  }

  if (osmRelationId != null) {
    if (row.osm_relation_id == null) {
      const { error } = await supabase.from('planned_hikes').update({ osm_relation_id: osmRelationId }).eq('id', row.id)
      if (error) console.error(`  [persist-error] ${row.id}`, error)
    }
    await computeSI(osmRelationId).catch(err => console.error(`  [si-error] ${row.id}`, err))
    await computeSentinel2(osmRelationId, polyline).catch(err => console.error(`  [s2-error] ${row.id}`, err))
    console.log(`  [done] ${row.id} (osm_relation_id=${osmRelationId})`)
    return
  }

  const distanceKm = row.distance_meters != null ? row.distance_meters / 1000 : null
  const [minLat, minLon, maxLat, maxLon] = computeBbox(polyline, 0.005).split(',').map(Number)
  await computeSIForPlannedHike(row.id, polyline, { minLat, minLon, maxLat, maxLon }, distanceKm, row.elevation_gain, row.elevation_loss)
    .catch(err => console.error(`  [si-error] ${row.id}`, err))
  await computeSentinel2ForPlannedHike(row.id, polyline, distanceKm, row.elevation_gain, row.elevation_loss)
    .catch(err => console.error(`  [s2-error] ${row.id}`, err))
  console.log(`  [done] ${row.id} (standalone, no OSM match)`)
}

async function main() {
  let offset = 0
  let total = 0
  while (true) {
    const page = await fetchPendingPage(offset)
    if (page.length === 0) break
    console.log(`Page at offset ${offset}: ${page.length} rows`)
    for (const row of page) {
      await processRow(row)
      total++
    }
    offset += PAGE_SIZE
  }
  console.log(`Backfill complete — processed ${total} row(s).${DRY_RUN ? ' (dry-run, no writes)' : ''}`)
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
