import { computeSignedSlopeSeries, slopeColorSigned } from '@/lib/slopeColor'
import type { TrackPoint } from '@/lib/tcxParser'

export interface SlopeSegment {
  path: [number, number][] // [lat, lon] pairs, at least 2 points
  color: string
}

/**
 * Buckets the route's recorded track into contiguous same-color stretches for the map's
 * Pendenze (slope) layer — reuses computeSignedSlopeSeries/slopeColorSigned from
 * lib/slopeColor.ts, the exact same functions the elevation profile chart and the trail-detail
 * page's route overlay already use, so a segment reads the same warm-for-climbing/
 * cool-for-descending color here as it does on any other Dtrek screen for that stretch. Points
 * get coalesced into one segment as long as the color doesn't change, so the line renders as a
 * handful of colored stretches rather than one tiny segment per GPS point.
 *
 * Returns null when there isn't enough altitude data to say anything (most imported tracks
 * without elevation, or fewer than 2 usable points).
 */
export function buildSlopeSegments(trackPoints: TrackPoint[]): SlopeSegment[] | null {
  const pts = trackPoints.filter((p) => p.lat != null && p.lon != null && p.altitudeMeters != null)
  if (pts.length < 2) return null

  const slopes = computeSignedSlopeSeries(pts)
  const segments: SlopeSegment[] = []
  let current: SlopeSegment | null = null

  for (let i = 1; i < pts.length; i++) {
    const color = slopeColorSigned(slopes[i])
    const a: [number, number] = [pts[i - 1].lat!, pts[i - 1].lon!]
    const b: [number, number] = [pts[i].lat!, pts[i].lon!]

    if (current && current.color === color) {
      current.path.push(b)
    } else {
      current = { color, path: [a, b] }
      segments.push(current)
    }
  }
  return segments.length > 0 ? segments : null
}
