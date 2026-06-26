// Best-effort spatial matching between a trail's geometry and DTrek's own
// activities/trails rows — there is no real foreign key (no trail_id column
// anywhere), so this approximates "is this the same trail" by sampling the
// trail polyline every ~12 points and checking what fraction of those
// samples lie within 90m of a candidate track.
//
// Only `activities` (real, completed hikes with a true start_time) count
// towards the SI recency bonus — `planned_hikes` is deliberately excluded:
// its `created_at` is just "when the GPX was imported into DTrek", which
// says nothing about whether the trail was actually walked recently, and
// using it inflated the SI of any trail the moment someone imported a GPX
// for it.
import { supabase } from '@/lib/supabase'
import { minDistToTrack, computeBbox } from '@/lib/geoUtils'
import type { SignalContext } from '@/lib/cl/types'

type Bbox = SignalContext['bbox']

const MATCH_THRESHOLD_M = 90
const MATCH_FRACTION_MIN = 0.8
const BBOX_PREFILTER_PAD = 0.02 // ~2km — cheap reject before the per-point haversine scan
const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000
const CANDIDATE_LIMIT = 500

export interface MatchedActivity {
  id: string
  recencyDate: string
  source: 'activity'
}

function sampleEvery<T>(arr: T[], step: number): T[] {
  return arr.filter((_, i) => i % step === 0)
}

function matchFraction(trailSample: [number, number][], candidateTrack: [number, number][]): number {
  if (candidateTrack.length < 2 || trailSample.length === 0) return 0
  let within = 0
  for (const [lat, lon] of trailSample) {
    if (minDistToTrack(lat, lon, candidateTrack) <= MATCH_THRESHOLD_M) within++
  }
  return within / trailSample.length
}

function trackTouchesBbox(track: [number, number][], bbox: Bbox, pad: number): boolean {
  return track.some(([lat, lon]) =>
    lat >= bbox.minLat - pad && lat <= bbox.maxLat + pad &&
    lon >= bbox.minLon - pad && lon <= bbox.maxLon + pad
  )
}

function bboxesOverlap(a: Bbox, b: Bbox, pad: number): boolean {
  return a.minLat - pad <= b.maxLat && a.maxLat + pad >= b.minLat &&
         a.minLon - pad <= b.maxLon && a.maxLon + pad >= b.minLon
}

/**
 * Finds the most recent DTrek activity whose tracked route overlaps the
 * given trail. Bounded to the last 3 years / 500 rows — acceptable at
 * current volume with no PostGIS spatial index; revisit with a real spatial
 * index if the table grows 10-100x and this JS bbox+haversine scan becomes
 * a bottleneck.
 */
export async function findMatchingActivity(
  trailGeometry: [number, number][],
  trailBbox: Bbox,
): Promise<MatchedActivity | null> {
  if (trailGeometry.length < 2) return null

  const sinceIso = new Date(Date.now() - THREE_YEARS_MS).toISOString()
  const trailSample = sampleEvery(trailGeometry, 12)

  const { data } = await supabase.from('activities')
    .select('id, route_polyline, start_time')
    .gte('start_time', sinceIso)
    .order('start_time', { ascending: false })
    .limit(CANDIDATE_LIMIT)

  const candidates: MatchedActivity[] = []

  for (const row of data ?? []) {
    const track = (row.route_polyline ?? []) as [number, number][]
    if (track.length < 2 || !trackTouchesBbox(track, trailBbox, BBOX_PREFILTER_PAD)) continue
    if (matchFraction(trailSample, track) >= MATCH_FRACTION_MIN) {
      candidates.push({ id: row.id, recencyDate: row.start_time, source: 'activity' })
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => new Date(b.recencyDate).getTime() - new Date(a.recencyDate).getTime())
  return candidates[0]
}

const TRAILS_SCAN_PAGE = 1000
const TRAILS_SCAN_MAX_PAGES = 20 // ~20k rows — generous ceiling against a runaway loop, not a real expected size

/**
 * Reverse direction: given a planned hike's polyline (no OSM linkage at
 * all), finds the best-matching cached trail and returns its osm_relation_id.
 * Used only by the `?polyline=` slow path — never imported client-side,
 * since it goes through the service-role client.
 *
 * Two passes against `trails`: first a cheap (id, bbox)-only scan across the
 * *whole* table, paginated past PostgREST's default page cap, since an
 * unordered `.limit()` would otherwise silently drop the real match once the
 * table grows past that cap (no ORDER BY means Postgres row order isn't
 * stable). Only bbox survivors then pay for the heavier geometry fetch.
 */
export async function findTrailForPolyline(polyline: [number, number][]): Promise<number | null> {
  if (polyline.length < 2) return null

  const [minLatS, minLonS, maxLatS, maxLonS] = computeBbox(polyline, BBOX_PREFILTER_PAD).split(',')
  const queryBbox: Bbox = { minLat: Number(minLatS), minLon: Number(minLonS), maxLat: Number(maxLatS), maxLon: Number(maxLonS) }
  const sample = polyline

  const candidateIds: number[] = []
  for (let page = 0; page < TRAILS_SCAN_MAX_PAGES; page++) {
    const offset = page * TRAILS_SCAN_PAGE
    const { data, error } = await supabase
      .from('trails')
      .select('osm_relation_id, bbox')
      .range(offset, offset + TRAILS_SCAN_PAGE - 1)
    if (error) { console.error('[matchTrail] trails bbox scan page', page, 'failed', error); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      const rowBbox = row.bbox as Bbox | null
      if (!rowBbox || bboxesOverlap(rowBbox, queryBbox, BBOX_PREFILTER_PAD)) {
        candidateIds.push(row.osm_relation_id)
      }
    }
    if (data.length < TRAILS_SCAN_PAGE) break
  }
  if (candidateIds.length === 0) return null

  const { data: geomRows } = await supabase
    .from('trails')
    .select('osm_relation_id, geometry_simplified')
    .in('osm_relation_id', candidateIds)

  if (!geomRows) return null

  let best: { id: number; fraction: number } | null = null
  for (const row of geomRows) {
    const track = (row.geometry_simplified ?? []) as [number, number][]
    if (track.length < 2) continue

    const fraction = matchFraction(sample, track)
    if (fraction >= MATCH_FRACTION_MIN && (!best || fraction > best.fraction)) {
      best = { id: row.osm_relation_id, fraction }
    }
  }
  return best?.id ?? null
}
