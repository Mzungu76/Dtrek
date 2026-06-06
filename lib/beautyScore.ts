// lib/beautyScore.ts — DEPRECATED: replaced by lib/tei.ts (TEI v2)
// Kept for backward compat — do not use in new code
import type { PoiItem, TerrainContext } from './overpass'
import type { WikiPage } from './wikipedia'

export interface CategoryScore {
  key: string; label: string; emoji: string
  score: number; grade: string; gradeLabel: string; color: string
  reasons: string[]
}

export interface BeautyScore {
  overall: number; grade: string; gradeLabel: string; color: string
  categories: CategoryScore[]; version: number
}

// ── Grade helper ──────────────────────────────────────────────────────────────

function toGrade(score: number): { grade: string; gradeLabel: string; color: string } {
  if (score >= 8.5) return { grade: 'S', gradeLabel: 'Eccezionale', color: '#7c3aed' }
  if (score >= 7.0) return { grade: 'A', gradeLabel: 'Ottimo',       color: '#059669' }
  if (score >= 5.5) return { grade: 'B', gradeLabel: 'Buono',        color: '#16a34a' }
  if (score >= 4.0) return { grade: 'C', gradeLabel: 'Discreto',     color: '#ca8a04' }
  if (score >= 2.5) return { grade: 'D', gradeLabel: 'Sufficiente',  color: '#ea580c' }
  return               { grade: 'E', gradeLabel: 'Scarso',       color: '#dc2626' }
}

function clamp(v: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, v))
}

// ── Category scoring ──────────────────────────────────────────────────────────

function scoreNatura(
  pois: PoiItem[],
  terrain: TerrainContext,
  elevGain: number,
  altMax: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0

  // cime/vette
  const peaks = pois.filter(p => p.type === 'peak' || p.type === 'pass').length
  const peakScore = Math.min(peaks * 3.0, 9.0)
  if (peakScore > 0) { s += peakScore; reasons.push(`${peaks} cima/valico`) }

  // cascate
  const waterfalls = pois.filter(p => p.type === 'waterfall').length
  const waterfallScore = Math.min(waterfalls * 4.0, 8.0)
  if (waterfallScore > 0) { s += waterfallScore; reasons.push(`${waterfalls} cascata`) }

  // grotte
  const caves = pois.filter(p => p.type === 'cave').length
  const caveScore = Math.min(caves * 3.0, 6.0)
  if (caveScore > 0) { s += caveScore; reasons.push(`${caves} grotta`) }

  // sorgenti
  const springs = pois.filter(p => p.type === 'spring').length
  const springScore = Math.min(springs * 1.6, 4.0)
  if (springScore > 0) { s += springScore; reasons.push(`${springs} sorgente`) }

  // zone altitudinali
  if (altMax > 4000) { s += 4.5; reasons.push('Quota > 4000 m') }
  else if (altMax > 3000) { s += 3.0; reasons.push('Quota > 3000 m') }
  else if (altMax > 2500) { s += 1.5; reasons.push('Quota > 2500 m') }

  // dislivello
  if (elevGain > 1200) { s += 1.0; reasons.push('Dislivello > 1200 m') }
  else if (elevGain > 800) { s += 0.5; reasons.push('Dislivello > 800 m') }

  // terreno
  if (terrain.hasGlacier) { s += 2.0; reasons.push('Ghiacciaio') }
  if (terrain.hasForest)  { s += 0.5; reasons.push('Foresta') }

  // aree protette
  if (terrain.isNationalPark) { s += 1.0; reasons.push('Parco nazionale') }
  else if (terrain.isProtected) { s += 0.5; reasons.push('Area protetta') }

  return { score: clamp(s), reasons }
}

function scorePaesaggio(
  pois: PoiItem[],
  terrain: TerrainContext,
  altMax: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0

  // punti panoramici
  const viewpoints = pois.filter(p => p.type === 'viewpoint').length
  const vpScore = Math.min(viewpoints * 3.0, 9.0)
  if (vpScore > 0) { s += vpScore; reasons.push(`${viewpoints} belvedere`) }

  // quota alta
  if (altMax > 2000) { s += 2.0; reasons.push('Quota > 2000 m') }
  else if (altMax > 1500) { s += 1.0; reasons.push('Quota > 1500 m') }

  // laghi
  if (terrain.hasLake)  { s += 1.5; reasons.push('Lago') }
  if (terrain.hasPond)  { s += 0.5; reasons.push('Stagno/bacino') }

  // fiumi/torrenti
  if (terrain.hasRiver)  { s += 1.0; reasons.push('Fiume') }
  if (terrain.hasStream) { s += 0.5; reasons.push('Torrente') }

  // coste
  if (terrain.hasCoast)    { s += 2.0; reasons.push('Costa') }

  // terreno aperto
  if (terrain.openTerrain) { s += 1.0; reasons.push('Terreno aperto') }

  return { score: clamp(s), reasons }
}

function scoreArcheologia(pois: PoiItem[]): { score: number; reasons: string[] } {
  const archPois = pois.filter(p => p.type === 'ruins' || p.type === 'archaeological')
  const s = Math.min(archPois.length * 4.0, 10.0)
  const reasons = s > 0 ? [`${archPois.length} sito/rovine archeologiche`] : []
  return { score: clamp(s), reasons }
}

function scoreArchitettura(pois: PoiItem[]): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0

  const castles = pois.filter(p => p.type === 'castle').length
  const castleScore = Math.min(castles * 4.0, 8.0)
  if (castleScore > 0) { s += castleScore; reasons.push(`${castles} castello`) }

  const churches = pois.filter(p => p.type === 'chapel').length
  const churchScore = Math.min(churches * 2.0, 6.0)
  if (churchScore > 0) { s += churchScore; reasons.push(`${churches} chiesa/cappella`) }

  const bridges = pois.filter(p => p.type === 'bridge').length
  const bridgeScore = Math.min(bridges * 3.0, 6.0)
  if (bridgeScore > 0) { s += bridgeScore; reasons.push(`${bridges} ponte`) }

  const historic = pois.filter(p => p.type === 'monument' || p.type === 'tower').length
  const historicScore = Math.min(historic * 2.0, 4.0)
  if (historicScore > 0) { s += historicScore; reasons.push(`${historic} monumento/torre`) }

  return { score: clamp(s), reasons }
}

function scoreInteresse(
  pois: PoiItem[],
  wiki: WikiPage[],
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0

  // wiki pages
  const wikiScore = Math.min(wiki.length * 1.0, 5.0)
  if (wikiScore > 0) { s += wikiScore; reasons.push(`${wiki.length} articoli Wikipedia`) }

  // POI type diversity: count distinct types, +0.5 per type above 3, max 3.0
  const distinctTypes = new Set(pois.map(p => p.type)).size
  const diversityScore = Math.min(Math.max(0, (distinctTypes - 3)) * 0.5, 3.0)
  if (diversityScore > 0) { s += diversityScore; reasons.push(`${distinctTypes} tipi POI distinti`) }

  return { score: clamp(s), reasons }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BeautyWeightPrefs {
  natura:        number
  paesaggio:     number
  archeologia:   number
  architettura:  number
  interesse:     number
}

/** Three semantic trade-off sliders that replace the old 5 independent sliders. */
export interface BeautySliders {
  /** 0 = only natura/paesaggio, 100 = only cultura/archeologia/architettura */
  naturaCultura: number
  /** 0 = only paesaggio (panoramic), 100 = only natura (wild) — within the natura group */
  naturaType:    number
  /** 0 = only architettura/interesse (castles), 100 = only archeologia (ruins) — within the cultura group */
  culturaType:   number
}

/** Derives normalized BeautyWeightPrefs from the 3 trade-off sliders. Weights sum to 1. */
export function slidersToWeights(s: BeautySliders): BeautyWeightPrefs {
  const wNat = 1 - s.naturaCultura / 100   // slider=0 (Natura side) → wNat=1
  const wCul = s.naturaCultura / 100        // slider=100 (Cultura side) → wCul=1
  return {
    natura:       wNat * (s.naturaType    / 100),
    paesaggio:    wNat * (1 - s.naturaType    / 100),
    archeologia:  wCul * (s.culturaType   / 100),
    architettura: wCul * (1 - s.culturaType   / 100) * 0.6,
    interesse:    wCul * (1 - s.culturaType   / 100) * 0.4,
  }
}

const DEFAULT_WEIGHTS: BeautyWeightPrefs = {
  natura: 55, paesaggio: 45, archeologia: 35, architettura: 40, interesse: 25,
}

export function normalizeWeights(raw: Partial<BeautyWeightPrefs>): BeautyWeightPrefs {
  const w = { ...DEFAULT_WEIGHTS, ...raw }
  const b1Sum = w.natura + w.paesaggio
  const b2Sum = w.archeologia + w.architettura + w.interesse
  if (b1Sum === 0 || b2Sum === 0) return DEFAULT_WEIGHTS
  return {
    natura:       w.natura       / b1Sum,
    paesaggio:    w.paesaggio    / b1Sum,
    archeologia:  w.archeologia  / b2Sum,
    architettura: w.architettura / b2Sum,
    interesse:    w.interesse    / b2Sum,
  }
}

export function computeBeautyScore(
  pois: PoiItem[],
  wiki: WikiPage[],
  terrain: TerrainContext,
  elevGain: number,
  altMax: number,
  _distanceMeters?: number,
  rawWeights?: Partial<BeautyWeightPrefs>,
): BeautyScore {
  const natura      = scoreNatura(pois, terrain, elevGain, altMax)
  const paesaggio   = scorePaesaggio(pois, terrain, altMax)
  const archeologia = scoreArcheologia(pois)
  const architettura = scoreArchitettura(pois)
  const interesse   = scoreInteresse(pois, wiki)

  // Use raw weights (not normalized-per-group) so inter-group balance reflects the slider.
  const rw = { ...DEFAULT_WEIGHTS, ...(rawWeights ?? {}) }
  const b1Sum = rw.natura + rw.paesaggio || 1
  const b2Sum = rw.archeologia + rw.architettura + rw.interesse || 1
  const b1 = natura.score * (rw.natura / b1Sum) + paesaggio.score * (rw.paesaggio / b1Sum)
  const b2 = archeologia.score * (rw.archeologia / b2Sum) + architettura.score * (rw.architettura / b2Sum) + interesse.score * (rw.interesse / b2Sum)

  const totalNat = rw.natura + rw.paesaggio
  const totalCul = rw.archeologia + rw.architettura + rw.interesse
  const totalSum = totalNat + totalCul || 1
  const overall = clamp(b1 * (totalNat / totalSum) + b2 * (totalCul / totalSum))

  const overallGrade = toGrade(overall)

  const categories: CategoryScore[] = [
    { key: 'natura',      label: 'Natura',      emoji: '🌿', ...toGrade(natura.score),      score: natura.score,      reasons: natura.reasons },
    { key: 'paesaggio',   label: 'Paesaggio',   emoji: '🌄', ...toGrade(paesaggio.score),   score: paesaggio.score,   reasons: paesaggio.reasons },
    { key: 'archeologia', label: 'Archeologia', emoji: '🏛', ...toGrade(archeologia.score), score: archeologia.score, reasons: archeologia.reasons },
    { key: 'architettura',label: 'Architettura',emoji: '🏰', ...toGrade(architettura.score),score: architettura.score,reasons: architettura.reasons },
    { key: 'interesse',   label: 'Interesse',   emoji: '📚', ...toGrade(interesse.score),   score: interesse.score,   reasons: interesse.reasons },
  ]

  return {
    overall,
    grade:      overallGrade.grade,
    gradeLabel: overallGrade.gradeLabel,
    color:      overallGrade.color,
    categories,
    version: 1,
  }
}
