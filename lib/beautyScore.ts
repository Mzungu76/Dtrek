// Beauty scoring for a hike route — from POI, TerrainContext, and Wikipedia data

import type { PoiItem, TerrainContext } from './overpass'
import type { WikiPage } from './wikipedia'

export interface CategoryScore {
  key:        string
  label:      string
  emoji:      string
  score:      number
  grade:      string
  gradeLabel: string
  color:      string
  reasons:    string[]
}

export interface BeautyScore {
  categories: CategoryScore[]
  overall:    number
  grade:      string
  gradeLabel: string
  color:      string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp10(n: number): number {
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10))
}

function gradeFrom(score: number): { grade: string; gradeLabel: string; color: string } {
  if (score >= 9)  return { grade: '10', gradeLabel: 'Eccellente',   color: '#16a34a' }
  if (score >= 8)  return { grade: '9',  gradeLabel: 'Ottimo',       color: '#22c55e' }
  if (score >= 7)  return { grade: '8',  gradeLabel: 'Buono',        color: '#84cc16' }
  if (score >= 6)  return { grade: '7',  gradeLabel: 'Discreto',     color: '#eab308' }
  if (score >= 5)  return { grade: '6',  gradeLabel: 'Sufficiente',  color: '#f97316' }
  if (score >= 4)  return { grade: '5',  gradeLabel: 'Mediocre',     color: '#fb923c' }
  return             { grade: '4',  gradeLabel: 'Insufficiente', color: '#ef4444' }
}

function wikiMatches(pages: WikiPage[], keywords: string[]): WikiPage[] {
  return pages.filter(p => {
    const text = `${p.title} ${p.description ?? ''} ${p.extract}`.toLowerCase()
    return keywords.some(k => text.includes(k))
  })
}

// ── Category scorers ─────────────────────────────────────────────────────────

function scoreNatura(
  pois:     PoiItem[],
  wiki:     WikiPage[],
  terrain:  TerrainContext,
  elevGain: number,
  altMax:   number,
  distKm:   number,
): CategoryScore {
  let score = 0
  const reasons: string[] = []

  // POI naturali specifici
  const peaks      = pois.filter(p => p.type === 'peak')
  const waterfalls = pois.filter(p => p.type === 'waterfall')
  const caves      = pois.filter(p => p.type === 'cave')
  const springs    = pois.filter(p => p.type === 'spring')

  if (peaks.length)      { score += Math.min(peaks.length * 1.5, 4);     reasons.push(`${peaks.length} cim${peaks.length > 1 ? 'e' : 'a'}`) }
  if (waterfalls.length) { score += Math.min(waterfalls.length * 2.5, 5); reasons.push(`${waterfalls.length} cascata${waterfalls.length > 1 ? 'e' : ''}`) }
  if (caves.length)      { score += Math.min(caves.length * 2, 4);        reasons.push(`${caves.length} grott${caves.length > 1 ? 'e' : 'a'}`) }
  if (springs.length)    { score += Math.min(springs.length * 0.5, 1.5);  reasons.push(`${springs.length} sorgent${springs.length > 1 ? 'i' : 'e'}`) }

  // Dislivello
  if      (elevGain >= 1500) { score += 3;   reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 1000) { score += 2.5; reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 800)  { score += 2;   reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 500)  { score += 1.5; reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 200)  { score += 1;   reasons.push(`dislivello ${Math.round(elevGain)} m`) }
  else if (elevGain >= 50)   { score += 0.5 }

  // Zona altitudinale — bellezza intrinseca indipendente dai POI
  if      (altMax >= 3000) { score += 5;   reasons.push(`zona alpina alta (${Math.round(altMax)} m s.l.m.)`) }
  else if (altMax >= 2500) { score += 4;   reasons.push(`alta montagna (${Math.round(altMax)} m s.l.m.)`) }
  else if (altMax >= 2000) { score += 3.5; reasons.push(`zona alpina (${Math.round(altMax)} m s.l.m.)`) }
  else if (altMax >= 1500) { score += 2.5; reasons.push(`zona sub-alpina (${Math.round(altMax)} m s.l.m.)`) }
  else if (altMax >= 1000) { score += 1.5; reasons.push(`fascia montana (${Math.round(altMax)} m s.l.m.)`) }
  else if (altMax >= 500)  { score += 0.8; reasons.push(`fascia collinare (${Math.round(altMax)} m s.l.m.)`) }
  else                     { score += 0.3 }

  // Lunghezza — percorsi più lunghi sono più immersi nell'ambiente
  if      (distKm >= 20) { score += 1.5; reasons.push(`percorso lungo ${Math.round(distKm)} km`) }
  else if (distKm >= 12) { score += 1 }
  else if (distKm >= 7)  { score += 0.5 }
  else if (distKm >= 4)  { score += 0.2 }

  // Dati terreno OSM (way/relation)
  if (terrain.isNationalPark)              { score += 2.5; reasons.push('parco nazionale') }
  else if (terrain.isProtected)            { score += 2;   reasons.push('area naturale protetta') }
  if (terrain.hasGlacier)                  { score += 3;   reasons.push('ghiacciaio') }
  if (terrain.hasLake)                     { score += 2;   reasons.push('lago') }
  if (terrain.hasForest)                   { score += 1.5; reasons.push('bosco/foresta') }
  if (terrain.openTerrain)                 { score += 1;   reasons.push('terreno aperto') }
  if (terrain.sacScale && terrain.sacScale >= 'T3') { score += 0.5; reasons.push(`sentiero ${terrain.sacScale}`) }

  // Wikipedia — keyword naturalistiche espanse
  // Prima i parchi/riserve (peso maggiore)
  const parkWiki = wikiMatches(wiki, [
    'parco nazionale', 'parco naturale', 'parco regionale', 'parco provinciale',
    'riserva naturale', 'riserva biogenetica', 'sito di interesse comunitario',
    'zona speciale di conservazione',
  ])
  const parkIds = new Set(parkWiki.map(p => p.title))
  if (parkWiki.length > 0) {
    score += Math.min(parkWiki.length * 3, 5)
    reasons.push(parkWiki[0].title)
  }

  // Poi habitat e paesaggi naturali
  const natWiki = wikiMatches(wiki, [
    'lago', 'monte', 'bosco', 'foresta', 'vulcano', 'fiume', 'torrente',
    'valle', 'gola', 'forra', 'gorge', 'tufo', 'rupe', 'caldera',
    'sorgente', 'natura', 'ambiente naturale', 'habitat',
  ]).filter(p => !parkIds.has(p.title))
  if (natWiki.length > 0) {
    score += Math.min(natWiki.length * 1.5, 4)
    if (parkWiki.length === 0) reasons.push(`${natWiki.length} luoghi naturali`)
  }

  const g = gradeFrom(clamp10(score))
  return { key: 'natura', label: 'Natura', emoji: '🌿', score: clamp10(score), ...g, reasons }
}

function scorePaesaggio(
  pois:     PoiItem[],
  wiki:     WikiPage[],
  terrain:  TerrainContext,
  altMax:   number,
  elevGain: number,
  distKm:   number,
): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const viewpoints = pois.filter(p => p.type === 'viewpoint')
  if (viewpoints.length) { score += Math.min(viewpoints.length * 2.5, 7); reasons.push(`${viewpoints.length} belvedere`) }

  // Quota massima — panorami e scenari aumentano con l'altitudine
  if      (altMax >= 3000) { score += 7;   reasons.push(`quota alpina alta ${Math.round(altMax)} m`) }
  else if (altMax >= 2500) { score += 6;   reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 2000) { score += 5;   reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 1500) { score += 4;   reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 1000) { score += 2.5; reasons.push(`quota ${Math.round(altMax)} m`) }
  else if (altMax >= 500)  { score += 1.5; reasons.push(`quota ${Math.round(altMax)} m`) }
  else                     { score += 0.3 }

  // Dati terreno OSM
  if (terrain.hasGlacier)    { score += 2.5; reasons.push('ghiacciaio') }
  if (terrain.hasLake)       { score += 2;   reasons.push('lago') }
  if (terrain.hasCoast)      { score += 2;   reasons.push('vista mare/costa') }
  if (terrain.openTerrain)   { score += 1.5; reasons.push('terreno aperto (panorami)') }
  if (terrain.hasForest)     { score += 0.5; reasons.push('bosco/foresta') }
  if (terrain.isNationalPark) { score += 1;  reasons.push('parco nazionale') }
  else if (terrain.isProtected) { score += 0.8; reasons.push('area protetta') }

  // Lunghezza — percorsi lunghi espongono a scenari variati
  if      (distKm >= 15) { score += 1;   reasons.push(`percorso ${Math.round(distKm)} km`) }
  else if (distKm >= 8)  { score += 0.5 }
  else if (distKm >= 4)  { score += 0.2 }

  // Wikipedia — paesaggi e scenari (peso 1.8, cap 7)
  const scenicWiki = wikiMatches(wiki, [
    'lago', 'panorama', 'belvedere', 'caldera', 'pianura', 'costa', 'mare', 'golfo',
    'valle', 'gola', 'forra', 'rupe', 'dirupo', 'promontorio', 'collina', 'crinale',
    'tufo', 'altopiano', 'canyon', 'paesaggio', 'scenario',
  ])
  if (scenicWiki.length > 0) {
    score += Math.min(scenicWiki.length * 1.8, 7)
    reasons.push(`${scenicWiki.length} luoghi panoramici`)
  }

  const g = gradeFrom(clamp10(score))
  return { key: 'paesaggio', label: 'Paesaggio', emoji: '🌄', score: clamp10(score), ...g, reasons }
}

function scoreArcheologia(pois: PoiItem[], wiki: WikiPage[]): CategoryScore {
  let score = 0
  const reasons: string[] = []

  const ruins = pois.filter(p => p.type === 'ruins')
  if (ruins.length) { score += Math.min(ruins.length * 3, 6); reasons.push(`${ruins.length} sito${ruins.length > 1 ? '/i' : ''} storico${ruins.length > 1 ? '/i' : ''}`) }

  const archWiki = wikiMatches(wiki, [
    'etrusco', 'romano', 'antico', 'preistorico', 'medievale', 'necropoli',
    'archeolog', 'villaggio', 'insediamento', 'età del ferro', 'età del bronzo',
    'rinascimento', 'falisco', 'osco', 'sabino', 'longobardo', 'nuragico',
  ])
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

  if (crosses.length) { score += Math.min(crosses.length * 0.7, 2); reasons.push(`${crosses.length} croce${crosses.length > 1 ? 'i' : ''}`) }
  if (huts.length)    { score += Math.min(huts.length * 0.7, 2);    reasons.push(`${huts.length} rifugio/i`) }
  if (ruins.length)   { score += Math.min(ruins.length * 1, 2) }

  const archWiki = wikiMatches(wiki, [
    // religiosi
    'chiesa', 'basilica', 'convento', 'abbazia', 'duomo', 'santuario',
    'cattedrale', 'tempio', 'oratorio', 'cappella', 'monastero', 'pieve',
    // civili e militari
    'palazzo', 'torre', 'castello', 'rocca', 'fortezza', 'mura', 'porta',
    // borghi e insediamenti
    'borgo', 'comune', 'paese', 'centro storico', 'insediamento rupestre',
    'rupestre', 'villaggio', 'necropoli',
  ])
  if (archWiki.length) { score += Math.min(archWiki.length * 2.5, 8); reasons.push(archWiki.map(p => p.title).join(', ')) }

  const g = gradeFrom(clamp10(score))
  return { key: 'architettura', label: 'Architettura', emoji: '⛪', score: clamp10(score), ...g, reasons }
}

function scoreInteresse(pois: PoiItem[], wiki: WikiPage[]): CategoryScore {
  let score = 0
  const reasons: string[] = []

  if (wiki.length) { score += Math.min(wiki.length * 1.5, 7); reasons.push(`${wiki.length} articoli Wikipedia`) }

  const types = new Set(pois.map(p => p.type))
  if (types.size > 0) { score += Math.min(types.size * 0.7, 3); reasons.push(`${pois.length} POI (${types.size} tipologie)`) }

  if (pois.length >= 5 && wiki.length >= 3) score += 1

  const g = gradeFrom(clamp10(score))
  return { key: 'interesse', label: 'Interesse culturale', emoji: '📚', score: clamp10(score), ...g, reasons }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeBeautyScore(
  pois:            PoiItem[],
  wiki:            WikiPage[],
  terrain:         TerrainContext,
  elevGain:        number,
  altMax:          number,
  distanceMeters?: number,
): BeautyScore {
  const distKm = (distanceMeters ?? 0) / 1000
  const categories = [
    scoreNatura(pois, wiki, terrain, elevGain, altMax, distKm),
    scorePaesaggio(pois, wiki, terrain, altMax, elevGain, distKm),
    scoreArcheologia(pois, wiki),
    scoreArchitettura(pois, wiki),
    scoreInteresse(pois, wiki),
  ]

  const overall = clamp10(categories.reduce((s, c) => s + c.score, 0) / categories.length)
  const { grade, gradeLabel, color } = gradeFrom(overall)

  return { categories, overall, grade, gradeLabel, color }
}
