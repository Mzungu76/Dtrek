// Same dual-mode contract as /api/trails/si (?osm_relation_id= fast path,
// ?polyline= slow path with { matched: false } on no match). A full
// Sentinel-2 recompute is expensive (Sentinel-2 snapshot + 12 MODIS monthly
// reads from Microsoft Planetary Computer when the 90-day series cache
// expires), well past a comfortable edge request budget — so when the
// cached row is stale but still usable, this route fires the recompute in
// the background and answers immediately with the stale data tagged
// { stale: true }, the same pattern app/api/pois/route.ts uses for its
// poi_cache writes. A first-ever (no cache) computation still has to be
// awaited since there's nothing to show in the meantime.
import { NextRequest, NextResponse } from 'next/server'
import { computeSentinel2, fetchS2Cache, toSentinel2Data, SERIES_TTL_MS } from '@/lib/sentinel2/computeSentinel2'
import { resolveTrailGeometry } from '@/lib/si/computeSI'
import { findTrailForPolyline } from '@/lib/si/matchTrail'
import type { Sentinel2ApiResponse } from '@/lib/si/types'

const COMPUTE_TIMEOUT_MS = 20000
const MATCH_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
  }

  let osmRelationId: number
  let knownPolyline: [number, number][] | null = null

  if (osmIdParam) {
    if (!/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id non valido' }, { status: 400 })
    }
    osmRelationId = Number(osmIdParam)
  } else {
    let polyline: unknown
    try {
      polyline = JSON.parse(polylineParam as string)
    } catch {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    if (!Array.isArray(polyline) || polyline.length < 2) {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }

    const matchedId = await withTimeout(
      findTrailForPolyline(polyline as [number, number][]),
      MATCH_TIMEOUT_MS,
    ).catch((err) => {
      console.error('[trails/sentinel2] findTrailForPolyline failed or timed out', err)
      return null
    })

    if (!matchedId) {
      const body: Sentinel2ApiResponse = { matched: false }
      return NextResponse.json(body)
    }
    osmRelationId = matchedId
    knownPolyline = polyline as [number, number][]
  }

  try {
    const cache = await fetchS2Cache(osmRelationId)
    const seriesExpired = !cache?.computedAt || Date.now() - new Date(cache.computedAt).getTime() > SERIES_TTL_MS

    if (cache?.available && seriesExpired) {
      resolveTrailGeometry(osmRelationId)
        .then(geometry => {
          const trailPoints = knownPolyline ?? geometry
          if (trailPoints) return computeSentinel2(osmRelationId, trailPoints)
        })
        .catch(() => {})
      return NextResponse.json({ ...toSentinel2Data(osmRelationId, cache), stale: true } satisfies Sentinel2ApiResponse)
    }

    const trailPoints = knownPolyline ?? await resolveTrailGeometry(osmRelationId)
    if (!trailPoints) {
      return NextResponse.json({
        osmRelationId, available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null,
        nbrCurrent: null, eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false,
        landslideRisk: false, shadeScore: null, landscapeVariety: null, waterSources: [],
        phenologyPeakMonth: null, computedAt: null, reason: 'no_geometry',
      } satisfies Sentinel2ApiResponse)
    }

    const result = await withTimeout(computeSentinel2(osmRelationId, trailPoints), COMPUTE_TIMEOUT_MS)
    return NextResponse.json(result satisfies Sentinel2ApiResponse)
  } catch (err) {
    console.error('[trails/sentinel2] computeSentinel2 failed or timed out', err)
    return NextResponse.json({ error: 'Impossibile calcolare i dati Sentinel-2' }, { status: 502 })
  }
}
