import { haversineM } from '@/lib/geoUtils'

export interface LatLon {
  lat: number
  lon: number
}

export interface NearestMatch<T> {
  candidate: T
  distM: number
}

/** Closest candidate to `target` within thresholdM, or null if none qualify. Generic — does not replace the ad hoc nearest-highway logic in lib/tei.ts:computeVfond. */
export function nearestWithinThreshold<T extends LatLon>(
  target: LatLon,
  candidates: T[],
  thresholdM: number,
): NearestMatch<T> | null {
  let best: NearestMatch<T> | null = null
  for (const candidate of candidates) {
    const distM = haversineM(target.lat, target.lon, candidate.lat, candidate.lon)
    if (distM <= thresholdM && (!best || distM < best.distM)) best = { candidate, distM }
  }
  return best
}

/** Per-segment-center nearest match, e.g. for joining PSInSAR points or DTM samples onto trail segments. */
export function nearestPerSegment<T extends LatLon, S extends LatLon>(
  segmentCenters: S[],
  candidates: T[],
  thresholdM: number,
): (NearestMatch<T> | null)[] {
  return segmentCenters.map(center => nearestWithinThreshold(center, candidates, thresholdM))
}
