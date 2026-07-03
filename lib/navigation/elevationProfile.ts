import { haversineM } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'

export interface ElevationProfilePoint {
  distanceAlongRouteM: number
  altitudeM: number
}

export interface ElevationDelta {
  gainM: number
  lossM: number
}

/** Cumulative distance/altitude profile from the route's trackPoints — same cumulative-distance
 * pattern as routeMoments.ts's detectRouteMoments, reused here so paceAssistant.ts can look up
 * remaining/traveled elevation without re-walking the whole track on every GPS fix. */
export function buildElevationProfile(trackPoints: TrackPoint[]): ElevationProfilePoint[] {
  const pts = trackPoints.filter((p) => p.lat != null && p.lon != null && p.altitudeMeters != null)
  if (pts.length < 2) return []

  const profile: ElevationProfilePoint[] = [{ distanceAlongRouteM: 0, altitudeM: pts[0].altitudeMeters! }]
  let cumulativeM = 0
  for (let i = 1; i < pts.length; i++) {
    cumulativeM += haversineM(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!)
    profile.push({ distanceAlongRouteM: cumulativeM, altitudeM: pts[i].altitudeMeters! })
  }
  return profile
}

function sumElevation(profile: ElevationProfilePoint[], fromIdx: number, toIdx: number): ElevationDelta {
  let gainM = 0, lossM = 0
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const delta = profile[i].altitudeM - profile[i - 1].altitudeM
    if (delta > 0) gainM += delta; else lossM += -delta
  }
  return { gainM, lossM }
}

/** First profile index whose distanceAlongRouteM is >= distanceM (profile is monotonic increasing). */
function indexAtDistance(profile: ElevationProfilePoint[], distanceM: number): number {
  let lo = 0, hi = profile.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (profile[mid].distanceAlongRouteM < distanceM) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Elevation gain/loss remaining between fromDistanceM and the end of the route. */
export function remainingElevation(profile: ElevationProfilePoint[], fromDistanceM: number): ElevationDelta {
  if (profile.length < 2) return { gainM: 0, lossM: 0 }
  return sumElevation(profile, indexAtDistance(profile, fromDistanceM), profile.length - 1)
}

/** Elevation gain/loss already covered between the route start and uptoDistanceM — the basis
 * for the "reverse your steps" return-trip estimate (gain/loss swap on the way back). */
export function traveledElevation(profile: ElevationProfilePoint[], uptoDistanceM: number): ElevationDelta {
  if (profile.length < 2) return { gainM: 0, lossM: 0 }
  return sumElevation(profile, 0, indexAtDistance(profile, uptoDistanceM))
}
