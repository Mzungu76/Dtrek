// lib/trailScore.ts
import type { BeautyScore } from './beautyScore'
import type { ActivityMeta } from './blobStore'

export type CtsConfidence = 'high' | 'estimated' | 'default'

export interface TrailScoreInputs {
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  sacScale?: string
  surfaces?: string[]
  avgHeartRate?: number
  userAge?: number
  personalDelta?: number
  hrHikeCount?: number
  prefSforzo?: number   // 0–100, default 50
  prefDurata?: number   // minutes, default 270
  hrRest?: number       // resting HR for Karvonen HII
  hrMax?: number        // max HR override (falls back to Tanaka formula)
  avgSlopeDeg?: number  // from DTM (lib/dtm), Horn's method — independent of self-reported sacScale
}

export interface TrailScoreBreakdown {
  b1: number; b2: number
  fStd: number; fFinal: number
  tNaismith: number; tDesc: number
  altPhysioMult: number; terrainMult: number
  delta: number; deltaEff: number
  deltaSource: 'none' | 'profile' | 'personal' | 'hr'
  difficultyW: number; hrHikeCount: number
  userFCmax: number; terrainLabel: string
  sfidaBonus: number; duraBonus: number
}

export interface TrailScoreResult {
  ts: number; b: number
  label: string; color: string
  confidence: CtsConfidence
  breakdown: TrailScoreBreakdown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function deriveFCmax(age?: number): number {
  return age ? 211 - 0.64 * age : 185
}

function sacTerrainMult(sacScale?: string): number {
  switch (sacScale) {
    case 'T1': return 1.00
    case 'T2': return 1.15
    case 'T3': return 1.35
    case 'T4': return 1.60
    case 'T5': return 2.00
    case 'T6': return 2.50
    default:   return 1.00
  }
}

function surfaceTerrainMult(surfaces?: string[]): number {
  if (!surfaces || surfaces.length === 0) return 1.00
  const mults = surfaces.map(s => {
    switch (s) {
      case 'sentiero':   return 1.20
      case 'sterrato':   return 1.00
      case 'ciclabile':  return 0.90
      case 'locale':     return 0.90
      case 'trafficata': return 0.90
      case 'altro':      return 1.10
      default:           return 1.00
    }
  })
  return Math.max(...mults)
}

// Same physical reality as sacTerrainMult (slope) but from a measured source (DTM) rather
// than a self-declared SAC tag — scaled to sacTerrainMult's wider range (1.00-2.50), not
// surfaceTerrainMult's narrower one (0.90-1.20). undefined/no data -> 1.00, never the max
// unless the slope genuinely warrants it.
function slopeTerrainMult(avgSlopeDeg?: number): number {
  if (avgSlopeDeg == null) return 1.00
  if (avgSlopeDeg < 10) return 1.00
  if (avgSlopeDeg < 20) return 1.20
  if (avgSlopeDeg < 30) return 1.45
  if (avgSlopeDeg < 40) return 1.80
  return 2.20
}

function terrainLabel(sacScale?: string, surfaces?: string[]): string {
  if (sacScale) return `SAC ${sacScale}`
  if (surfaces && surfaces.length > 0) return surfaces[0]
  return 'Non specificato'
}

export interface NaismithHours { tFlat: number; tAscent: number; tDescent: number; total: number }

/** Naismith's rule time components (hours) — extracted so lib/navigation/paceAssistant.ts can
 * reuse the exact same formula for the live in-hike estimate instead of duplicating it. */
export function naismithHours(distKm: number, elevationGainM: number, elevationLossM: number): NaismithHours {
  const tFlat    = distKm / 4
  const tAscent  = elevationGainM / 600
  const tDescent = Math.max(0, elevationLossM - elevationGainM * 0.5) / 1000
  return { tFlat, tAscent, tDescent, total: tFlat + tAscent + tDescent }
}

export interface AltitudeTerrainMultiplier { altPhysioMult: number; terrainMult: number; combined: number }

/** Altitude-physiology + terrain multipliers — same extraction reasoning as naismithHours. */
export function altitudeTerrainMultiplier(altitudeMax: number, sacScale?: string, surfaces?: string[], avgSlopeDeg?: number): AltitudeTerrainMultiplier {
  let altPhysioMult: number
  if (altitudeMax < 2000) {
    altPhysioMult = 1.0
  } else if (altitudeMax < 3500) {
    altPhysioMult = 1 + ((altitudeMax - 2000) / 1500) * 0.08
  } else {
    altPhysioMult = 1.08 + ((altitudeMax - 3500) / 1500) * 0.04
  }

  const sacMult   = sacTerrainMult(sacScale)
  const surfMult  = surfaceTerrainMult(surfaces)
  const slopeMult = slopeTerrainMult(avgSlopeDeg)
  const terrainMult = Math.max(sacMult, surfMult, slopeMult)

  return { altPhysioMult, terrainMult, combined: altPhysioMult * terrainMult }
}

// Karvonen Heart Rate Intensity Index — range [0, 1]
function computeHII(avgHr: number, hrRest: number, hrMax: number): number {
  const reserve = hrMax - hrRest
  return reserve > 0 ? Math.max(0, Math.min(1, (avgHr - hrRest) / reserve)) : 0.65
}

// ── ctsLabel ──────────────────────────────────────────────────────────────────

export function ctsLabel(ts: number): { label: string; color: string } {
  if (ts >= 85) return { label: 'Imperdibile',  color: '#7c3aed' }
  if (ts >= 70) return { label: 'Eccellente',   color: '#059669' }
  if (ts >= 55) return { label: 'Molto buono',  color: '#16a34a' }
  if (ts >= 40) return { label: 'Buono',        color: '#ca8a04' }
  if (ts >= 25) return { label: 'Nella media',  color: '#ea580c' }
  return              { label: 'Impegnativo',  color: '#dc2626' }
}

/** Returns the user's average CTS from existing activities, or 50 if no history. */
export function getCtsFallback(activities: ActivityMeta[]): number {
  const scores = activities.map(a => a.trailScore).filter((s): s is number => s != null)
  return scores.length ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 50
}

// ── computeTrailScore ─────────────────────────────────────────────────────────

export function computeTrailScore(
  beauty: BeautyScore,
  inputs: TrailScoreInputs,
  pesoNatura = 50,
): TrailScoreResult {
  const {
    distanceMeters, elevationGain, elevationLoss, altitudeMax,
    sacScale, surfaces, avgHeartRate, userAge,
    personalDelta, hrHikeCount = 0,
    prefSforzo = 50, prefDurata = 270,
    hrRest, hrMax, avgSlopeDeg,
  } = inputs

  // Naismith time components (hours)
  const { tFlat, tAscent, tDescent: tDescRaw, total: naismithTotal } = naismithHours(distanceMeters / 1000, elevationGain, elevationLoss)
  const tNaismith = tFlat
  const tDesa     = tAscent

  // Altitude physiology + terrain multipliers
  const { altPhysioMult, terrainMult: terrMult } = altitudeTerrainMultiplier(altitudeMax, sacScale, surfaces, avgSlopeDeg)
  const tLabel = terrainLabel(sacScale, surfaces)

  const tTot = naismithTotal * altPhysioMult * terrMult
  const fStd = clamp(tTot * 2, 0, 10)

  // Delta (personal effort correction)
  let delta = 0
  let deltaSource: TrailScoreBreakdown['deltaSource'] = 'none'
  const userFCmax = hrMax ?? deriveFCmax(userAge)

  if (avgHeartRate && avgHeartRate > 0) {
    // Karvonen HII with asymmetric clamp: fatigue can rise more than it can fall
    const hii = computeHII(avgHeartRate, hrRest ?? 55, userFCmax)
    delta = Math.max(-0.3, Math.min(0.5, (hii - 0.65) / 0.35))
    deltaSource = 'hr'
  } else if (personalDelta != null && hrHikeCount >= 4) {
    delta = personalDelta
    deltaSource = 'personal'
  }

  const difficultyW = fStd / 10
  const deltaEff    = delta * difficultyW * 0.3   // max ±15% weight on F
  const fFinal      = clamp(fStd * (1 + deltaEff), 0, 10)

  // B comes directly from beauty.overall — already weighted by the user's 3 trade-off sliders
  // via slidersToWeights → computeBeautyScore. No re-weighting needed here.
  const catNatura      = beauty.categories.find(c => c.key === 'natura')?.score      ?? 0
  const catPaesaggio   = beauty.categories.find(c => c.key === 'paesaggio')?.score   ?? 0
  const catArcheologia = beauty.categories.find(c => c.key === 'archeologia')?.score ?? 0
  const catArchitettura = beauty.categories.find(c => c.key === 'architettura')?.score ?? 0
  const catInteresse   = beauty.categories.find(c => c.key === 'interesse')?.score   ?? 0
  const b1 = (catNatura + catPaesaggio) / 2          // unweighted group avg for breakdown display
  const b2 = (catArcheologia + catArchitettura + catInteresse) / 3
  const B  = beauty.overall                          // properly weighted by slidersToWeights

  const tsBase = clamp(50 * Math.log10((B + 1) / (fFinal + 1)) + 50, 0, 100)

  // Preference bonuses
  const sforzaNorm = (prefSforzo - 50) / 50          // [−1, +1]
  const fNorm      = (fFinal - 5) / 5                // [−1, +1], pivot su difficoltà media 5
  const sfidaBonus = clamp(sforzaNorm * fNorm * 12, -12, 12)

  const duraOre    = tNaismith + tDesa + tDescRaw    // stima Naismith (ore)
  const prefDuraOre = prefDurata / 60
  const relDiff    = (duraOre - prefDuraOre) / prefDuraOre
  const σ          = relDiff >= 0 ? 0.5 : 0.7        // troppo lungo decade più in fretta
  const duraBonus  = -(1 - Math.exp(-0.5 * (relDiff / σ) ** 2)) * 12

  const ts = clamp(tsBase + sfidaBonus + duraBonus, 0, 100)

  const { label, color } = ctsLabel(ts)

  return {
    ts,
    b: B,
    label,
    color,
    confidence: 'high',
    breakdown: {
      b1, b2,
      fStd, fFinal,
      tNaismith, tDesc: tDescRaw,
      altPhysioMult, terrainMult: terrMult,
      delta, deltaEff,
      deltaSource,
      difficultyW, hrHikeCount,
      userFCmax, terrainLabel: tLabel,
      sfidaBonus, duraBonus,
    },
  }
}
