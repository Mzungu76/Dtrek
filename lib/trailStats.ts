// Cascading fallback for trail statistics when OSM relation tags
// (distance/ascent/descent) are missing. Pure calculation only — no Supabase
// access here, see lib/trailsCache.ts for persistence.

export function haversineKm(p1: [number, number], p2: [number, number]): number {
  const R = 6371
  const [lat1, lon1] = p1
  const [lat2, lon2] = p2
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function totalDistanceKm(points: [number, number][]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i])
  return total
}

// Picks points spaced ~intervalM apart along the track — keeps elevation API
// payloads small and the cached geometry lightweight, without losing shape.
export function sampleEveryNMeters(points: [number, number][], intervalM: number): [number, number][] {
  if (points.length === 0) return []
  const sampled: [number, number][] = [points[0]]
  let sinceLastSample = 0
  for (let i = 1; i < points.length; i++) {
    sinceLastSample += haversineKm(points[i - 1], points[i]) * 1000
    if (sinceLastSample >= intervalM) {
      sampled.push(points[i])
      sinceLastSample = 0
    }
  }
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) sampled.push(last)
  return sampled
}

interface Bbox { minLat: number; maxLat: number; minLon: number; maxLon: number }

// Last-resort estimate when there's no usable geometry: distance from the bbox
// diagonal scaled by a sinuosity factor (trails are never a straight line),
// elevation gain from a generic hiking-terrain ratio (~40m gain per km).
export function estimateStats(bbox: Bbox): { distanceKm: number; elevationGain: number; confidence: 'estimated' } {
  const diagonalKm = haversineKm([bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon])
  const distanceKm = diagonalKm * 1.3
  const elevationGain = Math.round(distanceKm * 40)
  return { distanceKm, elevationGain, confidence: 'estimated' }
}

export function boundingBox(points: [number, number][]): Bbox {
  const lats = points.map(p => p[0])
  const lons = points.map(p => p[1])
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }
}

export interface ElevationProfilePoint { lat: number; lon: number; ele: number }

// Builds a plausible-looking elevation profile when no real samples are available:
// a drift term carries the net gain/loss across the route, an oscillation on top
// gives computeVtopo's slope-variance scoring a "varied terrain" signal instead of
// a flat line or an unrealistic single smooth hill.
export function buildSyntheticProfile(
  sampled: [number, number][],
  totalGainM: number,
  totalLossM: number,
): ElevationProfilePoint[] {
  if (sampled.length === 0) return []
  if (sampled.length === 1) return [{ lat: sampled[0][0], lon: sampled[0][1], ele: 0 }]

  const totalDistKm = totalDistanceKm(sampled)
  if (totalDistKm === 0) return sampled.map(([lat, lon]) => ({ lat, lon, ele: 0 }))

  const numOsc = Math.min(6, Math.max(2, Math.round(sampled.length / 6)))
  const netDrift = totalGainM - totalLossM
  const amplitude = (totalGainM + totalLossM) / 2 / numOsc

  const profile: ElevationProfilePoint[] = [{ lat: sampled[0][0], lon: sampled[0][1], ele: 0 }]
  let cumDistKm = 0
  for (let i = 1; i < sampled.length; i++) {
    cumDistKm += haversineKm(sampled[i - 1], sampled[i])
    const frac = cumDistKm / totalDistKm
    const ele = netDrift * frac + amplitude * Math.sin(2 * Math.PI * numOsc * frac)
    profile.push({ lat: sampled[i][0], lon: sampled[i][1], ele: Math.round(ele) })
  }
  return profile
}

// Walks the dense route geometry (used for map drawing) and the sparser profile
// samples (~200m apart) in lockstep by cumulative distance, linearly interpolating
// an elevation for every dense point — both arrays follow the same path, just at
// different resolutions.
export function interpolateElevations(
  densePoints: [number, number][],
  profile: ElevationProfilePoint[],
): number[] {
  if (profile.length === 0) return densePoints.map(() => 0)
  if (profile.length === 1 || densePoints.length === 0) return densePoints.map(() => profile[0].ele)

  const profDist: number[] = [0]
  for (let i = 1; i < profile.length; i++) {
    profDist.push(profDist[i - 1] + haversineKm([profile[i - 1].lat, profile[i - 1].lon], [profile[i].lat, profile[i].lon]))
  }

  const result: number[] = []
  let segIdx = 0
  let cumDist = 0
  for (let i = 0; i < densePoints.length; i++) {
    if (i > 0) cumDist += haversineKm(densePoints[i - 1], densePoints[i])
    while (segIdx < profDist.length - 2 && profDist[segIdx + 1] < cumDist) segIdx++
    const d0 = profDist[segIdx]
    const d1 = profDist[segIdx + 1] ?? d0
    const t  = d1 > d0 ? Math.min(1, Math.max(0, (cumDist - d0) / (d1 - d0))) : 0
    const e0 = profile[segIdx].ele
    const e1 = profile[Math.min(segIdx + 1, profile.length - 1)].ele
    result.push(Math.round(e0 + (e1 - e0) * t))
  }
  return result
}

// Samples the track every ~200m against OpenTopoData (SRTM 90m), more
// datacenter-friendly than open-elevation.com. Falls back to a bbox-based
// estimate on any failure or timeout — never throws, never leaves the
// caller without a number.
export async function getElevationProfile(points: [number, number][]): Promise<{
  elevationGain: number
  elevationLoss: number
  altitudeMax: number | null
  altitudeMin: number | null
  profile: ElevationProfilePoint[]
  source: 'opentopodata' | 'estimated'
}> {
  if (points.length < 2) return { elevationGain: 0, elevationLoss: 0, altitudeMax: null, altitudeMin: null, profile: [], source: 'estimated' }

  const sampled = sampleEveryNMeters(points, 200)

  try {
    const locations = sampled.map(([lat, lon]) => `${lat},${lon}`).join('|')
    const res = await fetch('https://api.opentopodata.org/v1/srtm90m', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json: { results?: Array<{ elevation: number | null }> } = await res.json()
    const elevations = (json.results ?? []).map(r => r.elevation).filter((e): e is number => e != null)
    if (elevations.length < 2) throw new Error('elevation data insufficient')

    let gain = 0, loss = 0
    for (let i = 1; i < elevations.length; i++) {
      const d = elevations[i] - elevations[i - 1]
      if (d > 0) gain += d
      else loss += Math.abs(d)
    }
    return {
      elevationGain: Math.round(gain),
      elevationLoss: Math.round(loss),
      altitudeMax: Math.round(Math.max(...elevations)),
      altitudeMin: Math.round(Math.min(...elevations)),
      profile: sampled.slice(0, elevations.length).map(([lat, lon], i) => ({ lat, lon, ele: Math.round(elevations[i]) })),
      source: 'opentopodata',
    }
  } catch {
    const estimate = estimateStats(boundingBox(points))
    // No real samples here, just a bbox-distance guess — altitude min/max would
    // be pure fiction, so leave them null rather than fabricate a number. The
    // profile shape, on the other hand, is still useful for the elevation chart
    // and for computeTEI's slope-variance scoring, so synthesize a plausible one.
    return {
      elevationGain: estimate.elevationGain,
      elevationLoss: estimate.elevationGain,
      altitudeMax: null,
      altitudeMin: null,
      profile: buildSyntheticProfile(sampled, estimate.elevationGain, estimate.elevationGain),
      source: 'estimated',
    }
  }
}

// Naismith's rule adapted for hiking: base walking pace + 10min per 100m of climb.
export function estimateTimeMinutes(distanceKm: number, elevationGain: number): number {
  const walkingSpeedKmh = 4
  const timeForDistance = (distanceKm / walkingSpeedKmh) * 60
  const timeForClimbing = elevationGain / 10
  return Math.round(timeForDistance + timeForClimbing)
}

export function detectRouteType(points: [number, number][]): 'loop' | 'out_and_back' | 'point_to_point' {
  if (points.length < 2) return 'point_to_point'
  const start = points[0]
  const end = points[points.length - 1]
  const closureDistanceM = haversineKm(start, end) * 1000
  if (closureDistanceM < 200) return 'loop'
  // out-and-back detection (track doubling back on itself) is a nice-to-have, not implemented
  return 'point_to_point'
}
