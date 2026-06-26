// Lightweight, read-only "Condizioni attuali" endpoint. Mirrors the
// trail-resolution contract of /api/trails/cl (?osm_relation_id= fast path,
// ?polyline=&planned_id= slow path) but only runs the two *live* collectors
// (weather + climate) and NEVER writes anything back to Supabase — by design,
// so refreshing current conditions never overwrites the cached CL result.
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { resolveTrailGeometry, resolveGeometryFallback } from '@/lib/cl/computeCL'
import { findTrailForPolyline } from '@/lib/cl/matchTrail'
import { computeBbox } from '@/lib/geoUtils'
import { fetchOsmTags } from '@/lib/cl/signals/osmSignals'
import { collectWeatherSignal } from '@/lib/cl/signals/weatherSignals'
import { collectClimateSignal } from '@/lib/cl/signals/climateSignals'
import type { SignalContext, WeatherSignal, ClimateSignal } from '@/lib/cl/types'

export const maxDuration = 30

const MATCH_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

interface ConditionsResponse {
  weather: WeatherSignal
  climate: ClimateSignal
}

export async function GET(req: NextRequest) {
  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
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

    const matchedId = await withTimeout(findTrailForPolyline(polyline), MATCH_TIMEOUT_MS).catch((err) => {
      console.error('[trails/conditions] findTrailForPolyline failed or timed out', err)
      return null
    })
    if (matchedId) osmRelationId = matchedId
  }

  try {
    // Resolve geometry/bbox the same way computeCL does.
    let geometry: [number, number][] | null = null
    let bbox: SignalContext['bbox'] | null = null
    let distanceKm: number | null = null
    let elevationGain: number | null = null
    let elevationLoss: number | null = null

    if (osmRelationId != null) {
      geometry = await resolveTrailGeometry(osmRelationId)
      if (!geometry) {
        const fallback = await resolveGeometryFallback(osmRelationId)
        geometry = fallback?.geometry ?? null
        bbox = fallback?.bbox ?? null
      }
      const { data: trailRow } = await supabase
        .from('trails')
        .select('bbox, distance_km, elevation_gain, elevation_loss')
        .eq('osm_relation_id', osmRelationId)
        .maybeSingle()
      if (trailRow) {
        bbox = bbox ?? trailRow.bbox ?? null
        distanceKm = trailRow.distance_km
        elevationGain = trailRow.elevation_gain
        elevationLoss = trailRow.elevation_loss
      }
    } else if (polyline) {
      geometry = polyline
    }

    if (!geometry || geometry.length < 2) {
      return NextResponse.json({ error: 'Geometria del sentiero non risolvibile' }, { status: 404 })
    }

    if (!bbox) {
      const [minLat, minLon, maxLat, maxLon] = computeBbox(geometry, 0.005).split(',').map(Number)
      bbox = { minLat, minLon, maxLat, maxLon }
    }

    const tags = osmRelationId != null
      ? await fetchOsmTags(osmRelationId).then(r => r.tags).catch(() => ({}))
      : {}

    const ctx: SignalContext = {
      bbox,
      geometry,
      centroid: { lat: (bbox.minLat + bbox.maxLat) / 2, lon: (bbox.minLon + bbox.maxLon) / 2 },
      distanceKm,
      elevationGain,
      elevationLoss,
      osmTags: tags,
      osmLastModified: null,
      matchedActivity: null,
    }

    const collectorId = osmRelationId ?? 0
    const [weather, climate] = await Promise.all([
      collectWeatherSignal(collectorId, ctx),
      collectClimateSignal(collectorId, ctx),
    ])

    const body: ConditionsResponse = { weather, climate }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[trails/conditions] failed', err)
    return NextResponse.json({ error: 'Impossibile calcolare le condizioni attuali' }, { status: 502 })
  }
}
