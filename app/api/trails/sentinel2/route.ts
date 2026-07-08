// Same dual-mode contract as /api/trails/cl (?osm_relation_id= fast path,
// ?polyline=&planned_id= slow path). A full Sentinel-2 recompute is
// expensive (Sentinel-2 snapshot + 12 MODIS monthly reads from Microsoft
// Planetary Computer when the 90-day series cache expires), well past a
// comfortable edge request budget — so when the cached row is stale but
// still usable, this route fires the recompute in the background and
// answers immediately with the stale data tagged { stale: true }, the same
// pattern app/api/pois/route.ts uses for its poi_cache writes. A first-ever
// (no cache) computation still has to be awaited since there's nothing to
// show in the meantime.
// When polyline matching finds no OSM trail and planned_id is given, falls
// back to a standalone computation cached on the planned hike itself
// (computeSentinel2ForPlannedHike) — so every planned hike gets Sentinel-2
// data, OSM-backed or not. Without planned_id (legacy callers), no match
// still replies { matched: false } (200, not an error).
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { computeSentinel2, computeSentinel2ForPlannedHike, fetchS2Cache, toSentinel2Data, SERIES_TTL_MS } from '@/lib/sentinel2/computeSentinel2'
import { resolveTrailGeometry } from '@/lib/cl/computeCL'
import { findTrailForPolyline } from '@/lib/cl/matchTrail'
import type { Sentinel2ApiResponse } from '@/lib/cl/types'

const COMPUTE_TIMEOUT_MS = 20000
const MATCH_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')
  const plannedId = req.nextUrl.searchParams.get('planned_id')
  const force = req.nextUrl.searchParams.get('force') === '1'

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
  }

  if (plannedId) {
    const { data: owned } = await supabase
      .from('planned_hikes')
      .select('id')
      .eq('id', plannedId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let osmRelationId: number | null = null
  let polyline: [number, number][] | null = null

  if (osmIdParam) {
    if (!/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id non valido' }, { status: 400 })
    }
    osmRelationId = Number(osmIdParam)
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(polylineParam as string)
    } catch {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    if (!Array.isArray(parsed) || parsed.length < 2) {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    polyline = parsed as [number, number][]

    const matchedId = await withTimeout(
      findTrailForPolyline(polyline),
      MATCH_TIMEOUT_MS,
    ).catch((err) => {
      console.error('[trails/sentinel2] findTrailForPolyline failed or timed out', err)
      return null
    })

    if (matchedId) {
      osmRelationId = matchedId
      if (plannedId) {
        supabase.from('planned_hikes').update({ osm_relation_id: matchedId })
          .eq('id', plannedId).eq('user_id', user.id)
          .then(({ error }) => { if (error) console.error('[trails/sentinel2] failed to persist osm_relation_id', error) })
      }
    }
  }

  try {
    if (osmRelationId != null) {
      const cache = await fetchS2Cache(osmRelationId)
      const seriesExpired = !cache?.computedAt || Date.now() - new Date(cache.computedAt).getTime() > SERIES_TTL_MS

      if (!force && cache?.available && seriesExpired) {
        resolveTrailGeometry(osmRelationId)
          .then(geometry => {
            const trailPoints = polyline ?? geometry
            if (trailPoints) return computeSentinel2(osmRelationId as number, trailPoints)
          })
          .catch(() => {})
        return NextResponse.json({ ...toSentinel2Data(cache, { osmRelationId }), stale: true } satisfies Sentinel2ApiResponse)
      }

      const trailPoints = polyline ?? await resolveTrailGeometry(osmRelationId)
      if (!trailPoints) {
        return NextResponse.json({
          osmRelationId, available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null,
          nbrCurrent: null, eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false,
          landslideRisk: false, shadeScore: null, landscapeVariety: null, waterSources: [],
          phenologyPeakMonth: null, computedAt: null, reason: 'no_geometry',
        } satisfies Sentinel2ApiResponse)
      }

      const result = await withTimeout(computeSentinel2(osmRelationId, trailPoints, { force }), COMPUTE_TIMEOUT_MS)
      return NextResponse.json(result satisfies Sentinel2ApiResponse)
    }

    if (plannedId && polyline) {
      const { data: plannedRow } = await supabase
        .from('planned_hikes')
        .select('distance_meters, elevation_gain, elevation_loss')
        .eq('id', plannedId)
        .eq('user_id', user.id)
        .maybeSingle()
      const distanceKm = plannedRow?.distance_meters != null ? plannedRow.distance_meters / 1000 : null
      const result = await withTimeout(
        computeSentinel2ForPlannedHike(plannedId, polyline, distanceKm, plannedRow?.elevation_gain ?? null, plannedRow?.elevation_loss ?? null, { force }),
        COMPUTE_TIMEOUT_MS,
      )
      return NextResponse.json(result satisfies Sentinel2ApiResponse)
    }

    const body: Sentinel2ApiResponse = { matched: false }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[trails/sentinel2] computeSentinel2 failed or timed out', err)
    return NextResponse.json({ error: 'Impossibile calcolare i dati Sentinel-2' }, { status: 502 })
  }
}
