/**
 * Converte una traccia reale scaricata dal database (forma `activities.track_points`,
 * vedi docs/piano-test.md §3) in una sequenza di GeoFix riproducibile da
 * SimulationLocationProvider — stesso ruolo di gpxReplay.ts's gpxToFixes(), ma a partire
 * da JSON già strutturato invece che da XML GPX (le tracce reali del DB non sono file GPX,
 * sono già righe di `track_points`).
 */
import type { GeoFix } from '../../types'

export interface RecordedTrackPoint {
  lat: number
  lon: number
  time: string
  speedMs?: number | null
  altitudeMeters?: number | null
}

export interface RealTrackFixture {
  sourceActivityId: string
  title: string
  note: string
  distanceMetersRecorded: number
  elevationGainRecorded?: number | null
  elevationLossRecorded?: number | null
  routePolyline: [number, number][]
  trackPoints: RecordedTrackPoint[]
}

/**
 * `PositionEngine.checkFixQuality()` rejects any fix whose `ts` is more than 30s in the past
 * (or 5s in the future) relative to the real `Date.now()` at the moment it's actually ingested
 * — a "stale/replayed fix" guard (see lib/navigation/positionEngine.ts). A track recorded on a
 * real hike carries real, now-old timestamps, so replaying it as-is is rejected outright, not
 * accepted-but-ignored: this isn't a bug in the fixture, it's the same anti-replay gate that
 * would reject spoofed/replayed GPS on a real device, doing exactly its job.
 *
 * To actually exercise the engine with genuine recorded fixes we rebase the whole slice so its
 * first point lands at "now" and every later point keeps its *original* spacing divided by
 * `speedFactor` — i.e. we play the real recording back faster, not artificially teleport it.
 * `speedFactor` is bounded from above by `PositionEngine`'s spike rejection
 * (`maxPlausibleSpeedMs`, 14 m/s default): compress a real ~1 m/s hiking pace by much more than
 * ~15-20x and consecutive fixes start looking like an impossible sprint and get rejected as
 * spikes, which is why this helper is only used on short slices (a minute-scale test, not a
 * whole multi-hour hike — see realRouteSimulation.test.ts's comment on why a full recorded hike
 * isn't replayed this way in the default suite).
 */
export function rebaseFixesToNowCompressed(points: RecordedTrackPoint[], speedFactor: number, accuracyM = 8): GeoFix[] {
  if (points.length === 0) return []
  const originalFirstMs = new Date(points[0].time).getTime()
  const nowMs = Date.now()
  return points.map((p) => {
    const originalDeltaMs = new Date(p.time).getTime() - originalFirstMs
    return {
      lat: p.lat,
      lon: p.lon,
      altitudeM: p.altitudeMeters ?? null,
      accuracyM,
      speedMs: p.speedMs ?? null,
      ts: nowMs + originalDeltaMs / speedFactor,
      source: 'simulated' as const,
    }
  })
}
