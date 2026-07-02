import type { TrackPoint, TcxActivity } from '@/lib/tcxParser'
import { computeMovingStats, computeIEV } from '@/lib/tcxParser'
import { haversineM } from '@/lib/geoUtils'

function downsampleTracks(pts: TrackPoint[], max = 400): TrackPoint[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)])
}

/**
 * Builds a TcxActivity from points recorded live during navigation — same
 * stat computation as parseGpxActivity (lib/gpxActivityParser.ts), minus the
 * XML parsing, since these points already come from real GPS fixes with
 * real timestamps (no Naismith-formula fallback needed, unlike a GPX file
 * that might lack <time> elements).
 */
export function buildActivityFromTrack(rawPoints: TrackPoint[]): TcxActivity {
  if (rawPoints.length < 2) throw new Error('Traccia troppo corta per essere salvata')

  const trackPoints = downsampleTracks(rawPoints)

  let distanceMeters = 0
  let elevationGain = 0
  let elevationLoss = 0
  const speedSamples: number[] = []

  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat !== undefined && p.lon !== undefined && q.lat !== undefined && q.lon !== undefined) {
      const dist = haversineM(q.lat, q.lon, p.lat, p.lon)
      distanceMeters += dist
      const dt = (new Date(p.time).getTime() - new Date(q.time).getTime()) / 1000
      if (dt > 0 && dt < 300) speedSamples.push(dist / dt)
    }
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0.5) elevationGain += d
      else if (d < -0.5) elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter((p) => p.altitudeMeters !== undefined).map((p) => p.altitudeMeters!)
  const altitudeMax = alts.length ? Math.max(...alts) : 0
  const altitudeMin = alts.length ? Math.min(...alts) : 0

  const startTime = rawPoints[0].time
  const endTime = rawPoints[rawPoints.length - 1].time
  const totalTimeSeconds = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000

  const avgSpeedMs = speedSamples.length
    ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
    : distanceMeters / totalTimeSeconds || 0
  const maxSpeedMs = speedSamples.length ? Math.max(...speedSamples) : 0

  const hrValues = rawPoints.filter((p) => p.heartRateBpm).map((p) => p.heartRateBpm!)
  const avgHeartRate = hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : 0
  const maxHeartRate = hrValues.length ? Math.max(...hrValues) : 0

  const id = 'nav_' + startTime.replace(/\D/g, '').slice(0, 14) + '_' + Math.floor(distanceMeters)

  const { netSpeedMs, pauseTimeSeconds } = computeMovingStats(rawPoints, distanceMeters, totalTimeSeconds)
  const iev = computeIEV(rawPoints)

  return {
    id,
    sport: 'Hiking',
    notes: 'Escursione registrata',
    device: 'Dtrek Navigazione',
    startTime,
    endTime,
    totalTimeSeconds,
    distanceMeters,
    calories: 0,
    avgHeartRate,
    maxHeartRate,
    avgSpeedMs,
    maxSpeedMs,
    altitudeMin,
    altitudeMax,
    elevationGain,
    elevationLoss,
    trackPoints,
    netSpeedMs,
    pauseTimeSeconds,
    iev,
  }
}
