import { ActivityMeta } from './blobStore'
import { TrackPoint } from './tcxParser'
import { difficultyIndex } from './stats'
import { DailyLoad } from './trainingLoad'

// Aerobic Efficiency Factor = avgSpeedMs / avgHR, normalized for elevation
export function computeAerobicEfficiency(activity: ActivityMeta): number {
  if (!activity.avgHeartRate || activity.avgHeartRate <= 0) return 0
  if (!activity.avgSpeedMs   || activity.avgSpeedMs   <= 0) return 0
  const di = difficultyIndex(activity.elevationGain, activity.distanceMeters)
  return activity.avgSpeedMs / activity.avgHeartRate * (1 + di * 0.002)
}

// Recovery score 0-100 from TSB
export interface RecoveryInfo {
  score: number
  label: string
  color: string
  daysToRecovery: number
  suggestion: string
}

export function computeRecoveryScore(tsb: number): RecoveryInfo {
  const score = Math.min(100, Math.max(0, Math.round((tsb + 30) / 60 * 100)))
  const daysToRecovery = Math.max(0, Math.ceil(-tsb / 5))
  if (score >= 80) return { score, daysToRecovery, label: 'Eccellente', color: '#16a34a', suggestion: 'Sei in ottima forma. Ideale per un\'uscita impegnativa.' }
  if (score >= 60) return { score, daysToRecovery, label: 'Buono',      color: '#65a30d', suggestion: 'Pronto per un\'uscita di media intensità.' }
  if (score >= 40) return { score, daysToRecovery, label: 'Neutro',     color: '#ca8a04', suggestion: 'Carico bilanciato. Mantieni il ritmo attuale.' }
  if (score >= 20) return { score, daysToRecovery, label: 'Affaticato', color: '#ea580c', suggestion: `Accumulo di fatica. Considera ${daysToRecovery} giorn${daysToRecovery === 1 ? 'o' : 'i'} di recupero.` }
  return { score, daysToRecovery, label: 'Sovraccarico', color: '#dc2626', suggestion: 'Fatica elevata. Riposo consigliato prima di impegni intensi.' }
}

// Fitness Score: % of personal EF historical peak (recent 3 activities vs peak)
export interface FitnessScoreInfo {
  score: number
  trend: 'up' | 'down' | 'stable'
  trendPct: number
  hasData: boolean
}

export function computeFitnessScore(activities: ActivityMeta[]): FitnessScoreInfo {
  const sorted = [...activities]
    .filter(a => a.avgHeartRate > 0 && a.avgSpeedMs > 0)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  if (sorted.length < 3) return { score: 0, trend: 'stable', trendPct: 0, hasData: false }

  const efHistory = sorted.map(a => computeAerobicEfficiency(a)).filter(e => e > 0)
  if (efHistory.length < 3) return { score: 0, trend: 'stable', trendPct: 0, hasData: false }

  const maxEF     = Math.max(...efHistory)
  const recent    = efHistory.slice(-3)
  const recentAvg = recent.reduce((s, e) => s + e, 0) / recent.length
  const score     = Math.min(100, Math.round(recentAvg / maxEF * 100))

  const older    = efHistory.slice(-6, -3)
  let trend: 'up' | 'down' | 'stable' = 'stable'
  let trendPct = 0
  if (older.length >= 2) {
    const olderAvg = older.reduce((s, e) => s + e, 0) / older.length
    trendPct = Math.round((recentAvg - olderAvg) / olderAvg * 100)
    if (trendPct > 3)  trend = 'up'
    if (trendPct < -3) trend = 'down'
  }

  return { score, trend, trendPct: Math.abs(trendPct), hasData: true }
}

// HR Decoupling: % cardiac drift between first and second half
export function computeHRDecoupling(trackPoints: TrackPoint[]): number | null {
  const pts = trackPoints.filter(p => p.heartRateBpm !== undefined && p.speedMs !== undefined && p.speedMs > 0.5)
  if (pts.length < 30) return null
  const half = Math.floor(pts.length / 2)
  const h1 = pts.slice(0, half)
  const h2 = pts.slice(half)
  const ef = (arr: typeof pts) => {
    const avgSpeed = arr.reduce((s, p) => s + p.speedMs!, 0) / arr.length
    const avgHR    = arr.reduce((s, p) => s + p.heartRateBpm!, 0) / arr.length
    return avgHR > 0 ? avgSpeed / avgHR : 0
  }
  const ef1 = ef(h1), ef2 = ef(h2)
  if (ef1 === 0) return null
  return Math.round(Math.abs((ef1 - ef2) / ef1) * 1000) / 10
}

export interface DecouplingInfo {
  value: number
  label: string
  color: string
  description: string
}

export function interpretDecoupling(pct: number): DecouplingInfo {
  if (pct < 5)  return { value: pct, label: 'Ottima base aerobica', color: '#16a34a', description: 'La FC è rimasta stabile per tutto il percorso.' }
  if (pct < 8)  return { value: pct, label: 'Buona resistenza',     color: '#65a30d', description: 'Leggero accumulo di fatica nella seconda metà.' }
  if (pct < 12) return { value: pct, label: 'Base in sviluppo',     color: '#ca8a04', description: 'La FC è aumentata nella seconda metà. Più uscite lente miglioreranno la base.' }
  return         { value: pct, label: 'Deriva cardiaca alta',        color: '#dc2626', description: 'Forte deriva: intensità troppo alta o base aerobica da potenziare.' }
}

// TRIMPS (Training Impulse) from avgHR — more accurate than TSS for HR activities
export function computeTRIMPS(activity: ActivityMeta, maxHR = 190): number {
  if (!activity.avgHeartRate || activity.avgHeartRate <= 0) {
    return Math.round((activity.distanceMeters / 1000) * 5 + (activity.elevationGain / 1000) * 30)
  }
  const hrRatio = Math.min(1, activity.avgHeartRate / maxHR)
  const durationMin = activity.totalTimeSeconds / 60
  return Math.round(durationMin * Math.exp(1.92 * hrRatio))
}

// VO2max estimate using Uth-Sørensen formula (requires resting HR)
export function computeVO2maxEstimate(maxHR: number, restHR: number): number {
  if (!maxHR || !restHR || restHR <= 0) return 0
  return Math.round(15.3 * maxHR / restHR)
}

// EF trend data for chart (sorted by date)
export interface EFPoint { date: string; ef: number; efSmoothed: number }

export function computeEFTrend(activities: ActivityMeta[]): EFPoint[] {
  const sorted = [...activities]
    .filter(a => a.avgHeartRate > 0 && a.avgSpeedMs > 0 && a.distanceMeters > 1000)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  if (sorted.length < 2) return []

  const raw = sorted.map(a => ({ date: a.startTime, ef: computeAerobicEfficiency(a) })).filter(d => d.ef > 0)
  const windowSize = Math.min(5, Math.ceil(raw.length / 3))

  return raw.map((d, i) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end   = Math.min(raw.length, i + Math.ceil(windowSize / 2))
    const slice = raw.slice(start, end)
    const efSmoothed = slice.reduce((s, x) => s + x.ef, 0) / slice.length
    return { date: d.date, ef: Math.round(d.ef * 10000) / 10000, efSmoothed: Math.round(efSmoothed * 10000) / 10000 }
  })
}

// Polarized training distribution from zone times (seconds per zone)
export interface PolarizedDistribution {
  lowIntensityPct: number   // Z1 + Z2
  medIntensityPct: number   // Z3
  highIntensityPct: number  // Z4 + Z5
  totalSeconds: number
  hasData: boolean
}

export function computePolarizedDistribution(
  zoneTimes: number[], // [z1, z2, z3, z4, z5] in seconds
): PolarizedDistribution {
  const total = zoneTimes.reduce((s, v) => s + v, 0)
  if (total === 0) return { lowIntensityPct: 0, medIntensityPct: 0, highIntensityPct: 0, totalSeconds: 0, hasData: false }
  return {
    lowIntensityPct:  Math.round((zoneTimes[0] + zoneTimes[1]) / total * 100),
    medIntensityPct:  Math.round(zoneTimes[2] / total * 100),
    highIntensityPct: Math.round((zoneTimes[3] + zoneTimes[4]) / total * 100),
    totalSeconds: total,
    hasData: true,
  }
}

// Aggregate HR zone times from ActivityMeta using avgHR approximation
// (fast path — no need to load full trackPoints)
export function estimateZoneTimesFromMeta(activities: ActivityMeta[], maxHR: number): number[] {
  const totals = [0, 0, 0, 0, 0]
  for (const a of activities) {
    if (!a.avgHeartRate || a.avgHeartRate <= 0 || !a.totalTimeSeconds) continue
    const ratio = a.avgHeartRate / maxHR
    const zone  = ratio < 0.6 ? 0 : ratio < 0.7 ? 1 : ratio < 0.8 ? 2 : ratio < 0.9 ? 3 : 4
    totals[zone] += a.totalTimeSeconds
  }
  return totals
}

// Calorie efficiency normalized by weight (kcal/kg/h)
export function computeCalorieEfficiency(activity: ActivityMeta, weightKg: number): number {
  if (!weightKg || weightKg <= 0 || !activity.calories || !activity.totalTimeSeconds) return 0
  return Math.round(activity.calories / weightKg / (activity.totalTimeSeconds / 3600) * 10) / 10
}
