import { haversineM, bearingDeg } from '@/lib/geoUtils'
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

export interface RouteTrackerOptions {
  /** How many segments on either side of the last known index to search on a normal fix — never
   * a full O(n) rescan. */
  searchWindow?: number
}

export interface RouteTrackerUpdateOptions {
  /** The caller knows this fix may not be in spatial/temporal continuity with the last one (e.g.
   * resuming from gps_lost, or right after a backgrounded WebView regains visibility) — skip the
   * search window and scan the whole track. This is the defense against the "false on-route"
   * failure mode on a hairpin/crossing trail: a windowed search can stay latched onto a
   * wrong-but-plausible nearby segment after a real jump, and its distance alone gives no hint
   * anything is wrong.
   *
   * Deliberately NOT also triggered automatically whenever the windowed distance is merely large
   * (e.g. a hiker genuinely off-trail) — tried and reverted after it broke a real recorded hike on
   * a loop trail: when actually off-route by a couple hundred meters, a full-track scan can find
   * an unrelated but geometrically closer point on a *different* leg of the same loop and jump
   * distanceAlongRouteM there, which is worse than trusting the windowed (locally continuous)
   * result — off-route wandering and "the last position was on a different part of the trail
   * network" are two different situations, and only a real discontinuity signal (this flag) can
   * tell them apart; raw distance alone can't. */
  forceFullScan?: boolean
}

/**
 * Tracks progress of a live fix against a route polyline. Unlike a one-shot
 * "distance to nearest segment" check, this keeps state across calls so each
 * new fix only searches a small window around the last known segment index
 * (never a full O(n) rescan on an ordinary fix) and reports how far along the
 * route the hiker has walked (distanceAlongRouteM), which feeds ETA /
 * remaining-distance UI.
 *
 * Deliberately "sticky" to the last known index on an ordinary fix — on a
 * trail with switchbacks/crossings, staying near where we were is a feature,
 * not a limitation: it avoids latching onto a segment that's geometrically
 * closer but belongs to a different stretch of the same trail (or a
 * different leg of a loop) while the hiker is still walking normally, even
 * if genuinely off-route by some distance. update()'s forceFullScan
 * overrides this locality only when there's real evidence of a position
 * jump (see its own doc comment for why that has to be an explicit signal,
 * not an automatic distance threshold) — not to replace nearest-segment
 * search with a pure O(n) scan on every fix.
 */
export class RouteTracker {
  private readonly track: [number, number][]
  private readonly cumulativeM: number[] // cumulativeM[i] = distance from track[0] to track[i]
  private lastSegmentIndex = 0
  private readonly searchWindow: number

  constructor(track: [number, number][], opts: RouteTrackerOptions = {}) {
    this.track = track
    this.searchWindow = opts.searchWindow ?? 15
    this.cumulativeM = [0]
    for (let i = 1; i < track.length; i++) {
      this.cumulativeM.push(this.cumulativeM[i - 1] + haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]))
    }
  }

  get totalRouteM(): number {
    return this.cumulativeM[this.cumulativeM.length - 1] ?? 0
  }

  /** Nearest-segment search over [lo, hi] (inclusive segment indices, 1-based like lastSegmentIndex) — shared by the windowed and full-track searches below, so neither duplicates the loop. */
  private searchRange(lat: number, lon: number, lo: number, hi: number): { idx: number; hit: SegmentHit } {
    let bestIdx = lo
    let bestHit: SegmentHit = distToSegment(lat, lon, this.track[lo - 1], this.track[lo])
    for (let i = lo + 1; i <= hi; i++) {
      const hit = distToSegment(lat, lon, this.track[i - 1], this.track[i])
      if (hit.distM < bestHit.distM) { bestHit = hit; bestIdx = i }
    }
    return { idx: bestIdx, hit: bestHit }
  }

  update(lat: number, lon: number, opts: RouteTrackerUpdateOptions = {}): RouteProgress {
    if (this.track.length < 2) {
      return { nearestSegmentIndex: 0, distanceToRouteM: Infinity, distanceAlongRouteM: 0, totalRouteM: 0, nearestPointLat: lat, nearestPointLon: lon, expectedBearingDeg: null }
    }
    const lo = Math.max(1, this.lastSegmentIndex - this.searchWindow)
    const hi = Math.min(this.track.length - 1, this.lastSegmentIndex + this.searchWindow)
    let { idx: bestIdx, hit: bestHit } = this.searchRange(lat, lon, lo, hi)

    if (opts.forceFullScan) {
      const full = this.searchRange(lat, lon, 1, this.track.length - 1)
      // The full-track range is a superset of the windowed one, so it can never be worse — the
      // strict "<" only matters on an exact tie, where it preserves the windowed pick (the
      // intentional locality this class is built around, see class doc comment).
      if (full.hit.distM < bestHit.distM) {
        bestIdx = full.idx
        bestHit = full.hit
      }
    }

    this.lastSegmentIndex = bestIdx

    const distanceAlongRouteM = this.cumulativeM[bestIdx - 1] +
      bestHit.t * (this.cumulativeM[bestIdx] - this.cumulativeM[bestIdx - 1])

    // Linear interpolation in lat/lon space along [a, b] by t — consistent
    // with distToSegment's own local-projection approximation, and accurate
    // enough at the short segment lengths a route polyline is made of.
    const [a, b] = [this.track[bestIdx - 1], this.track[bestIdx]]
    const nearestPointLat = a[0] + bestHit.t * (b[0] - a[0])
    const nearestPointLon = a[1] + bestHit.t * (b[1] - a[1])
    // Zero-length segment (duplicate consecutive points in the source track) has no meaningful
    // direction — matches distToSegment's own fallback for the same degenerate case.
    const expectedBearingDeg = (a[0] === b[0] && a[1] === b[1]) ? null : bearingDeg(a[0], a[1], b[0], b[1])

    return {
      nearestSegmentIndex: bestIdx,
      distanceToRouteM: bestHit.distM,
      distanceAlongRouteM,
      totalRouteM: this.totalRouteM,
      nearestPointLat,
      nearestPointLon,
      expectedBearingDeg,
    }
  }
}
