import { haversineM } from '@/lib/geoUtils'

export interface NearbyTrailLabel {
  /** Total length of this trail segment, meters. */
  lengthM: number
  /** A point roughly at the segment's midpoint (nearest actual vertex, not interpolated — precise enough for label placement). */
  midLat: number
  midLon: number
}

/**
 * One label per nearby-trail line. lib/overpass.ts's fetchNearbyTrailPaths already returns one
 * line per distinct OSM way, so this lines up 1:1 with how a reference app like CalTopo labels
 * its own trail network — one length per distinguishable trail segment, not one per raw point.
 */
export function labelNearbyTrail(line: [number, number][]): NearbyTrailLabel {
  let total = 0
  const cumulative = [0]
  for (let i = 1; i < line.length; i++) {
    total += haversineM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1])
    cumulative.push(total)
  }
  const half = total / 2
  let idx = cumulative.findIndex((d) => d >= half)
  if (idx < 0) idx = line.length - 1
  const [midLat, midLon] = line[idx]
  return { lengthM: total, midLat, midLon }
}

export function formatTrailDistance(lengthM: number): string {
  return lengthM >= 1000 ? `${(lengthM / 1000).toFixed(1)} km` : `${Math.round(lengthM)} m`
}
