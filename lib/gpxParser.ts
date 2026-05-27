import type { TrackPoint } from './tcxParser'

export interface GpxActivity {
  id: string
  title: string
  startTime: string
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  trackPoints: TrackPoint[]
}

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

export function parseGpx(xmlText: string): GpxActivity {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')

  const parseErr = doc.querySelector('parsererror')
  if (parseErr) throw new Error('File GPX non valido')

  const nameEl = doc.querySelector('trk > name') ?? doc.querySelector('name')
  const title = nameEl?.textContent?.trim() || 'Escursione pianificata'

  const trkptEls = Array.from(doc.querySelectorAll('trkpt'))
  if (trkptEls.length === 0) throw new Error('Nessun punto GPS trovato nel file GPX')

  const now = new Date().toISOString()
  const rawPoints: TrackPoint[] = trkptEls.map(el => {
    const lat = parseFloat(el.getAttribute('lat') ?? '')
    const lon = parseFloat(el.getAttribute('lon') ?? '')
    if (isNaN(lat) || isNaN(lon)) return null
    const time = el.querySelector('time')?.textContent?.trim() || now
    const eleText = el.querySelector('ele')?.textContent
    const pt: TrackPoint = { time, lat, lon }
    if (eleText) pt.altitudeMeters = parseFloat(eleText)
    return pt
  }).filter((p): p is TrackPoint => p !== null)

  if (rawPoints.length === 0) throw new Error('Coordinate GPS non valide nel file GPX')

  const trackPoints = downsampleTracks(rawPoints)

  // Compute distance + elevation
  let distanceMeters = 0
  let elevationGain  = 0
  let elevationLoss  = 0

  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat && p.lon && q.lat && q.lon)
      distanceMeters += haversineM(q.lat, q.lon, p.lat, p.lon)
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0) elevationGain += d; else elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints
    .filter(p => p.altitudeMeters !== undefined)
    .map(p => p.altitudeMeters!)
  const altitudeMax = alts.length ? Math.max(...alts) : 0
  const altitudeMin = alts.length ? Math.min(...alts) : 0

  // Naismith's rule: 1h per 4 km + 1h per 300 m D+
  const distKm = distanceMeters / 1000
  const estimatedTimeSeconds = (distKm / 4 + elevationGain / 300) * 3600

  const startTime = rawPoints[0].time
  const id = 'gpx_' + startTime.replace(/\D/g, '').slice(0, 14) + '_' + Math.floor(distanceMeters)

  return {
    id,
    title,
    startTime,
    distanceMeters,
    elevationGain,
    elevationLoss,
    altitudeMax,
    altitudeMin,
    estimatedTimeSeconds,
    trackPoints,
  }
}
