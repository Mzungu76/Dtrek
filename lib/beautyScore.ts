// Beauty scoring for a hike route — fully automatic from POI + Wikipedia data

import type { PoiItem } from './overpass'
import type { WikiPage } from './wikipedia'

export interface CategoryScore {
  key:        string
  label:      string
  emoji:      string
  score:      number        // 0–10
  grade:      string        // voto italiano
  gradeLabel: string        // "Ottimo", "Buono" …
  color:      string        // tailwind bg color
  reasons:    string[]      // short motivations
}

export interface BeautyScore {
  categories: CategoryScore[]
  overall:    number        // media semplice
  grade:      string
  gradeLabel: string
  color:      string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp10(n: number): number {
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10))
}

function gradeFrom(score: number): { grade: string; gradeLabel: string; color: string } {
  if (score >= 9)  return { grade: '10',  gradeLabel: 'Eccellente',  color: '#16a34a' }
  if (score >= 8)  return { grade: '9',   gradeLabel: 'Ottimo',      color: '#22c55e' }
  if (score >= 7)  return { grade: '8',   gradeLabel: 'Buono',       color: '#84cc16' }
  if (score >= 6)  return { grade: '7',   gradeLabel: 'Discreto',    color: '#eab308' }
  if (score >= 5)  return { grade: '6',   gradeLabel: 'Sufficiente', color: '#f97316' }
  if (score >= 4)  return { grade: '5',   gradeLabel: 'Mediocre',    color: '#fb923c' }
  return             { grade: '4',   gradeLabel: 'Insufficiente',color: '#ef4444' }
}

function wikiMatches(pages: WikiPage[], keywords: string[]): WikiPage[] {
  return pages.filter(p => {
    const text = `${p.title} ${p.description ?? ''} ${p.extract}`.toLowerCase()
    return keywords.some(k => text.includes(k))
  })
}

// ── Scoring functions ─────────────────────────────────────────────────────────

function scoreNatura(pois: PoiItem[], wiki: WikiPage[], elevGain: number): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const peaks     = pois.filter(p => p.type === 'peak')
  const waterfalls = pois.filter(p => p.type === 'waterfall')
  const caves     = pois.filter(p => p.type === 'cave')
  const springs   = pois.filter(p => p.type === 'spring')

  if (peaks.length)     { score += Math.min(peaks.length * 1.5, 4);     reasons.push(`${peaks.length} cim${peaks.length > 1 ? 'e' : 'a'}`) }
  if (waterfalls.length){ score += Math.min(waterfalls.length * 2.5, 5); reasons.push(`${waterfalls.length} cascata${waterfalls.length > 1 ? 'e' : ''}`) }
  if (caves.length)     { score += Math.min(caves.length * 2, 4);        reasons.push(`${caves.length} grott${caves.length > 1 ? 'e' : 'a'}`) }
  if (springs.length)   { score += Math.min(springs.length * 0.5, 1.5);  reasons.push(`${springs.length} sorgent${springs.length > 1 ? 'i' : 'e'}`) }

  // Elevation gain
  if      (elevGain >= 1000) { score += 2;   reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 500)  { score += 1.5; reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 200)  { score += 1;   reasons.push(`dislivello ${Math.round(elevGain)} m`) }

  // Wiki: natural keywords
  const natWiki = wikiMatches(wiki, ['lago', 'monte', 'bosco', 'foresta', 'vulcano', 'fiume', 'riserva naturale', 'parco nazionale', 'parco naturale'])
  if (natWiki.length) { score += Math.min(natWiki.length * 0.8, 2); reasons.push(`${natWiki.length} luoghi naturali`) }

  const g = gradeFrom(clamp10(score))
  return { key: 'natura', label: 'Natura', emoji: '🌿', score: clamp10(score), ...g, reasons }
}

function scorePaesaggio(pois: PoiItem[], wiki: WikiPage[], altMax: number, elevGain: number): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const viewpoints = pois.filter(p => p.type === 'viewpoint')
  if (viewpoints.length) { score += Math.min(viewpoints.length * 2.5, 7); reasons.push(`${viewpoints.length} belvedere`) }

  // Altitude
  if      (altMax >= 2000) { score += 2;   reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 1000) { score += 1.5; reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 500)  { score += 1;   reasons.push(`quota ${Math.round(altMax)} m`) }

  // Wide elevation swing
  if (elevGain >= 800) { score += 0.5; }

  // Wiki: panoramic keywords
  const panWiki = wikiMatches(wiki, ['lago', 'panorama', 'caldera', 'pianura', 'valle', 'costa', 'mare', 'golfo'])
  if (panWiki.length) { score += Math.min(panWiki.length * 0.8, 2); reasons.push(`${panWiki.length} luoghi panoramici`) }

  const g = gradeFrom(clamp10(score))
  return { key: 'paesaggio', label: 'Paesaggio', emoji: '🌄', score: clamp10(score), ...g, reasons }
}

function scoreArcheologia(pois: PoiItem[], wiki: WikiPage[]): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const ruins = pois.filter(p => p.type === 'ruins')
  if (ruins.length) { score += Math.min(ruins.length * 3, 6); reasons.push(`${ruins.length} sito${ruins.length > 1 ? '/i' : ''} storico${ruins.length > 1 ? '/i' : ''}`) }

  // Wiki: archaeological keywords
  const archWiki = wikiMatches(wiki, ['etrusco', 'romano', 'antico', 'preistorico', 'medievale', 'necropoli', 'archeolog', 'villaggio', 'insediamento', 'età del ferro', 'età del bronzo', 'rinascimento'])
  if (archWiki.length) { score += Math.min(archWiki.length * 2.5, 7); reasons.push(archWiki.map(p => p.title).join(', ')) }

  const g = gradeFrom(clamp10(score))
  return { key: 'archeologia', label: 'Archeologia', emoji: '🏛', score: clamp10(score), ...g, reasons }
}

function scoreArchitettura(pois: PoiItem[], wiki: WikiPage[]): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const huts    = pois.filter(p => p.type === 'hut' || p.type === 'bivouac')
  const crosses = pois.filter(p => p.type === 'cross')
  const ruins   = pois.filter(p => p.type === 'ruins')

  if (crosses.length) { score += Math.min(crosses.length * 0.7, 2);   reasons.push(`${crosses.length} croce${crosses.length > 1 ? 'i' : ''}`) }
  if (huts.length)    { score += Math.min(huts.length * 0.7, 2);       reasons.push(`${huts.length} rifugio/i`) }
  if (ruins.length)   { score += Math.min(ruins.length * 1, 2); }

  // Wiki: architectural / religious keywords
  const archWiki = wikiMatches(wiki, ['chiesa', 'basilica', 'convento', 'abbazia', 'duomo', 'palazzo', 'torre', 'castello', 'santuario', 'cattedrale', 'tempio', 'oratorio', 'cappella', 'monastero'])
  if (archWiki.length) { score += Math.min(archWiki.length * 2.5, 8); reasons.push(archWiki.map(p => p.title).join(', ')) }

  const g = gradeFrom(clamp10(score))
  return { key: 'architettura', label: 'Architettura', emoji: '⛪', score: clamp10(score), ...g, reasons }
}

function scoreInteresse(pois: PoiItem[], wiki: WikiPage[]): CategoryScore {
  let score = 0
  const reasons: string[] = []

  // Wikipedia richness
  if (wiki.length) { score += Math.min(wiki.length * 1.5, 6); reasons.push(`${wiki.length} articoli Wikipedia`) }

  // POI variety (number of distinct types)
  const types = new Set(pois.map(p => p.type))
  if (types.size > 0) { score += Math.min(types.size * 0.7, 3); reasons.push(`${pois.length} POI (${types.size} tipologie)`) }

  // Overall density bonus
  if (pois.length >= 5 && wiki.length >= 3) score += 1

  const g = gradeFrom(clamp10(score))
  return { key: 'interesse', label: 'Interesse culturale', emoji: '📚', score: clamp10(score), ...g, reasons }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeBeautyScore(
  pois:      PoiItem[],
  wiki:      WikiPage[],
  elevGain:  number,
  altMax:    number,
): BeautyScore {
  const categories = [
    scoreNatura(pois, wiki, elevGain),
    scorePaesaggio(pois, wiki, altMax, elevGain),
    scoreArcheologia(pois, wiki),
    scoreArchitettura(pois, wiki),
    scoreInteresse(pois, wiki),
  ]

  const overall = clamp10(categories.reduce((s, c) => s + c.score, 0) / categories.length)
  const { grade, gradeLabel, color } = gradeFrom(overall)

  return { categories, overall, grade, gradeLabel, color }
}
