// Weather signal collector — Open-Meteo archive API, last 7 days of
// precipitation + soil moisture at the trail's bbox centroid, modulated by
// surface (from the OSM tags already resolved by osmSignals.ts via ctx) and
// estimated average slope (from the trails-cache row, already in ctx).
import type { WeatherSignal, SignalContext } from '@/lib/si/types'

const TIMEOUT_MS = 5000

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export async function collectWeatherSignal(_osmRelationId: number, ctx: SignalContext): Promise<WeatherSignal> {
  const surfaceMultiplier = surfaceMultiplierFor(ctx.osmTags.surface)
  const slopeMultiplier = slopeMultiplierFor(ctx)

  try {
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    const url = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
      latitude:   ctx.centroid.lat.toFixed(4),
      longitude:  ctx.centroid.lon.toFixed(4),
      start_date: fmtDate(start),
      end_date:   fmtDate(end),
      daily:      'precipitation_sum,soil_moisture_0_to_7cm_mean',
      timezone:   'Europe/Rome',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Open-Meteo archive error ${res.status}`)
    const d = await res.json()
    const precipDaily: number[] = d.daily?.precipitation_sum ?? []
    const soilDaily: number[] = d.daily?.soil_moisture_0_to_7cm_mean ?? []

    const precipSum = precipDaily.reduce((s, v) => s + (v ?? 0), 0)
    const soilAvg = soilDaily.length > 0
      ? soilDaily.reduce((s, v) => s + (v ?? 0), 0) / soilDaily.length
      : 0

    const precipPenalty = precipPenaltyFor(precipSum)
    const soilPenalty = soilPenaltyFor(soilAvg)
    const totalPenalty = clamp((precipPenalty + soilPenalty) * surfaceMultiplier * slopeMultiplier, -35, 0)

    return { precipPenalty, soilPenalty, surfaceMultiplier, slopeMultiplier, totalPenalty }
  } catch {
    return { precipPenalty: 0, soilPenalty: 0, surfaceMultiplier, slopeMultiplier, totalPenalty: 0 }
  }
}

function precipPenaltyFor(mm: number): number {
  if (mm < 10) return 0
  if (mm < 30) return -8
  if (mm < 60) return -18
  return -30
}

function soilPenaltyFor(moisture: number): number {
  if (moisture < 0.2) return 0
  if (moisture < 0.35) return -5
  if (moisture < 0.45) return -15
  return -25
}

function surfaceMultiplierFor(surface: string | undefined): number {
  if (!surface) return 1.2
  if (surface === 'gravel' || surface === 'rock') return 0.5
  if (surface === 'ground' || surface === 'earth') return 1.0
  if (surface === 'mud') return 1.5
  return 1.2
}

function slopeMultiplierFor(ctx: SignalContext): number {
  const { distanceKm, elevationGain, elevationLoss } = ctx
  if (!distanceKm || distanceKm <= 0 || elevationGain == null || elevationLoss == null) return 1.0
  const slopePercent = ((elevationGain + elevationLoss) / (distanceKm * 1000)) * 100
  if (slopePercent < 10) return 0.8
  if (slopePercent <= 25) return 1.0
  return 1.3
}
