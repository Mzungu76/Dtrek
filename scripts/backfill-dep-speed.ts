/**
 * One-time backfill: compute net cruising speed (netSpeedMs) and pause time
 * (pauseTimeSeconds) for activities that predate this feature.
 *
 * DEP (Distanza Equivalente in Piano) is NOT backfilled here: it's derived
 * on the fly from distanceMeters/elevationGain (lib/stats.ts computeDEP)
 * and isn't a stored column, so every existing activity already "has" it.
 *
 * IEV is NOT backfilled: it requires the original GPX/TCX altitude profile
 * at full resolution, which isn't preserved for historical track_points
 * (downsampled on save). It stays null for activities recorded before this
 * feature shipped — accepted behavior per the implementation plan.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-dep-speed.ts [--dry-run]
 */
import { supabase } from '../lib/supabase'
import { computeMovingStats, type TrackPoint } from '../lib/tcxParser'

const DRY_RUN = process.argv.includes('--dry-run')
const PAGE_SIZE = 100

interface ActivityRow {
  id: string
  track_points: TrackPoint[] | null
  distance_meters: number | null
  total_time_seconds: number | null
}

async function fetchPendingPage(offset: number): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, track_points, distance_meters, total_time_seconds')
    .is('net_speed_ms', null)
    .range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error
  return (data ?? []) as ActivityRow[]
}

async function processRow(row: ActivityRow) {
  const trackPoints = row.track_points ?? []
  if (trackPoints.length < 2 || !row.distance_meters || !row.total_time_seconds) {
    console.log(`  [skip] ${row.id} — insufficient data`)
    return
  }

  const { netSpeedMs, pauseTimeSeconds } = computeMovingStats(
    trackPoints, row.distance_meters, row.total_time_seconds,
  )

  if (DRY_RUN) {
    console.log(`  [dry-run] ${row.id} → netSpeedMs=${netSpeedMs.toFixed(3)} pauseTimeSeconds=${pauseTimeSeconds.toFixed(0)}`)
    return
  }

  const { error } = await supabase
    .from('activities')
    .update({ net_speed_ms: netSpeedMs, pause_time_seconds: pauseTimeSeconds })
    .eq('id', row.id)
  if (error) console.error(`  [persist-error] ${row.id}`, error)
  else console.log(`  [done] ${row.id} (netSpeedMs=${netSpeedMs.toFixed(3)}, pauseTimeSeconds=${pauseTimeSeconds.toFixed(0)})`)
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
