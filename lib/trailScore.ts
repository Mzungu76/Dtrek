// lib/trailScore.ts
import type { BeautyScore } from './beautyScore'

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
  // Use the max multiplier among surfaces present
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

function terrainLabel(sacScale?: string, surfaces?: string[]): string {
  if (sacScale) return `SAC ${sacScale}`
  if (surfaces && surfaces.length > 0) return surfaces[0]
  return 'Non specificato'
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
  } = inputs

  const distKm = distanceMeters / 1000

  // Naismith time components (hours)
  const tNaismith = distKm / 4
  const tDesa     = elevationGain / 600
  const tDescRaw  = Math.max(0, elevationLoss - elevationGain * 0.5) / 1000

  // Altitude physiology multiplier
  let altPhysioMult: number
  if (altitudeMax < 2000) {
    altPhysioMult = 1.0
  } else if (altitudeMax < 3500) {
    altPhysioMult = 1 + ((altitudeMax - 2000) / 1500) * 0.08
  } else {
    altPhysioMult = 1.08 + ((altitudeMax - 3500) / 1500) * 0.04
  }

  // Terrain multiplier
  const sacMult  = sacTerrainMult(sacScale)
  const surfMult = surfaceTerrainMult(surfaces)
  const terrMult = Math.max(sacMult, surfMult)
  const tLabel   = terrainLabel(sacScale, surfaces)

  const tTot = (tNaismith + tDesa + tDescRaw) * altPhysioMult * terrMult
  const fStd = clamp(tTot * 2, 0, 10)

  // Delta (personal effort correction)
  let delta = 0
  let deltaSource: TrailScoreBreakdown['deltaSource'] = 'none'
  const userFCmax = deriveFCmax(userAge)

  if (avgHeartRate && avgHeartRate > 0) {
    delta = (avgHeartRate / userFCmax - 0.65) / 0.35
    deltaSource = 'hr'
  } else if (personalDelta != null && hrHikeCount >= 4) {
    delta = personalDelta
    deltaSource = 'personal'
  }

  const difficultyW = fStd / 10
  const deltaEff    = delta * difficultyW
  const fFinal      = clamp(fStd * (1 + deltaEff), 0, 10)

  // Beauty score components — recompute b1/b2 from categories per spec
  const catNatura      = beauty.categories.find(c => c.key === 'natura')?.score      ?? 0
  const catPaesaggio   = beauty.categories.find(c => c.key === 'paesaggio')?.score   ?? 0
  const catArcheologia = beauty.categories.find(c => c.key === 'archeologia')?.score ?? 0
  const catArchitettura = beauty.categories.find(c => c.key === 'architettura')?.score ?? 0
  const catInteresse   = beauty.categories.find(c => c.key === 'interesse')?.score   ?? 0

  const b1 = catNatura * 0.55 + catPaesaggio * 0.45
  const b2 = catArcheologia * 0.35 + catArchitettura * 0.40 + catInteresse * 0.25
  const pesoN = pesoNatura / 100
  const B = b1 * pesoN + b2 * (1 - pesoN)

  const tsBase = clamp(50 * Math.log10((B + 1) / (fFinal + 1)) + 50, 0, 100)

  // Preference bonuses
  const sforzaNorm = (prefSforzo - 50) / 50  // [-1, +1]
  const sfidaBonus = sforzaNorm * 20 * (fFinal / 10)

  const duraOre    = tNaismith + tDesa + tDescRaw  // estimated hours
  const prefDuraOre = prefDurata / 60
  const duraNorm   = clamp((duraOre - prefDuraOre) / prefDuraOre, -1, 1) * -1
  const duraBonus  = duraNorm * 15

  const ts = clamp(tsBase + sfidaBonus + duraBonus, 0, 100)

  const { label, color } = ctsLabel(ts)

  return {
    ts,
    b: B,
    label,
    color,
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
