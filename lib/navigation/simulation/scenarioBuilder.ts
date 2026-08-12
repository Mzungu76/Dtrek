/**
 * Composable "Scenario Injection" primitives: start from a clean baseline
 * walk (walkAlongRoute) and layer deviations onto it, instead of needing a
 * real recorded GPX for every edge case the Navigation Engine should
 * handle. Each injector takes and returns a GeoFix[], so they chain:
 *
 *   injectDeviation(walkAlongRoute(route), 40, 35, 90, 25)
 *
 * walks the route, then 40 fixes in, drifts 35m to the right over 25s —
 * enough to trip the Off-Route Engine's dwell timer (lib/navigation/
 * offRouteEngine.ts's defaults: ~20s sustained, growing divergence).
 */
import { haversineM, bearingDeg } from '@/lib/geoUtils'
import type { GeoFix } from '../types'

const EARTH_RADIUS_M = 6371000

function offsetLatLon(lat: number, lon: number, headingDeg: number, distanceM: number): [number, number] {
  const rad = (headingDeg * Math.PI) / 180
  const dLat = (distanceM * Math.cos(rad)) / EARTH_RADIUS_M
  const dLon = (distanceM * Math.sin(rad)) / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI]
}

export interface WalkAlongRouteOptions {
  /** m/s, default 1.2 (~4.3 km/h, an easy hiking pace). */
  speedMs?: number
  /** Seconds between fixes, default 2 — matches AdaptiveGpsTracker's "walking" cadence (lib/navigation/gpsTracker.ts). */
  fixIntervalS?: number
  /** Simulated GPS accuracy for every fix, meters. Default 8. */
  accuracyM?: number
  startTs?: number
}

/** The clean baseline scenario: steps along `routePolyline` at a steady pace, right on the line — "everything is fine". Every other function here modifies a sequence built from this one. */
export function walkAlongRoute(routePolyline: [number, number][], opts: WalkAlongRouteOptions = {}): GeoFix[] {
  if (routePolyline.length < 2) return []
  const speedMs = opts.speedMs ?? 1.2
  const fixIntervalS = opts.fixIntervalS ?? 2
  const accuracyM = opts.accuracyM ?? 8
  const startTs = opts.startTs ?? Date.now()

  const cumulativeM: number[] = [0]
  for (let i = 1; i < routePolyline.length; i++) {
    cumulativeM.push(cumulativeM[i - 1] + haversineM(routePolyline[i - 1][0], routePolyline[i - 1][1], routePolyline[i][0], routePolyline[i][1]))
  }
  const totalM = cumulativeM[cumulativeM.length - 1]
  const stepM = speedMs * fixIntervalS

  const fixes: GeoFix[] = []
  let segIdx = 1
  for (let d = 0; d <= totalM; d += stepM) {
    while (segIdx < cumulativeM.length - 1 && cumulativeM[segIdx] < d) segIdx++
    const a = routePolyline[segIdx - 1]
    const b = routePolyline[segIdx]
    const segLenM = cumulativeM[segIdx] - cumulativeM[segIdx - 1]
    const t = segLenM > 0 ? (d - cumulativeM[segIdx - 1]) / segLenM : 0
    const lat = a[0] + t * (b[0] - a[0])
    const lon = a[1] + t * (b[1] - a[1])

    fixes.push({
      lat, lon,
      altitudeM: null,
      accuracyM,
      speedMs,
      ts: startTs + fixes.length * fixIntervalS * 1000,
      bearingDeg: bearingDeg(a[0], a[1], b[0], b[1]),
      source: 'simulated',
    })
  }
  return fixes
}

/**
 * Bends `durationS` worth of fixes starting at `atIndex` sideways off the
 * route, growing linearly to `offsetM` — a believable "walked off the
 * trail" instead of a single implausible jump. Fixes before/after the
 * window are untouched, so the scenario shows leaving and stopping there
 * (append a second call with a negative-trending offset, or a fresh
 * `walkAlongRoute` continuation, to script rejoining the route).
 */
export function injectDeviation(fixes: GeoFix[], atIndex: number, offsetM: number, headingDeg: number, durationS: number, fixIntervalS = 2): GeoFix[] {
  const steps = Math.max(1, Math.round(durationS / fixIntervalS))
  const out = fixes.slice()
  for (let i = 0; i < steps && atIndex + i < out.length; i++) {
    const f = out[atIndex + i]
    const growth = offsetM * ((i + 1) / steps)
    const [lat, lon] = offsetLatLon(f.lat, f.lon, headingDeg, growth)
    out[atIndex + i] = { ...f, lat, lon, bearingDeg: headingDeg }
  }
  return out
}

/** Degrades reported accuracy for a stretch — exercises the 'uncertain' state (spec §15.6) instead of a real off-route deviation. */
export function injectPoorAccuracy(fixes: GeoFix[], atIndex: number, accuracyM: number, durationS: number, fixIntervalS = 2): GeoFix[] {
  const steps = Math.max(1, Math.round(durationS / fixIntervalS))
  const out = fixes.slice()
  for (let i = 0; i < steps && atIndex + i < out.length; i++) {
    out[atIndex + i] = { ...out[atIndex + i], accuracyM }
  }
  return out
}

/** Drops fixes entirely for a stretch — exercises the GPS-lost watchdog (NavigationEngine's GPS_LOST_MS) and the native catch-up path's counterpart in a live device. */
export function injectGpsLoss(fixes: GeoFix[], atIndex: number, durationS: number, fixIntervalS = 2): GeoFix[] {
  const steps = Math.max(1, Math.round(durationS / fixIntervalS))
  return [...fixes.slice(0, atIndex), ...fixes.slice(atIndex + steps)]
}

/** A single, wildly displaced fix — exercises the Position Engine's spike rejection (lib/navigation/positionEngine.ts). Doesn't shift any other fix, so a correctly-behaving engine should show no visible effect at all. */
export function injectSpike(fixes: GeoFix[], atIndex: number, offsetM = 300, headingDeg = 45): GeoFix[] {
  if (atIndex < 0 || atIndex >= fixes.length) return fixes
  const out = fixes.slice()
  const f = out[atIndex]
  const [lat, lon] = offsetLatLon(f.lat, f.lon, headingDeg, offsetM)
  out[atIndex] = { ...f, lat, lon }
  return out
}
