import { haversineM } from '@/lib/geoUtils'
import type { RouteProgress } from './types'

/** Local equirectangular projection, accurate enough at trail-segment scale. */
function toLocalXY(lat: number, lon: number, lat0: number): [number, number] {
  const R = 6371000
  return [
    (lon * Math.PI / 180) * Math.cos(lat0 * Math.PI / 180) * R,
    (lat * Math.PI / 180) * R,
  ]
}

interface SegmentHit {
  distM: number
  t: number // 0..1 fraction along the segment
}

function distToSegment(lat: number, lon: number, a: [number, number], b: [number, number]): SegmentHit {
  const lat0 = (a[0] + b[0]) / 2
  const [px, py] = toLocalXY(lat, lon, lat0)
  const [ax, ay] = toLocalXY(a[0], a[1], lat0)
  const [bx, by] = toLocalXY(b[0], b[1], lat0)
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { distM: haversineM(lat, lon, a[0], a[1]), t: 0 }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return { distM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t }
}

/**
 * Tracks progress of a live fix against a route polyline. Unlike a one-shot
 * "distance to nearest segment" check, this keeps state across calls so each
 * new fix only searches a small window around the last known segment index
 * (never a full O(n) rescan) and reports how far along the route the hiker
 * has walked (distanceAlongRouteM), which feeds ETA / remaining-distance UI.
 */
export class RouteTracker {
  private readonly track: [number, number][]
  private readonly cumulativeM: number[] // cumulativeM[i] = distance from track[0] to track[i]
  private lastSegmentIndex = 0
  private readonly searchWindow: number

  constructor(track: [number, number][], searchWindow = 15) {
    this.track = track
    this.searchWindow = searchWindow
    this.cumulativeM = [0]
    for (let i = 1; i < track.length; i++) {
      this.cumulativeM.push(this.cumulativeM[i - 1] + haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]))
    }
  }

  get totalRouteM(): number {
    return this.cumulativeM[this.cumulativeM.length - 1] ?? 0
  }

  update(lat: number, lon: number): RouteProgress {
    if (this.track.length < 2) {
      return { nearestSegmentIndex: 0, distanceToRouteM: Infinity, distanceAlongRouteM: 0, totalRouteM: 0 }
    }
    const lo = Math.max(1, this.lastSegmentIndex - this.searchWindow)
    const hi = Math.min(this.track.length - 1, this.lastSegmentIndex + this.searchWindow)

    let bestIdx = lo, bestHit: SegmentHit = distToSegment(lat, lon, this.track[lo - 1], this.track[lo])
    for (let i = lo + 1; i <= hi; i++) {
      const hit = distToSegment(lat, lon, this.track[i - 1], this.track[i])
      if (hit.distM < bestHit.distM) { bestHit = hit; bestIdx = i }
    }
    this.lastSegmentIndex = bestIdx

    const distanceAlongRouteM = this.cumulativeM[bestIdx - 1] +
      bestHit.t * (this.cumulativeM[bestIdx] - this.cumulativeM[bestIdx - 1])

    return {
      nearestSegmentIndex: bestIdx,
      distanceToRouteM: bestHit.distM,
      distanceAlongRouteM,
      totalRouteM: this.totalRouteM,
    }
  }
}

/** Off-route threshold scales with GPS accuracy so a noisy fix in a canyon doesn't trigger a false alarm. */
export function offRouteThresholdM(accuracyM: number | null | undefined): number {
  const base = 50
  if (accuracyM == null || !Number.isFinite(accuracyM)) return base
  return Math.max(base, accuracyM * 1.5)
}
