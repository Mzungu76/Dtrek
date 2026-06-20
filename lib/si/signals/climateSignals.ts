// Climate signal collector — Open-Meteo archive API, average temperature for
// the current calendar month over the last 10 years (one wide-range query,
// filtered client-side to the current month — not 10 separate requests),
// plus altitude/season penalties and a shoulder-season bonus.
import type { ClimateSignal, SignalContext } from '@/lib/si/types'

const TIMEOUT_MS = 5000
const WINTER_MONTHS = [12, 1, 2, 3] // Dic, Gen, Feb, Mar
const DEEP_WINTER_MONTHS = [12, 1, 2]
const SHOULDER_MONTHS = [4, 5, 10, 11] // Apr, Mag, Ott, Nov

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function collectClimateSignal(_osmRelationId: number, ctx: SignalContext): Promise<ClimateSignal> {
  const currentMonth = new Date().getMonth() + 1
  const seasonBonus = SHOULDER_MONTHS.includes(currentMonth) ? 5 : 0

  try {
    const [avgTemp, elevation] = await Promise.all([
      fetchAvgTempForMonth(ctx.centroid.lat, ctx.centroid.lon, currentMonth),
      fetchElevation(ctx.centroid.lat, ctx.centroid.lon),
    ])

    const tempPenalty = tempPenaltyFor(avgTemp)
    const altitudeSeason = altitudeSeasonFor(elevation, currentMonth)

    return { tempPenalty, altitudeSeason, seasonBonus }
  } catch {
    return { tempPenalty: 0, altitudeSeason: 0, seasonBonus }
  }
}

async function fetchAvgTempForMonth(lat: number, lon: number, month: number): Promise<number | null> {
  const end = new Date()
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 10)

  const url = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lon.toFixed(4),
    start_date: fmtDate(start),
    end_date:   fmtDate(end),
    daily:      'temperature_2m_mean',
    timezone:   'Europe/Rome',
  })
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Open-Meteo archive error ${res.status}`)
  const d = await res.json()
  const time: string[] = d.daily?.time ?? []
  const temps: number[] = d.daily?.temperature_2m_mean ?? []

  const monthTemps = time
    .map((t, i) => ({ month: Number(t.slice(5, 7)), temp: temps[i] }))
    .filter(({ month: m, temp }) => m === month && temp != null)
    .map(({ temp }) => temp)

  if (monthTemps.length === 0) return null
  return monthTemps.reduce((s, v) => s + v, 0) / monthTemps.length
}

async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const url = 'https://api.open-meteo.com/v1/elevation?' + new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
  })
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Open-Meteo elevation error ${res.status}`)
  const d = await res.json()
  return d.elevation?.[0] ?? null
}

function tempPenaltyFor(avgTemp: number | null): number {
  if (avgTemp == null) return 0
  if (avgTemp < 0) return -30
  if (avgTemp < 5) return -15
  if (avgTemp <= 25) return 0
  if (avgTemp <= 32) return -10
  return -25
}

function altitudeSeasonFor(elevation: number | null, month: number): number {
  if (elevation == null) return 0
  if (elevation > 1200 && WINTER_MONTHS.includes(month)) return -20
  if (elevation > 800 && DEEP_WINTER_MONTHS.includes(month)) return -10
  return 0
}
