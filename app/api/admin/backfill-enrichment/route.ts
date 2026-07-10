/**
 * Precomputes and persists DTM profile, terrain profile, protected-area check and flora for
 * planned_hikes imported before that persistence existed (see app/guida/useDtmProfile.ts,
 * useTerrainProfile.ts, useProtectedAreaCheck.ts, lib/useFlora.ts) — those hikes currently only
 * get this data on their first live open after the fix, paying the full live-compute cost once.
 * Running this warms the cache proactively instead, so even the FIRST open after deploy is fast.
 *
 * Processes hikes missing at least one of the four, most-recently-created first (most likely to
 * be reopened soon) — same order rationale as the rest of the app's stale-while-revalidate
 * priorities. Batched (default 10 per call, capped at 50) to stay inside Vercel's function
 * duration limit; call repeatedly (or with ?dry=true first to see how many remain) until
 * `remaining` reaches 0.
 *
 * Protezione: richiede ?secret=<prime 32 char di SUPABASE_SERVICE_ROLE_KEY>, stesso pattern di
 * app/api/admin/seed-n2000/route.ts.
 * Chiama: GET /api/admin/backfill-enrichment?secret=<secret>&dry=true   (anteprima, nessuna scrittura)
 * Chiama: GET /api/admin/backfill-enrichment?secret=<secret>&limit=10  (elabora fino a 10 escursioni)
 */
import { supabase } from '@/lib/supabase'
import { timingSafeCompare } from '@/lib/timingSafeCompare'
import { computeTrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { computeTrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { fetchNatura2000PolygonsCached } from '@/lib/natura2000/natura2000Cache'
import { pointInPolygon, geometryOverlapsBbox } from '@/lib/geo/pointInPolygon'
import { fetchFloraAlongRoute } from '@/lib/overpassFlora'
import { computeBbox, hashTrack } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'

export const maxDuration = 60
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

const MISSING_ANY = 'dtm_profile.is.null,terrain_profile.is.null,cached_in_protected_area.is.null,flora_result.is.null'

interface Row {
  id: string
  track_points: TrackPoint[] | null
  altitude_max: number | null
  dtm_profile: unknown
  terrain_profile: unknown
  cached_in_protected_area: boolean | null
  flora_result: unknown
}

async function checkProtectedAreaServer(gps: [number, number][]): Promise<boolean> {
  const bbox = computeBbox(gps)
  const features = await fetchNatura2000PolygonsCached(bbox)
  if (features.length === 0) return false
  const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
  return features.some(f =>
    geometryOverlapsBbox(f.geometry, minLat, minLon, maxLat, maxLon) &&
    gps.some(([lat, lon]) => pointInPolygon(lat, lon, f.geometry))
  )
}

async function backfillOne(row: Row): Promise<{ id: string; updated: string[]; error?: string }> {
  const gps = (row.track_points ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
  if (gps.length < 2) return { id: row.id, updated: [], error: 'traccia GPS insufficiente' }

  const hash = hashTrack(gps)
  const patch: Record<string, unknown> = {}
  const updated: string[] = []
  const now = new Date().toISOString()

  if (row.dtm_profile == null) {
    try {
      const profile = await computeTrailDtmProfile(gps)
      if (profile.source === 'dtm') {
        patch.dtm_profile = profile; patch.dtm_track_hash = hash; patch.dtm_computed_at = now
        updated.push('dtm')
      }
    } catch { /* leave for a future live open to retry */ }
  }

  if (row.terrain_profile == null) {
    try {
      const profile = await computeTrailTerrainProfile(gps)
      if (profile.source === 'geoportale') {
        patch.terrain_profile = profile; patch.terrain_track_hash = hash; patch.terrain_computed_at = now
        updated.push('terrain')
      }
    } catch { /* leave for a future live open to retry */ }
  }

  if (row.cached_in_protected_area == null) {
    try {
      const inProtectedArea = await checkProtectedAreaServer(gps)
      patch.cached_in_protected_area = inProtectedArea; patch.cached_protected_area_track_hash = hash; patch.cached_protected_area_computed_at = now
      updated.push('protected-area')
    } catch { /* leave for a future live open to retry */ }
  }

  if (row.flora_result == null) {
    try {
      const bbox = computeBbox(gps, 0.005)
      const flora = await fetchFloraAlongRoute(bbox, row.altitude_max ?? undefined)
      if (flora.available) {
        patch.flora_result = flora; patch.flora_track_hash = hash; patch.flora_computed_at = now
        updated.push('flora')
      }
    } catch { /* leave for a future live open to retry */ }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('planned_hikes').update(patch).eq('id', row.id)
    if (error) return { id: row.id, updated: [], error: error.message }
  }

  return { id: row.id, updated }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const expected = serviceKey.slice(0, 32)
  if (!expected || !timingSafeCompare(searchParams.get('secret') ?? '', expected)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const dryRun = searchParams.get('dry') === 'true'
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT))

  const { count: remaining } = await supabase
    .from('planned_hikes')
    .select('id', { count: 'exact', head: true })
    .or(MISSING_ANY)

  if (dryRun) {
    return Response.json({ dry_run: true, remaining: remaining ?? 0, next_batch_size: limit })
  }

  const { data, error } = await supabase
    .from('planned_hikes')
    .select('id, track_points, altitude_max, dtm_profile, terrain_profile, cached_in_protected_area, flora_result')
    .or(MISSING_ANY)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const results = []
  for (const row of (data ?? []) as Row[]) {
    results.push(await backfillOne(row))
  }

  return Response.json({
    processed: results.length,
    results,
    remaining_before_this_batch: remaining ?? 0,
  })
}
