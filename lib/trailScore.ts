// TrailScore (TS) — punteggio unico che risponde "ne è valsa la pena?"
//
// Componenti:
//   B  = Bellezza (da OSM POI + Wikipedia + terreno, ponderata Natura/Cultura)
//        Auto-boost montagna: su sentieri alpini il peso Natura viene aumentato
//        automaticamente (fino a +20%) perché la cultura è irrilevante in quota.
//   F  = Fatica = F_std (Naismith + SAC) corretta con profilo personale
//
//   TS = clamp(B / √F × 20, 0, 100)
//
//   La radice quadrata di F attenua la penalizzazione dei trail difficili:
//   B=10, F=1.5 → TS≈100 (Imperdibile); B=10, F=8 → TS≈70 (Eccellente)
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
  altitudeMax?:      number
  surfaces?:         string[]
  // Correzione personale (opzionale)
  userAge?:          number
  userMaxHeartRate?: number
  avgHeartRate?:     number   // FC media percorso completato (priorità massima)
  personalDelta?:    number   // delta medio storico da uscite precedenti
  hrHikeCount?:      number   // quante uscite con FC hanno contribuito al delta
  // Preferenze escursionistiche (0–100, default 50 = neutro)
  prefSforzo?:       number
  prefRitmo?:        number
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
  deltaSource: 'none' | 'profile' | 'personal' | 'hr'
  difficultyW: number   // peso difficoltà 0–1
  hrHikeCount: number   // uscite con FC usate per il delta personale
  userFCmax:   number   // FCmax utente usata
  terrainLabel: string  // "T2", "sentiero", "default", …
  sfidaBonus:          number   // aggiustamento preferenza Sforzo
  ritmoBonus:          number   // aggiustamento preferenza Ritmo
  mountainNaturaBoost: number   // auto-boost pesoNatura per sentieri montani (0 se assente)
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
  } else if (inputs.personalDelta !== undefined && (inputs.hrHikeCount ?? 0) >= 4) {
    // Profilo calibrato su uscite reali (priorità su sola età)
    delta       = inputs.personalDelta
    deltaSource = 'personal'
  } else if (inputs.userAge && inputs.userAge > 0) {
    // Deviazione FCmax rispetto allo standard
    delta       = (STD_FCMAX - userFCmax) / 10
    deltaSource = 'profile'
  }

  // Peso della correzione: proporzionale alla difficoltà del percorso
  const difficultyW = Math.min(Math.max(fStd / 10, 0.15), 1.0)
  const deltaEff    = r1(delta * difficultyW)
  const fFinal      = Math.min(Math.max(fStd + deltaEff, 1.5), 10)

  // ── Bellezza ── con auto-boost natura per sentieri montani
  const altMax = inputs.altitudeMax ?? 0
  const sacVal = ({ T1:1, T2:2, T3:3, T4:4, T5:5, T6:6 } as Record<string,number>)[inputs.sacScale ?? ''] ?? 0
  // Se quota o scala SAC indicano terreno montano, riduce il peso della cultura
  // (su un sentiero alpino non ci sono cattedrali né siti archeol. — non è un difetto)
  const altBoost = altMax >= 2500 ? 45 : altMax >= 2000 ? 35 : altMax >= 1600 ? 25 : altMax >= 1200 ? 12 : 0
  const sacBoost = sacVal >= 4 ? 45 : sacVal >= 3 ? 25 : sacVal >= 2 ? 12 : 0
  const mountainNaturaBoost = Math.min(50, Math.max(altBoost, sacBoost))
  const effectivePesoNatura = Math.min(100, pesoNatura + mountainNaturaBoost)
  const effectivePesoCultura = 100 - effectivePesoNatura

  const catMap = Object.fromEntries(beautyScore.categories.map(c => [c.key, c.score]))
  const b1 = ((catMap.natura ?? 0) + (catMap.paesaggio ?? 0)) / 2
  const b2 = ((catMap.archeologia ?? 0) + (catMap.architettura ?? 0) + (catMap.interesse ?? 0)) / 3
  // Natura è il pavimento: la cultura aumenta B solo quando supera la natura.
  // Questo evita di penalizzare percorsi senza dati culturali OSM (molto comune in montagna
  // e nelle zone rurali dove OSM è poco aggiornato).
  const B = Math.min(10, b2 > b1
    ? (b1 * effectivePesoNatura + b2 * effectivePesoCultura) / 100
    : b1)

  const tsBase = Math.round((B / Math.sqrt(fFinal)) * 20)

  // ── Preferenze escursionistiche ──
  const sfidaNorm  = ((inputs.prefSforzo ?? 50) - 50) / 50  // -1 to +1
  const effortNorm = (fFinal - 1.5) / 8.5                    // 0 to 1
  const sfidaBonus = Math.round(sfidaNorm * effortNorm * 20)

  const ritmoNorm        = ((inputs.prefRitmo ?? 50) - 50) / 50
  const beautyDensity    = B / Math.max(tNaismith, 0.5)
  const bDensityNorm     = Math.min(Math.max((beautyDensity - 0.3) / 4.7, 0), 1)
  const ritmoBonus       = Math.round(ritmoNorm * (bDensityNorm - 0.5) * 20)

  const ts = Math.min(Math.max(tsBase + sfidaBonus + ritmoBonus, 0), 100)

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
      hrHikeCount: inputs.hrHikeCount ?? 0,
      userFCmax,
      terrainLabel,
      sfidaBonus,
      ritmoBonus,
      mountainNaturaBoost,
    },
  }
}
