import type { ActivityMeta } from './blobStore'
import { TrackPoint } from './tcxParser'
import { format } from 'date-fns'

export function formatPaceMinkm(distanceM: number, totalSec: number): string {
  if (distanceM <= 0) return '--'
  const secPerKm = totalSec / (distanceM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.floor(secPerKm % 60)
  return `${m}'${s.toString().padStart(2, '0')}"/km`
}

export function difficultyIndex(elevGainM: number, distanceM: number): number {
  if (distanceM <= 0) return 0
  return Math.round(elevGainM / (distanceM / 1000))
}

export function caloriesPerHour(calories: number, totalSec: number): number {
  if (totalSec <= 0) return 0
  return Math.round(calories / (totalSec / 3600))
}

export interface PersonalRecords {
  longestKm: ActivityMeta | null
  highestGain: ActivityMeta | null
  fastestPace: ActivityMeta | null
  mostCalories: ActivityMeta | null
  highestAlt: ActivityMeta | null
  longestDuration: ActivityMeta | null
  highestHR: ActivityMeta | null
  highestDifficulty: ActivityMeta | null
}

export function getPersonalRecords(activities: ActivityMeta[]): PersonalRecords {
  if (activities.length === 0) {
    return {
      longestKm: null, highestGain: null, fastestPace: null, mostCalories: null,
      highestAlt: null, longestDuration: null, highestHR: null, highestDifficulty: null,
    }
  }
  const withDist = activities.filter(a => a.distanceMeters > 0)
  return {
    longestKm: activities.reduce((a, b) => a.distanceMeters > b.distanceMeters ? a : b),
    highestGain: activities.reduce((a, b) => a.elevationGain > b.elevationGain ? a : b),
    fastestPace: withDist.length > 0
      ? withDist.reduce((a, b) =>
          (a.totalTimeSeconds / a.distanceMeters) < (b.totalTimeSeconds / b.distanceMeters) ? a : b)
      : null,
    mostCalories: activities.reduce((a, b) => a.calories > b.calories ? a : b),
    highestAlt: activities.reduce((a, b) => a.altitudeMax > b.altitudeMax ? a : b),
    longestDuration: activities.reduce((a, b) => a.totalTimeSeconds > b.totalTimeSeconds ? a : b),
    highestHR: activities.reduce((a, b) => a.maxHeartRate > b.maxHeartRate ? a : b),
    highestDifficulty: withDist.length > 0
      ? withDist.reduce((a, b) =>
          difficultyIndex(a.elevationGain, a.distanceMeters) > difficultyIndex(b.elevationGain, b.distanceMeters) ? a : b)
      : null,
  }
}

export interface Streaks {
  currentDays: number
  longestDays: number
  currentWeeks: number
  longestWeeks: number
  totalActiveDays: number
  totalActiveWeeks: number
}

function getMondayStr(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return format(d, 'yyyy-MM-dd')
}

export function computeStreaks(activities: ActivityMeta[]): Streaks {
  if (activities.length === 0) {
    return { currentDays: 0, longestDays: 0, currentWeeks: 0, longestWeeks: 0, totalActiveDays: 0, totalActiveWeeks: 0 }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = format(today, 'yyyy-MM-dd')

  const activeDays = new Set(activities.map(a => format(new Date(a.startTime), 'yyyy-MM-dd')))
  const activeWeeks = new Set(activities.map(a => getMondayStr(new Date(a.startTime))))

  // Current day streak
  let currentDays = 0
  let d = new Date(today)
  while (activeDays.has(format(d, 'yyyy-MM-dd'))) {
    currentDays++
    d.setDate(d.getDate() - 1)
  }

  // Longest day streak
  const sortedDays = Array.from(activeDays).sort()
  let longestDays = 0, cur = 0
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) { cur = 1; longestDays = 1; continue }
    const prev = new Date(sortedDays[i - 1]).getTime()
    const curr = new Date(sortedDays[i]).getTime()
    const diff = Math.round((curr - prev) / 86400000)
    cur = diff === 1 ? cur + 1 : 1
    longestDays = Math.max(longestDays, cur)
  }
  longestDays = Math.max(longestDays, currentDays)

  // Current week streak
  let currentWeeks = 0
  let w = new Date(today)
  while (activeWeeks.has(getMondayStr(w))) {
    currentWeeks++
    w.setDate(w.getDate() - 7)
  }

  // Longest week streak
  const sortedWeeks = Array.from(activeWeeks).sort()
  let longestWeeks = 0, curW = 0
  for (let i = 0; i < sortedWeeks.length; i++) {
    if (i === 0) { curW = 1; longestWeeks = 1; continue }
    const prev = new Date(sortedWeeks[i - 1]).getTime()
    const curr = new Date(sortedWeeks[i]).getTime()
    const diff = Math.round((curr - prev) / 86400000 / 7)
    curW = diff === 1 ? curW + 1 : 1
    longestWeeks = Math.max(longestWeeks, curW)
  }
  longestWeeks = Math.max(longestWeeks, currentWeeks)

  return {
    currentDays, longestDays, currentWeeks, longestWeeks,
    totalActiveDays: activeDays.size, totalActiveWeeks: activeWeeks.size,
  }
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const COMPARISON_COLORS = ['#378d44', '#c05a17', '#2563eb', '#9333ea']

// ── HR Zones ──────────────────────────────────────────────────────────────────
export const ZONE_NAMES  = ['Z1 Recupero', 'Z2 Aerobico', 'Z3 Soglia', 'Z4 Lattato', 'Z5 VO₂max']
export const ZONE_COLORS = ['#93c5fd', '#6ee7b7', '#fde047', '#fb923c', '#f87171']

export interface HRZone { name: string; pct: number; color: string }

export function computeHRZones(trackPoints: TrackPoint[], maxHR: number): HRZone[] {
  const pts = trackPoints.filter(p => p.heartRateBpm !== undefined)
  if (pts.length === 0) return []
  const counts = [0, 0, 0, 0, 0]
  for (const p of pts) {
    const ratio = p.heartRateBpm! / maxHR
    counts[ratio < 0.6 ? 0 : ratio < 0.7 ? 1 : ratio < 0.8 ? 2 : ratio < 0.9 ? 3 : 4]++
  }
  const total = counts.reduce((a, b) => a + b, 0)
  return ZONE_NAMES.map((name, i) => ({
    name, color: ZONE_COLORS[i], pct: total > 0 ? Math.round(counts[i] / total * 100) : 0,
  }))
}

// ── Seasonal analysis ─────────────────────────────────────────────────────────
export type Season = 'primavera' | 'estate' | 'autunno' | 'inverno'

export interface SeasonStats {
  season: Season
  label: string
  color: string
  count: number
  avgKm: number
  avgGain: number
  avgHR: number
  avgSatisfaction: number
  avgAltMax: number
}

export function computeSeasonalStats(activities: ActivityMeta[]): SeasonStats[] {
  const meta: Record<Season, { label: string; color: string }> = {
    primavera: { label: 'Primavera', color: '#22c55e' },
    estate:    { label: 'Estate',    color: '#f59e0b' },
    autunno:   { label: 'Autunno',  color: '#f97316' },
    inverno:   { label: 'Inverno',  color: '#60a5fa' },
  }
  function getSeason(d: Date): Season {
    const m = d.getMonth()
    if (m >= 2 && m <= 4) return 'primavera'
    if (m >= 5 && m <= 7) return 'estate'
    if (m >= 8 && m <= 10) return 'autunno'
    return 'inverno'
  }
  return (['primavera', 'estate', 'autunno', 'inverno'] as Season[]).map(season => {
    const acts = activities.filter(a => getSeason(new Date(a.startTime)) === season)
    const n = acts.length
    if (n === 0) return { season, ...meta[season], count: 0, avgKm: 0, avgGain: 0, avgHR: 0, avgSatisfaction: 0, avgAltMax: 0 }
    const withHR   = acts.filter(a => a.avgHeartRate > 0)
    const withSodd = acts.filter(a => (a.soddisfazione ?? 0) > 0)
    return {
      season, ...meta[season], count: n,
      avgKm:           Math.round(acts.reduce((s, a) => s + a.distanceMeters / 1000, 0) / n * 10) / 10,
      avgGain:         Math.round(acts.reduce((s, a) => s + a.elevationGain, 0) / n),
      avgHR:           withHR.length   > 0 ? Math.round(withHR.reduce((s, a) => s + a.avgHeartRate, 0) / withHR.length) : 0,
      avgSatisfaction: withSodd.length > 0 ? Math.round(withSodd.reduce((s, a) => s + (a.soddisfazione ?? 0), 0) / withSodd.length * 10) / 10 : 0,
      avgAltMax:       Math.round(acts.reduce((s, a) => s + (a.altitudeMax ?? 0), 0) / n),
    }
  })
}

// ── Moving average & linear regression ───────────────────────────────────────
export function movingAverage(
  data: { date: string; value: number }[],
  window = 5,
): { date: string; value: number }[] {
  const half = Math.floor(window / 2)
  return data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - half), Math.min(data.length, i + half + 1)).filter(x => x.value > 0)
    return { date: d.date, value: slice.length > 0 ? Math.round(slice.reduce((s, x) => s + x.value, 0) / slice.length * 10) / 10 : 0 }
  })
}

// ── DEP (Distanza Equivalente in Piano) ──────────────────────────────────────
export function computeDEP(distanceM: number, elevationGain: number): number {
  return distanceM / 1000 + elevationGain / 100
}

export function depLabel(dep: number): string {
  if (dep < 5) return 'passeggiata'
  if (dep < 10) return 'escursione media'
  if (dep < 20) return 'escursione impegnativa'
  return 'giornata alpinistica'
}

// ── Anniversari ───────────────────────────────────────────────────────────────
export interface Anniversary {
  activity: ActivityMeta
  yearsAgo: number
}

/**
 * Trova le escursioni fatte esattamente N anni fa (±windowDays) rispetto a `today`.
 */
export function findAnniversaries(activities: ActivityMeta[], today = new Date(), windowDays = 3): Anniversary[] {
  const result: Anniversary[] = []
  for (const a of activities) {
    const d = new Date(a.startTime)
    const yearsAgo = today.getFullYear() - d.getFullYear()
    if (yearsAgo <= 0) continue
    const sameYearDate = new Date(today.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.abs((sameYearDate.getTime() - today.getTime()) / 86400000)
    if (diffDays <= windowDays) result.push({ activity: a, yearsAgo })
  }
  return result.sort((a, b) => b.yearsAgo - a.yearsAgo)
}

export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0].y : 0 }
  const sx = points.reduce((s, p) => s + p.x, 0)
  const sy = points.reduce((s, p) => s + p.y, 0)
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0)
  const sx2 = points.reduce((s, p) => s + p.x ** 2, 0)
  const denom = n * sx2 - sx ** 2
  if (denom === 0) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / denom
  return { slope, intercept: (sy - slope * sx) / n }
}
