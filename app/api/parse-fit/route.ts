import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { TrackPoint, TcxActivity } from '@/lib/tcxParser'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FitParser = require('fit-file-parser')

export const dynamic = 'force-dynamic'

// Garmin semicircles → degrees
const SEMI_TO_DEG = 180 / 2 ** 31

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const arrayBuf = await req.arrayBuffer()
  if (arrayBuf.byteLength === 0) {
    return NextResponse.json({ error: 'File vuoto' }, { status: 400 })
  }

  const buffer = Buffer.from(arrayBuf)

  let fitData: Record<string, unknown>
  try {
    const parser = new FitParser({ force: true, speedUnit: 'm/s', mode: 'list' })
    fitData = await parser.parseAsync(buffer)
  } catch (e) {
    return NextResponse.json(
      { error: `File FIT non valido: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    )
  }

  // Extract records (track points)
  const records = (fitData.records as Record<string, unknown>[] | undefined) ?? []
  if (records.length === 0) {
    return NextResponse.json({ error: 'Nessun trackpoint trovato nel file FIT' }, { status: 400 })
  }

  const rawPoints: TrackPoint[] = records
    .filter(r => r.position_lat != null && r.position_long != null)
    .map(r => {
      let lat = r.position_lat as number
      let lon = r.position_long as number
      // Garmin/standard FIT: coordinates in semicircles (|value| >> 90, typically ~500M for Italy)
      // Zepp/Amazfit FIT: fit-file-parser already applies scale factor → outputs degrees directly
      if (Math.abs(lat) > 90) {
        lat = lat * SEMI_TO_DEG
        lon = lon * SEMI_TO_DEG
      }
      const time = r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date().toISOString()
      const pt: TrackPoint = { time, lat, lon }
      if (r.altitude != null) pt.altitudeMeters = r.altitude as number
      if (r.heart_rate != null) pt.heartRateBpm = r.heart_rate as number
      if (r.speed != null) pt.speedMs = r.speed as number
      return pt
    })

  if (rawPoints.length === 0) {
    return NextResponse.json({ error: 'Nessuna coordinata GPS nel file FIT' }, { status: 400 })
  }

  // Downsample to 400 points max
  const trackPoints: TrackPoint[] = rawPoints.length <= 400 ? rawPoints : (() => {
    const step = (rawPoints.length - 1) / 399
    return Array.from({ length: 400 }, (_, i) =>
      rawPoints[Math.min(Math.round(i * step), rawPoints.length - 1)]
    )
  })()

  // Compute stats
  let distanceMeters = 0, elevationGain = 0, elevationLoss = 0
  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    distanceMeters += haversineM(q.lat!, q.lon!, p.lat!, p.lon!)
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0.5) elevationGain += d
      else if (d < -0.5) elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const speeds = rawPoints.filter(p => p.speedMs !== undefined).map(p => p.speedMs!)

  // Prefer summary data from session/activity if available
  const sessions = (fitData.sessions as Record<string, unknown>[] | undefined) ?? []
  const sess = sessions[0] ?? {}

  const startTime = rawPoints[0].time
  const endTime   = rawPoints[rawPoints.length - 1].time
  const totalTimeSeconds = (sess.total_elapsed_time as number) ??
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000

  const hrValues = rawPoints.filter(p => p.heartRateBpm).map(p => p.heartRateBpm!)

  const sport   = (sess.sport as string) ?? 'Hiking'
  const nameEl  = (fitData.file_ids as Record<string, unknown>[] | undefined)?.[0]

  // Activity title from sport field
  const notes = nameEl?.['product_name'] as string | undefined
    ?? sport.charAt(0).toUpperCase() + sport.slice(1)

  const activity: TcxActivity = {
    id:                 'fit_' + startTime.replace(/\D/g, '').slice(0, 14) + '_' + Math.floor(distanceMeters),
    sport,
    notes,
    device:             (sess.sub_sport as string) ?? '',
    startTime,
    endTime,
    totalTimeSeconds:   (sess.total_elapsed_time as number) ?? totalTimeSeconds,
    distanceMeters:     (sess.total_distance as number) ?? distanceMeters,
    calories:           (sess.total_calories as number) ?? 0,
    avgHeartRate:       (sess.avg_heart_rate as number) ??
                        (hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : 0),
    maxHeartRate:       (sess.max_heart_rate as number) ??
                        (hrValues.length ? Math.max(...hrValues) : 0),
    avgSpeedMs:         (sess.avg_speed as number) ??
                        (speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0),
    maxSpeedMs:         (sess.max_speed as number) ??
                        (speeds.length ? Math.max(...speeds) : 0),
    altitudeMin:        alts.length ? Math.min(...alts) : 0,
    altitudeMax:        alts.length ? Math.max(...alts) : 0,
    elevationGain:      (sess.total_ascent as number) ?? elevationGain,
    elevationLoss:      (sess.total_descent as number) ?? elevationLoss,
    trackPoints,
  }

  return NextResponse.json(activity)
}
