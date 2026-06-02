// TrailScore (TS) — punteggio unico che risponde "ne è valsa la pena?"
//
// Componenti:
//   B  = Bellezza (da OSM POI + Wikipedia + terreno, ponderata Natura/Cultura)
//   F  = Fatica = F_std (Naismith + SAC) corretta con profilo personale
//
//   TS = clamp(B / F × 33, 0, 100)
//
// Correzione personale (delta):
//   • Se disponibile FC media (percorso completato):
//       FC% reale vs FC% attesa per questo sforzo standard
//       delta = (fc_reale% − fc_attesa%) / 10
//   • Altrimenti, da profilo (solo età):
//       delta = (FC_max_std − FC_max_utente) / 10
//       FC_max utente = 211 − 0.64 × età  (formula Tanaka)
//       FC_max std = 185 bpm  (escursionista tipo: 40 anni)
//
//   Il delta è moltiplicato per un peso proporzionale alla difficoltà del percorso:
//       difficultyW = F_std / 10   → su trail facili la correzione conta meno
//
// Base scientifica:
//   Regola di Naismith (1892) · Scale SAC/CAI · Formula Tanaka per FCmax

import type { BeautyScore } from './beautyScore'

// ── Profilo escursionista standard ────────────────────────────────────────────
const STD_FCMAX = 185   // bpm, età 40 anni (Tanaka: 211 − 0.64 × 40)

export function deriveFCmax(age?: number): number {
  if (age && age >= 10 && age <= 90) return Math.round(211 - 0.64 * age)
  return STD_FCMAX
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrailScoreInputs {
  distanceMeters:    number
  elevationGain:     number
  sacScale?:         string   // T1–T6
  surfaces?:         string[]
  // Correzione personale (opzionale)
  userAge?:          number   // per derivare FCmax utente
  userMaxHeartRate?: number   // override esplicito FCmax
  avgHeartRate?:     number   // FC media percorso completato
}

export interface TrailScoreBreakdown {
  b1:          number   // Natura 0–10
  b2:          number   // Cultura 0–10
  fStd:        number   // fatica standard 0–10
  fFinal:      number   // fatica corretta 0–10
  tNaismith:   number   // ore stimate (escursionista std)
  terrainMult: number   // moltiplicatore terreno (da SAC/superficie)
  delta:       number   // correzione personale grezza
  deltaEff:    number   // correzione effettiva (delta × difficultyW)
  deltaSource: 'none' | 'profile' | 'hr'
  difficultyW: number   // peso difficoltà 0–1
  userFCmax:   number   // FCmax utente usata
  terrainLabel: string  // "T2", "sentiero", "default", …
}

export interface TrailScoreResult {
  ts:        number   // 0–100
  b:         number   // bellezza pesata 0–10
  label:     string
  color:     string
  breakdown: TrailScoreBreakdown
}

// ── Terreno ───────────────────────────────────────────────────────────────────

const SAC_MULT: Record<string, number> = {
  T1: 1.00, T2: 1.15, T3: 1.35, T4: 1.60, T5: 2.00, T6: 2.50,
}
const SURFACE_MULT: Record<string, number> = {
  sentiero: 1.20, sterrato: 1.00, ciclabile: 0.90,
  locale: 0.90, trafficata: 0.90, altro: 1.10,
}

function getTerrainMult(sacScale?: string, surfaces?: string[]): { mult: number; label: string } {
  if (sacScale && SAC_MULT[sacScale]) return { mult: SAC_MULT[sacScale], label: sacScale }
  if (!surfaces?.length) return { mult: 1.10, label: 'default' }
  const counts: Record<string, number> = {}
  for (const s of surfaces) counts[s] = (counts[s] ?? 0) + 1
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return { mult: SURFACE_MULT[dominant] ?? 1.10, label: dominant }
}

function r1(n: number) { return Math.round(n * 10) / 10 }

// ── Label ─────────────────────────────────────────────────────────────────────

export function tsLabel(ts: number): { label: string; color: string } {
  if (ts >= 85) return { label: 'Imperdibile',      color: '#15803d' }
  if (ts >= 70) return { label: 'Eccellente',        color: '#16a34a' }
  if (ts >= 55) return { label: 'Molto buono',       color: '#65a30d' }
  if (ts >= 45) return { label: 'Buono',             color: '#ca8a04' }
  if (ts >= 35) return { label: 'Nella norma',       color: '#ea580c' }
  if (ts >= 20) return { label: 'Impegnativo',       color: '#dc2626' }
  return               { label: 'Solo per esperti',  color: '#991b1b' }
}

// ── Calcolo principale ────────────────────────────────────────────────────────

export function computeTrailScore(
  beautyScore: BeautyScore,
  inputs: TrailScoreInputs,
  pesoNatura = 50,
): TrailScoreResult {
  const distKm = Math.max(inputs.distanceMeters / 1000, 0.1)

  // ── Fatica standard (Naismith) ──
  const tNaismith = distKm / 4.5 + inputs.elevationGain / 600
  const { mult: tMult, label: terrainLabel } = getTerrainMult(inputs.sacScale, inputs.surfaces)
  const fStd = Math.min(Math.max(tNaismith * tMult * 1.4, 1.5), 10)

  // ── Correzione personale ──
  const userFCmax = (inputs.userMaxHeartRate && inputs.userMaxHeartRate > 0)
    ? inputs.userMaxHeartRate
    : deriveFCmax(inputs.userAge)

  let delta = 0
  let deltaSource: TrailScoreBreakdown['deltaSource'] = 'none'

  if (inputs.avgHeartRate && inputs.avgHeartRate > 0) {
    // FC reale vs FC attesa per questa difficoltà standard
    const expectedFcPct = 50 + fStd * 4   // 70% a fStd=5, 82% a fStd=8
    const actualFcPct   = (inputs.avgHeartRate / userFCmax) * 100
    delta       = (actualFcPct - expectedFcPct) / 10
    deltaSource = 'hr'
  } else if (inputs.userAge && inputs.userAge > 0) {
    // Deviazione FCmax rispetto allo standard
    delta       = (STD_FCMAX - userFCmax) / 10
    deltaSource = 'profile'
  }

  // Peso della correzione: proporzionale alla difficoltà del percorso
  const difficultyW = Math.min(Math.max(fStd / 10, 0.15), 1.0)
  const deltaEff    = r1(delta * difficultyW)
  const fFinal      = Math.min(Math.max(fStd + deltaEff, 1.5), 10)

  // ── Bellezza ──
  const pesoCultura = 100 - pesoNatura
  const catMap = Object.fromEntries(beautyScore.categories.map(c => [c.key, c.score]))
  const b1 = ((catMap.natura ?? 0) + (catMap.paesaggio ?? 0)) / 2
  const b2 = ((catMap.archeologia ?? 0) + (catMap.architettura ?? 0) + (catMap.interesse ?? 0)) / 3
  const B  = (b1 * pesoNatura + b2 * pesoCultura) / 100

  const ts = Math.min(Math.max(Math.round((B / fFinal) * 33), 0), 100)

  return {
    ts,
    b: r1(B),
    ...tsLabel(ts),
    breakdown: {
      b1:          r1(b1),
      b2:          r1(b2),
      fStd:        r1(fStd),
      fFinal:      r1(fFinal),
      tNaismith:   r1(tNaismith),
      terrainMult: r1(tMult),
      delta:       r1(delta),
      deltaEff,
      deltaSource,
      difficultyW: r1(difficultyW),
      userFCmax,
      terrainLabel,
    },
  }
}
