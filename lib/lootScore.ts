// LootScore (LS) — personal score answering "ne è valsa la pena?"
//
// Beauty (B) / Personal Effort (F) × 33 + Soddisfazione bonus
//
// Formula:
//   F = 0.30·dislKm + 0.35·fcNorm + 0.20·durata + 0.15·terreno  (floor 1.5)
//   LS_base = clamp(B / F × 33, 0, 100)
//   LS = clamp(LS_base + (soddisfazione − 5) × 3, 0, 100)
//
// FCmax is derived from the user's biometric profile via Tanaka's formula:
//   FCmax = 211 − 0.64 × age

import type { BeautyScore } from './beautyScore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LootInputs {
  distanceMeters:    number
  elevationGain:     number
  totalTimeSeconds:  number
  avgHeartRate:      number       // 0 = no data
  userAge?:          number       // for Tanaka FCmax
  userMaxHeartRate?: number       // explicit override; 0 = auto-derive
  soddisfazione?:    number       // 1–10; undefined = not entered
  sacScale?:         string
  surfaces?:         string[]
}

export interface LootBreakdown {
  dislKm:   number
  fcNorm:   number
  durata:   number
  terreno:  number
  hasFc:    boolean
  hasSod:   boolean
  sodBonus: number
}

export interface LootResult {
  ls:        number   // 0–100
  b:         number   // bellezza pesata 0–10
  b1:        number   // Natura 0–10
  b2:        number   // Cultura 0–10
  f:         number   // fatica personale 0–10
  label:     string
  color:     string
  breakdown: LootBreakdown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function deriveFCmax(age?: number): number {
  if (age && age >= 10 && age <= 90) return Math.round(211 - 0.64 * age)
  return 185   // default (age ~40)
}

const SAC_SCORES: Record<string, number> = {
  T1: 2, T2: 4, T3: 6, T4: 8, T5: 9, T6: 10,
}
const SURFACE_SCORES: Record<string, number> = {
  sentiero: 6, sterrato: 5, ciclabile: 3, locale: 2.5, trafficata: 1.5, altro: 4,
}

function terrainScore(sacScale?: string, surfaces?: string[]): number {
  if (sacScale && SAC_SCORES[sacScale]) return SAC_SCORES[sacScale]
  if (!surfaces?.length) return 4.5
  const counts: Record<string, number> = {}
  for (const s of surfaces) counts[s] = (counts[s] ?? 0) + 1
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return SURFACE_SCORES[dominant] ?? 4.5
}

export function lsLabel(ls: number): { label: string; color: string } {
  if (ls >= 85) return { label: 'Imperdibile',          color: '#15803d' }
  if (ls >= 70) return { label: 'Eccellente',            color: '#16a34a' }
  if (ls >= 55) return { label: 'Molto buono',           color: '#65a30d' }
  if (ls >= 45) return { label: 'Buono',                 color: '#ca8a04' }
  if (ls >= 35) return { label: 'Nella norma',           color: '#ea580c' }
  if (ls >= 20) return { label: 'Faticoso',              color: '#dc2626' }
  return               { label: 'Non valeva lo sforzo',  color: '#991b1b' }
}

// ── Core computation ──────────────────────────────────────────────────────────

export function computeLootScore(
  beautyScore: BeautyScore,
  inputs: LootInputs,
  pesoNatura = 50,
): LootResult {
  const distKm    = Math.max(inputs.distanceMeters / 1000, 0.1)
  const elevPerKm = inputs.elevationGain / distKm

  // 1. Dislivello/km — 200 m/km = max
  const dislKm = Math.min(elevPerKm / 20, 10)

  // 2. FC% FCmax — derived from biometric profile or explicit override
  let fcNorm = 5
  let hasFc  = false
  if (inputs.avgHeartRate > 0) {
    const fcmax = (inputs.userMaxHeartRate && inputs.userMaxHeartRate > 0)
      ? inputs.userMaxHeartRate
      : deriveFCmax(inputs.userAge)
    const fcPct = (inputs.avgHeartRate / fcmax) * 100
    fcNorm = Math.min(Math.max((fcPct - 50) / 5, 0), 10)
    hasFc  = true
  }

  // 3. Durata — 5h = max
  const durata = Math.min((inputs.totalTimeSeconds / 3600) * 2, 10)

  // 4. Terreno
  const terreno = terrainScore(inputs.sacScale, inputs.surfaces)

  // Effort index: weights 30% / 35% / 20% / 15%
  const effortRaw = dislKm * 0.30 + fcNorm * 0.35 + durata * 0.20 + terreno * 0.15
  const F = Math.min(Math.max(effortRaw, 1.5), 10)

  // Beauty B
  const pesoCultura = 100 - pesoNatura
  const catMap = Object.fromEntries(beautyScore.categories.map(c => [c.key, c.score]))
  const b1 = ((catMap.natura ?? 0) + (catMap.paesaggio ?? 0)) / 2
  const b2 = ((catMap.archeologia ?? 0) + (catMap.architettura ?? 0) + (catMap.interesse ?? 0)) / 3
  const B  = (b1 * pesoNatura + b2 * pesoCultura) / 100

  // Base score (objective component)
  const lsBase = (B / F) * 33

  // Soddisfazione bonus: (sod − 5) × 3  →  range −12…+15
  const hasSod   = inputs.soddisfazione !== undefined && inputs.soddisfazione > 0
  const sodBonus = hasSod ? (inputs.soddisfazione! - 5) * 3 : 0

  const ls = Math.min(Math.max(Math.round(lsBase + sodBonus), 0), 100)

  return {
    ls,
    b:  Math.round(B  * 10) / 10,
    b1: Math.round(b1 * 10) / 10,
    b2: Math.round(b2 * 10) / 10,
    f:  Math.round(F  * 10) / 10,
    ...lsLabel(ls),
    breakdown: {
      dislKm:   Math.round(dislKm  * 10) / 10,
      fcNorm:   Math.round(fcNorm  * 10) / 10,
      durata:   Math.round(durata  * 10) / 10,
      terreno:  Math.round(terreno * 10) / 10,
      hasFc,
      hasSod,
      sodBonus: Math.round(sodBonus * 10) / 10,
    },
  }
}
