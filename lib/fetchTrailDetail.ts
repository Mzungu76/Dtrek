import type { TrailResult } from './trailResult'

export interface TrailDetailFetch {
  trail: TrailResult
  statsPending: boolean
  geometrySimplified: [number, number][]
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
  operator?: string
}

// Fetches phase-1 trail detail (distance always resolved, elevation/duration may
// still be pending) and transforms it into a TrailResult. Shared by ExploreMap's
// click-to-select flow and ExploreResultsPanel's card-click flow so both open the
// preview modal with identical data and identical progressive-stats behavior.
export async function fetchTrailDetail(id: number): Promise<TrailDetailFetch> {
  const res = await fetch(`/api/waymarked-trails/details?id=${id}`)
  const det = await res.json()
  if (!res.ok) throw new Error(det.error ?? 'Errore dettagli')

  const polyline: [number, number][] = det.polyline ?? []

  const trail: TrailResult = {
    id: `wmt-${id}`,
    osmId: id,
    name: det.name ?? `Percorso ${id}`,
    from: det.from,
    to: det.to,
    distanceKm: det.distanceKm,
    elevationGain: det.elevationGain ?? null,
    elevationLoss: det.elevationLoss ?? null,
    altitudeMax: det.altitudeMax,
    altitudeMin: det.altitudeMin,
    sacScale: det.sacScale,
    caiScale: det.caiScale,
    ref: det.ref,
    description: det.description,
    network: det.network,
    geometryPolyline: polyline,
    estimatedTimeMin: det.estimatedTimeMin ?? null,
    dataQuality: det.dataQuality ?? null,
    routeType: det.routeType,
    statsPending: !!det.statsPending,
    elevationProfile: det.elevationProfile,
  }

  return {
    trail,
    statsPending: !!det.statsPending,
    geometrySimplified: det.geometrySimplified ?? [],
    bbox: det.bbox ?? null,
    operator: det.operator,
  }
}

// Phase 2: finishes elevation/duration stats for a trail whose phase-1 response
// had `statsPending: true` (cache miss + incomplete OSM tags, needs the slower
// OpenTopoData round trip). Returns null on failure — phase-1 data stays valid,
// stats simply remain pending.
export async function finishTrailStats(
  trail: TrailResult,
  geometrySimplified: [number, number][],
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  operator?: string,
): Promise<TrailResult | null> {
  try {
    const res = await fetch('/api/waymarked-trails/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        osmId: trail.osmId,
        name: trail.name,
        ref: trail.ref,
        network: trail.network,
        sacScale: trail.sacScale,
        caiScale: trail.caiScale,
        description: trail.description,
        from: trail.from,
        to: trail.to,
        operator,
        distanceKm: trail.distanceKm,
        routeType: trail.routeType,
        bbox,
        geometrySimplified,
      }),
    })
    const stats = await res.json()
    if (!res.ok) return null

    return {
      ...trail,
      elevationGain: stats.elevationGain,
      elevationLoss: stats.elevationLoss,
      // OSM relation tags (rare but authoritative when present) win over the
      // SRTM-derived estimate computed here.
      altitudeMax: trail.altitudeMax ?? stats.altitudeMax,
      altitudeMin: trail.altitudeMin ?? stats.altitudeMin,
      estimatedTimeMin: stats.estimatedTimeMin,
      dataQuality: stats.dataQuality,
      statsPending: false,
      elevationProfile: stats.profile,
    }
  } catch {
    return null
  }
}
