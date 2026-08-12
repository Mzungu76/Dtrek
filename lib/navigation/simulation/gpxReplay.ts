/**
 * Turns a recorded GPX track into a GeoFix sequence for
 * SimulationLocationProvider — "did this actually happen on a real walk"
 * scenarios, as opposed to scenarioBuilder.ts's synthetic ones. Reuses
 * lib/gpxActivityParser.ts (already used by the /upload import flow)
 * rather than writing a second GPX parser.
 */
import { parseGpxActivity } from '@/lib/gpxActivityParser'
import { haversineM, bearingDeg } from '@/lib/geoUtils'
import type { GeoFix } from '../types'

export interface GpxReplayOptions {
  /** Assumed walking speed (m/s), used only to synthesize spacing between fixes when the GPX has no <time> elements at all — ignored otherwise. Default 1.2 (~4.3 km/h). */
  assumedSpeedMs?: number
  /** Simulated GPS accuracy assigned to every fix — GPX files don't carry this. Meters, default 8. */
  accuracyM?: number
  /** Anchor for synthesized timestamps (untimed GPX only). Defaults to now. */
  startTs?: number
}

/** Parses `xmlText` and converts every track point to a GeoFix, in order. Empty array (not a throw) for a GPX with no usable points, matching how the other scenario builders degrade rather than error. */
export function gpxToFixes(xmlText: string, opts: GpxReplayOptions = {}): GeoFix[] {
  let points: ReturnType<typeof parseGpxActivity>['trackPoints']
  try {
    points = parseGpxActivity(xmlText).trackPoints.filter((p) => p.lat != null && p.lon != null)
  } catch {
    return []
  }
  if (points.length === 0) return []

  // parseGpxActivity stamps every point with the same synthetic `time` when the file has none —
  // real recordings essentially never repeat a timestamp across many points, so this is a reliable
  // enough signal to tell the two cases apart without parsing the raw XML a second time here.
  const hasRealTimestamps = new Set(points.map((p) => p.time)).size > 1

  const accuracyM = opts.accuracyM ?? 8
  const assumedSpeedMs = opts.assumedSpeedMs ?? 1.2
  const startTs = opts.startTs ?? Date.now()

  const fixes: GeoFix[] = []
  let cumulativeMs = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const prev = i > 0 ? points[i - 1] : null

    let ts: number
    if (hasRealTimestamps) {
      ts = new Date(p.time).getTime()
    } else {
      if (prev) {
        const distM = haversineM(prev.lat!, prev.lon!, p.lat!, p.lon!)
        cumulativeMs += (distM / assumedSpeedMs) * 1000
      }
      ts = startTs + cumulativeMs
    }

    fixes.push({
      lat: p.lat!,
      lon: p.lon!,
      altitudeM: p.altitudeMeters ?? null,
      accuracyM,
      speedMs: p.speedMs ?? null,
      ts,
      bearingDeg: prev ? bearingDeg(prev.lat!, prev.lon!, p.lat!, p.lon!) : null,
      source: 'simulated',
    })
  }
  return fixes
}
