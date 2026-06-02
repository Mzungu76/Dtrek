import type { BeautyScore } from './beautyScore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EffortInputs {
  distanceMeters:   number
  elevationGain:    number
  totalTimeSeconds: number
  avgHeartRate:     number        // 0 = nessun dato
  userMaxHeartRate: number        // FCmax personale; 0 = usa stima
  rpe:              number | undefined  // 1–10; undefined = non inserito
  sacScale?:        string        // da TerrainContext se disponibile
  surfaces?:        string[]
}

export interface EffortBreakdown {
  dislKm:  number   // componente dislivello/km (0–10)
  fcPct:   number   // componente FC% FCmax (0–10)
  durata:  number   // componente durata (0–10)
  rpe:     number   // componente RPE (0–10, 5 se assente)
  terreno: number   // componente terreno (0–10)
  hasRpe:  boolean
  hasFc:   boolean
}

export interface MeritaResult {
  ms:        number   // 0–100
  b:         number   // bellezza totale pesata 0–10
  b1:        number   // Natura 0–10
  b2:        number   // Cultura 0–10
  f:         number   // fatica 0–10
  label:     string
  color:     string
  breakdown: EffortBreakdown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function msLabel(ms: number): { label: string; color: string } {
  if (ms >= 85) return { label: 'Capolavoro',           color: '#15803d' }
  if (ms >= 70) return { label: 'Eccellente',            color: '#16a34a' }
  if (ms >= 55) return { label: 'Ottimo rapporto',      color: '#65a30d' }
  if (ms >= 45) return { label: 'Equilibrato',           color: '#ca8a04' }
  if (ms >= 30) return { label: 'Impegnativo',           color: '#ea580c' }
  if (ms >= 15) return { label: 'Sforzo non ripagato',  color: '#dc2626' }
  return               { label: 'Ne valeva la pena?',   color: '#991b1b' }
}

// ── Effort Index (0–10) ───────────────────────────────────────────────────────
//
// Pesi: dislivello/km 30% · FC% FCmax 30% · durata 15% · RPE 15% · terreno 10%

export function computeEffortIndex(inputs: EffortInputs): {
  effortIndex: number
  breakdown:   EffortBreakdown
} {
  const distKm     = Math.max(inputs.distanceMeters / 1000, 0.1)
  const elevPerKm  = inputs.elevationGain / distKm

  // 1. Dislivello/km — 200 m/km = punteggio max
  const dislKm = Math.min(elevPerKm / 20, 10)

  // 2. FC% FCmax — attivo solo se abbiamo HR reale
  let fcNorm = 5   // neutro se assente
  let hasFc  = false
  if (inputs.avgHeartRate > 0) {
    const fcmax = inputs.userMaxHeartRate > 0 ? inputs.userMaxHeartRate : 190
    const fcPct = (inputs.avgHeartRate / fcmax) * 100
    // <50% → 0, 100% → 10, lineare con step 5%/punto
    fcNorm = Math.min(Math.max((fcPct - 50) / 5, 0), 10)
    hasFc  = true
  }

  // 3. Durata — 5h = punteggio max
  const hours  = inputs.totalTimeSeconds / 3600
  const durata = Math.min(hours * 2, 10)

  // 4. RPE — 1-10 diretto; 5 se assente
  const hasRpe = inputs.rpe !== undefined && inputs.rpe > 0
  const rpeNorm = hasRpe ? inputs.rpe! : 5

  // 5. Terreno — da SAC scale o tipo superficie
  const terreno = terrainScore(inputs.sacScale, inputs.surfaces)

  const effortIndex = Math.round(
    (dislKm * 0.30 + fcNorm * 0.30 + durata * 0.15 + rpeNorm * 0.15 + terreno * 0.10) * 10,
  ) / 10

  return {
    effortIndex: Math.min(Math.max(effortIndex, 0), 10),
    breakdown:   { dislKm, fcPct: fcNorm, durata, rpe: rpeNorm, terreno, hasRpe, hasFc },
  }
}

// ── MeritaScore (0–100) ───────────────────────────────────────────────────────
//
// MS = clamp(B / F × 50, 0, 100)
// dove B e F sono su scala 0–10.
// Con B = F → MS = 50 (punto di pareggio "ne è valsa la pena")

export function computeMeritaScore(
  beautyScore: BeautyScore,
  effortInputs: EffortInputs,
  pesoNatura = 50,   // 0–100; pesoCultura = 100 - pesoNatura
): MeritaResult {
  const { effortIndex, breakdown } = computeEffortIndex(effortInputs)

  const pesoCultura = 100 - pesoNatura
  const catMap = Object.fromEntries(beautyScore.categories.map(c => [c.key, c.score]))

  // B1 Natura = media di natura + paesaggio
  const b1 = ((catMap.natura ?? 0) + (catMap.paesaggio ?? 0)) / 2
  // B2 Cultura = media di archeologia + architettura + interesse
  const b2 = ((catMap.archeologia ?? 0) + (catMap.architettura ?? 0) + (catMap.interesse ?? 0)) / 3

  const B = (b1 * pesoNatura + b2 * pesoCultura) / 100   // 0–10

  // Floor sulla fatica per evitare MS inflazionati su passeggiate piatte con 0 sforzo
  const F  = Math.max(effortIndex, 0.5)
  const ms = Math.min(Math.round((B / F) * 50), 100)

  return {
    ms,
    b:  Math.round(B  * 10) / 10,
    b1: Math.round(b1 * 10) / 10,
    b2: Math.round(b2 * 10) / 10,
    f:  Math.round(F  * 10) / 10,
    ...msLabel(ms),
    breakdown,
  }
}
