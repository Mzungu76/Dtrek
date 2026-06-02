// TrailScore (TS) — objective, scientifically grounded hike score
//
// Scientific basis:
//   • Naismith's Rule (1892): 1h per 4.5 km flat + 1h per 600 m D+
//   • SAC / CAI trail difficulty scale → difficulty multiplier
//   • Standard hiker profile: age 40 · weight 75 kg · VO₂max ≈ 35 mL/kg/min
//     FCmax ≈ 185 bpm (Tanaka: 211 − 0.64 × 40)
//
// TrailScore is comparable across hikes: the same trail always gets the
// same TS, regardless of who hiked it.

import type { BeautyScore } from './beautyScore'

export interface TrailScoreInputs {
  distanceMeters: number
  elevationGain:  number
  sacScale?:      string   // T1–T6
  surfaces?:      string[]
}

export interface TrailScoreResult {
  ts:             number   // 0–100
  b:              number   // bellezza 0–10
  f:              number   // fatica standard 0–10
  label:          string
  color:          string
  estimatedHours: number   // tempo Naismith per escursionista standard
}

// SAC difficulty → time multiplier for standard hiker
const SAC_MULT: Record<string, number> = {
  T1: 1.00, T2: 1.15, T3: 1.35, T4: 1.60, T5: 2.00, T6: 2.50,
}

const SURFACE_MULT: Record<string, number> = {
  sentiero: 1.20, sterrato: 1.00, ciclabile: 0.90,
  locale: 0.90, trafficata: 0.90, altro: 1.10,
}

function terrainMult(sacScale?: string, surfaces?: string[]): number {
  if (sacScale && SAC_MULT[sacScale]) return SAC_MULT[sacScale]
  if (!surfaces?.length) return 1.10
  const counts: Record<string, number> = {}
  for (const s of surfaces) counts[s] = (counts[s] ?? 0) + 1
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return SURFACE_MULT[dominant] ?? 1.10
}

export function tsLabel(ts: number): { label: string; color: string } {
  if (ts >= 85) return { label: 'Imperdibile',      color: '#15803d' }
  if (ts >= 70) return { label: 'Eccellente',        color: '#16a34a' }
  if (ts >= 55) return { label: 'Molto buono',       color: '#65a30d' }
  if (ts >= 45) return { label: 'Buono',             color: '#ca8a04' }
  if (ts >= 35) return { label: 'Nella norma',       color: '#ea580c' }
  if (ts >= 20) return { label: 'Impegnativo',       color: '#dc2626' }
  return               { label: 'Solo per esperti',  color: '#991b1b' }
}

export function computeTrailScore(
  beautyScore: BeautyScore,
  inputs: TrailScoreInputs,
  pesoNatura = 50,
): TrailScoreResult {
  const distKm = Math.max(inputs.distanceMeters / 1000, 0.1)

  // Naismith estimate (standard hiker: 4.5 km/h flat, 600 m D+/h climb)
  const tNaismith = distKm / 4.5 + inputs.elevationGain / 600

  // Terrain multiplier for adjusted difficulty
  const mult   = terrainMult(inputs.sacScale, inputs.surfaces)
  const tAdj   = tNaismith * mult

  // Effort index 0–10 (floor 1.5 to prevent inflating very short/flat walks)
  const f = Math.min(Math.max(tAdj * 1.4, 1.5), 10)

  // Beauty: same B1/B2 split as LootScore
  const pesoCultura = 100 - pesoNatura
  const catMap = Object.fromEntries(beautyScore.categories.map(c => [c.key, c.score]))
  const b1 = ((catMap.natura ?? 0) + (catMap.paesaggio ?? 0)) / 2
  const b2 = ((catMap.archeologia ?? 0) + (catMap.architettura ?? 0) + (catMap.interesse ?? 0)) / 3
  const B  = (b1 * pesoNatura + b2 * pesoCultura) / 100

  const ts = Math.min(Math.max(Math.round((B / f) * 33), 0), 100)

  return {
    ts,
    b:              Math.round(B  * 10) / 10,
    f:              Math.round(f  * 10) / 10,
    estimatedHours: Math.round(tNaismith * 10) / 10,
    ...tsLabel(ts),
  }
}
