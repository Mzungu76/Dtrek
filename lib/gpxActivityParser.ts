import type { TrackPoint, TcxActivity } from './tcxParser'
import { computeMovingStats } from './tcxParser'

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function downsampleTracks(pts: TrackPoint[], max = 400): TrackPoint[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) =>
    pts[Math.min(Math.round(i * step), pts.length - 1)]
  )
}

export function parseGpxActivity(xmlText: string): TcxActivity {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('File GPX non valido')

  const nameEl = doc.querySelector('trk > name') ?? doc.querySelector('name')
  const notes = nameEl?.textContent?.trim() || 'Escursione'

  const trkptEls = Array.from(doc.querySelectorAll('trkpt'))
  if (trkptEls.length === 0) throw new Error('Nessun punto GPS trovato nel file GPX')

  const now = new Date().toISOString()
  let hasRealTimestamps = false

  const rawPoints: TrackPoint[] = trkptEls.map(el => {
    const lat = parseFloat(el.getAttribute('lat') ?? '')
    const lon = parseFloat(el.getAttribute('lon') ?? '')
    if (isNaN(lat) || isNaN(lon)) return null

    const timeText = el.querySelector('time')?.textContent?.trim()
    if (timeText) hasRealTimestamps = true
    const time = timeText || now

    const eleText = el.querySelector('ele')?.textContent
    // HR from Garmin/generic extensions: <gpxtpx:hr> or <hr>
    const hrText = el.querySelector('hr')?.textContent

    const pt: TrackPoint = { time, lat, lon }
    if (eleText) pt.altitudeMeters = parseFloat(eleText)
    if (hrText) pt.heartRateBpm = parseInt(hrText)
    return pt
  }).filter((p): p is TrackPoint => p !== null)

  if (rawPoints.length === 0) throw new Error('Coordinate GPS non valide nel file GPX')

  const trackPoints = downsampleTracks(rawPoints)

  let distanceMeters = 0
  let elevationGain  = 0
  let elevationLoss  = 0
  const speedSamples: number[] = []

  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat !== undefined && p.lon !== undefined && q.lat !== undefined && q.lon !== undefined) {
      const dist = haversineM(q.lat, q.lon, p.lat, p.lon)
      distanceMeters += dist
      if (hasRealTimestamps) {
        const dt = (new Date(p.time).getTime() - new Date(q.time).getTime()) / 1000
        if (dt > 0 && dt < 300) speedSamples.push(dist / dt)
      }
    }
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0.5) elevationGain += d
      else if (d < -0.5) elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const altitudeMax = alts.length ? Math.max(...alts) : 0
  const altitudeMin = alts.length ? Math.min(...alts) : 0

  const startTime = rawPoints[0].time
  const endTime   = rawPoints[rawPoints.length - 1].time

  const totalTimeSeconds = hasRealTimestamps
    ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
    : (distanceMeters / 1000 / 4 + elevationGain / 300) * 3600 // Naismith fallback

  const avgSpeedMs = speedSamples.length
    ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
    : distanceMeters / totalTimeSeconds || 0
  const maxSpeedMs = speedSamples.length ? Math.max(...speedSamples) : 0

  const hrValues   = rawPoints.filter(p => p.heartRateBpm).map(p => p.heartRateBpm!)
  const avgHeartRate = hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : 0
  const maxHeartRate = hrValues.length ? Math.max(...hrValues) : 0

  const id = 'gpx_' + startTime.replace(/\D/g, '').slice(0, 14) + '_' + Math.floor(distanceMeters)

  const { netSpeedMs, pauseTimeSeconds } = hasRealTimestamps
    ? computeMovingStats(rawPoints, distanceMeters, totalTimeSeconds)
    : { netSpeedMs: avgSpeedMs, pauseTimeSeconds: 0 }

  return {
    id,
    sport: 'Hiking',
    notes,
    device: '',
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
  }
}
