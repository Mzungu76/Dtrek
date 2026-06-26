export interface TrackPoint {
  time: string
  lat?: number
  lon?: number
  altitudeMeters?: number
  heartRateBpm?: number
  cadence?: number
  speedMs?: number
}

export interface TcxActivity {
  id: string
  sport: string
  notes: string
  device: string
  startTime: string
  endTime: string
  totalTimeSeconds: number
  distanceMeters: number
  calories: number
  avgHeartRate: number
  maxHeartRate: number
  avgSpeedMs: number
  maxSpeedMs: number
  altitudeMin: number
  altitudeMax: number
  elevationGain: number
  elevationLoss: number
  trackPoints: TrackPoint[]
  netSpeedMs?: number
  pauseTimeSeconds?: number
  iev?: number | null
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

const PAUSE_SPEED_THRESHOLD_MS = 0.3 // below this, the hiker is considered stopped

/**
 * Splits total time into moving time vs. pause time by walking the GPS track
 * and flagging consecutive segments slower than the pause threshold.
 * Returns the net cruising speed (distance / moving time) and total pause time.
 */
export function computeMovingStats(
  trackPoints: TrackPoint[],
  distanceMeters: number,
  totalTimeSeconds: number,
): { netSpeedMs: number; pauseTimeSeconds: number } {
  let pauseTimeSeconds = 0
  for (let i = 1; i < trackPoints.length; i++) {
    const p = trackPoints[i], q = trackPoints[i - 1]
    if (p.lat === undefined || p.lon === undefined || q.lat === undefined || q.lon === undefined) continue
    const dt = (new Date(p.time).getTime() - new Date(q.time).getTime()) / 1000
    if (dt <= 0 || dt > 300) continue
    const dist = haversineM(q.lat, q.lon, p.lat, p.lon)
    if (dist / dt < PAUSE_SPEED_THRESHOLD_MS) pauseTimeSeconds += dt
  }
  const movingTimeSeconds = Math.max(totalTimeSeconds - pauseTimeSeconds, 1)
  return { netSpeedMs: distanceMeters / movingTimeSeconds, pauseTimeSeconds }
}

/**
 * IEV (Indice Efficienza Verticale): metri di dislivello guadagnati al minuto
 * nei tratti in salita (soglia 1m per filtrare il rumore GPS/barometrico).
 * Richiede timestamp validi sui trackpoints; altrimenti null.
 */
export function computeIEV(trackPoints: TrackPoint[]): number | null {
  let climbM = 0
  let climbTimeSec = 0
  for (let i = 1; i < trackPoints.length; i++) {
    const p = trackPoints[i], q = trackPoints[i - 1]
    if (p.altitudeMeters === undefined || q.altitudeMeters === undefined) continue
    const diff = p.altitudeMeters - q.altitudeMeters
    if (diff <= 1) continue
    const dt = (new Date(p.time).getTime() - new Date(q.time).getTime()) / 1000
    if (dt <= 0 || dt > 300) continue
    climbM += diff
    climbTimeSec += dt
  }
  if (climbTimeSec <= 0) return null
  return climbM / (climbTimeSec / 60)
}

export function parseTcx(xmlText: string): TcxActivity {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const activity = doc.querySelector('Activity')
  const sport = activity?.getAttribute('Sport') ?? 'Other'
  const id = doc.querySelector('Id')?.textContent ?? ''
  const notes = doc.querySelector('Notes')?.textContent ?? ''
  const deviceName = doc.querySelector('Creator Name')?.textContent ?? 'Unknown'

  const lap = doc.querySelector('Lap')
  const totalTimeSeconds = parseFloat(lap?.querySelector('TotalTimeSeconds')?.textContent ?? '0')
  const distanceMeters = parseFloat(lap?.querySelector('DistanceMeters')?.textContent ?? '0')
  const calories = parseInt(lap?.querySelector('Calories')?.textContent ?? '0')
  const avgHR = parseInt(lap?.querySelector('AverageHeartRateBpm Value')?.textContent ?? '0')
  const maxHR = parseInt(lap?.querySelector('MaximumHeartRateBpm Value')?.textContent ?? '0')

  const trackPointEls = doc.querySelectorAll('Trackpoint')
  const trackPoints: TrackPoint[] = []

  trackPointEls.forEach(tp => {
    const time = tp.querySelector('Time')?.textContent ?? ''
    const latEl = tp.querySelector('LatitudeDegrees')
    const lonEl = tp.querySelector('LongitudeDegrees')
    const altEl = tp.querySelector('AltitudeMeters')
    const hrEl = tp.querySelector('HeartRateBpm Value')
    const cadEl = tp.querySelector('Cadence')
    const spdEl = tp.querySelector('Speed')

    const point: TrackPoint = { time }
    if (latEl?.textContent) point.lat = parseFloat(latEl.textContent)
    if (lonEl?.textContent) point.lon = parseFloat(lonEl.textContent)
    if (altEl?.textContent) point.altitudeMeters = parseFloat(altEl.textContent)
    if (hrEl?.textContent) point.heartRateBpm = parseInt(hrEl.textContent)
    if (cadEl?.textContent) point.cadence = parseInt(cadEl.textContent)
    if (spdEl?.textContent) point.speedMs = parseFloat(spdEl.textContent)

    trackPoints.push(point)
  })

  // Calcola statistiche dal track
  const altitudes = trackPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const speeds = trackPoints.filter(p => p.speedMs !== undefined).map(p => p.speedMs!)

  const altMin = altitudes.length ? Math.min(...altitudes) : 0
  const altMax = altitudes.length ? Math.max(...altitudes) : 0
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0
  const maxSpeed = speeds.length ? Math.max(...speeds) : 0

  // Calcola dislivello positivo e negativo
  let elevGain = 0
  let elevLoss = 0
  for (let i = 1; i < altitudes.length; i++) {
    const diff = altitudes[i] - altitudes[i - 1]
    if (diff > 0) elevGain += diff
    else elevLoss += Math.abs(diff)
  }

  const startTime = trackPoints[0]?.time ?? id
  const endTime = trackPoints[trackPoints.length - 1]?.time ?? id

  const { netSpeedMs, pauseTimeSeconds } = computeMovingStats(trackPoints, distanceMeters, totalTimeSeconds)
  const iev = computeIEV(trackPoints)

  return {
    id,
    sport,
    notes,
    device: deviceName,
    startTime,
    endTime,
    totalTimeSeconds,
    distanceMeters,
    calories,
    avgHeartRate: avgHR,
    maxHeartRate: maxHR,
    avgSpeedMs: avgSpeed,
    maxSpeedMs: maxSpeed,
    altitudeMin: altMin,
    altitudeMax: altMax,
    elevationGain: elevGain,
    elevationLoss: elevLoss,
    trackPoints,
    netSpeedMs,
    pauseTimeSeconds,
    iev,
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`
}

export function formatPace(distanceMeters: number, seconds: number): string {
  if (distanceMeters === 0) return '--'
  const paceSecPerKm = seconds / (distanceMeters / 1000)
  const pm = Math.floor(paceSecPerKm / 60)
  const ps = Math.floor(paceSecPerKm % 60)
  return `${pm}'${ps.toString().padStart(2, '0')}"/km`
}

export function msToKmh(ms: number): number {
  return Math.round(ms * 3.6 * 10) / 10
}
