export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { getElevationProfile, estimateTimeMinutes } from '@/lib/trailStats'
import { upsertTrailCache, type TrailCacheRow, type RouteType } from '@/lib/trailsCache'

interface StatsRequestBody {
  osmId: number
  name: string
  ref?: string
  network?: string
  sacScale?: string
  caiScale?: string
  description?: string
  from?: string
  to?: string
  operator?: string
  distanceKm: number
  routeType: RouteType
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  geometrySimplified: [number, number][]
}

// Phase 2 of the trail-stats cascade — only called by the client when
// GET /api/waymarked-trails/details came back with statsPending: true (i.e. OSM
// tags were incomplete). Runs the slow OpenTopoData elevation lookup, finishes
// the cache row started in phase 1, and returns the finalized stats.
export async function POST(req: NextRequest) {
  let body: StatsRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body invalido' }, { status: 400 })
  }
  if (!body.osmId || !Array.isArray(body.geometrySimplified)) {
    return NextResponse.json({ error: 'osmId e geometrySimplified richiesti' }, { status: 400 })
  }

  const { elevationGain, elevationLoss, altitudeMax, altitudeMin, profile, source } = await getElevationProfile(body.geometrySimplified)
  const dataQuality = source === 'opentopodata' ? 'calculated' : 'estimated'
  const estimatedTimeMin = estimateTimeMinutes(body.distanceKm, elevationGain)

  const row: TrailCacheRow = {
    osmRelationId: body.osmId,
    name: body.name,
    distanceKm: body.distanceKm,
    elevationGain,
    elevationLoss,
    estimatedTimeMin,
    difficulty: body.sacScale,
    routeType: body.routeType,
    operator: body.operator,
    network: body.network,
    bbox: body.bbox,
    geometrySimplified: body.geometrySimplified,
    dataQuality,
    description: body.description,
    fromLabel: body.from,
    toLabel: body.to,
    ref: body.ref,
    caiScale: body.caiScale,
  }
  await upsertTrailCache(row)

  return NextResponse.json({ elevationGain, elevationLoss, altitudeMax, altitudeMin, profile, estimatedTimeMin, dataQuality })
}
