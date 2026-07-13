// Assembles real naturalistic/phenological data (satellite NDVI/phenology,
// OSM forest type, GBIF seasonal species observations — the "Galleria
// Verde") into a text block for AI prompts (guide, resoconto), so the model
// grounds the nature-related sections in actual data instead of guessing.
import { computeBbox } from './geoUtils'
import { fetchFloraAlongRoute } from './overpassFlora'
import { fetchFloraSpeciesSummary, type FloraSpeciesSummary } from './gbifFloraSummary'
import type { FloraResult } from './floraTypes'

const MONTHS_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

export interface S2ContextInput {
  available?: boolean | null
  phenologyPeakMonth?: number | null
  ndviDelta?: number | null
  landscapeVariety?: number | null
  shadeScore?: number | null
  waterSources?: unknown[] | null
}

export interface NatureContext {
  forest: FloraResult | null
  species: FloraSpeciesSummary[]
  phenologyPeakMonth: number | null
  ndviDelta: number | null
  landscapeVariety: number | null
  shadeScore: number | null
  waterSourcesCount: number
}

const EMPTY: NatureContext = {
  forest: null, species: [], phenologyPeakMonth: null, ndviDelta: null,
  landscapeVariety: null, shadeScore: null, waterSourcesCount: 0,
}

export async function fetchNatureContext(params: {
  trackPoints: Array<{ lat?: number; lon?: number }>
  altitudeMax?: number
  month: number
  s2?: S2ContextInput
}): Promise<NatureContext> {
  const coords = params.trackPoints
    .filter((p): p is { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined)
    .map(p => [p.lat, p.lon] as [number, number])

  let forest: FloraResult | null = null
  let species: FloraSpeciesSummary[] = []

  if (coords.length >= 2) {
    const bbox = computeBbox(coords) // "minLat,minLon,maxLat,maxLon"
    const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
    const [forestRes, speciesRes] = await Promise.allSettled([
      fetchFloraAlongRoute(bbox, params.altitudeMax),
      fetchFloraSpeciesSummary(minLat, maxLat, minLon, maxLon, params.month),
    ])
    if (forestRes.status === 'fulfilled') forest = forestRes.value
    if (speciesRes.status === 'fulfilled') species = speciesRes.value
  }

  const s2 = params.s2
  return {
    ...EMPTY,
    forest,
    species,
    phenologyPeakMonth: s2?.available ? s2.phenologyPeakMonth ?? null : null,
    ndviDelta:          s2?.available ? s2.ndviDelta ?? null : null,
    landscapeVariety:   s2?.available ? s2.landscapeVariety ?? null : null,
    shadeScore:         s2?.available ? s2.shadeScore ?? null : null,
    waterSourcesCount:  s2?.waterSources?.length ?? 0,
  }
}

/** Renders the context as a flat list of Italian sentences for prompt insertion. Returns '' when nothing is available. */
export function formatNatureContextBlock(ctx: NatureContext): string {
  const lines: string[] = []

  if (ctx.phenologyPeakMonth) lines.push(`Picco stagionale di vegetazione: ${MONTHS_IT[ctx.phenologyPeakMonth - 1]} (dato satellitare NDVI).`)
  if (ctx.ndviDelta != null && ctx.ndviDelta < -0.1) lines.push('Vegetazione in calo rispetto alla media stagionale (dato satellitare recente).')
  else if (ctx.ndviDelta != null && ctx.ndviDelta > 0.1) lines.push('Vegetazione in forte crescita rispetto alla media stagionale (dato satellitare recente).')
  if (ctx.landscapeVariety != null) {
    lines.push(ctx.landscapeVariety > 0.12 ? 'Paesaggio molto variegato lungo il percorso (dato satellitare).' : 'Paesaggio piuttosto uniforme lungo il percorso (dato satellitare).')
  }
  if (ctx.shadeScore != null) lines.push(`Copertura d'ombra stimata lungo il percorso: ${Math.round(ctx.shadeScore * 100)}%.`)
  if (ctx.waterSourcesCount > 0) lines.push(`${ctx.waterSourcesCount} fonte/i d'acqua rilevata/e (dati OpenStreetMap) lungo il percorso.`)

  const leafLabel: Record<string, string> = { broadleaved: 'latifoglie', needleleaved: 'conifere', mixed: 'bosco misto' }
  if (ctx.forest?.leafTypeDominant) {
    lines.push(`Bosco prevalente: ${leafLabel[ctx.forest.leafTypeDominant]}${ctx.forest.forestCoveragePct != null ? ` (copertura boschiva ~${ctx.forest.forestCoveragePct}%)` : ''}.`)
  } else if (ctx.forest?.estimatedBelt) {
    lines.push(`${ctx.forest.estimatedBelt.label} (stima da quota/zona): ${ctx.forest.estimatedBelt.description}`)
  }
  if (ctx.forest?.speciesFound.length) {
    lines.push(`Specie/generi arborei annotati su OSM lungo il percorso: ${ctx.forest.speciesFound.join(', ')}.`)
  }

  if (ctx.species.length > 0) {
    const speciesLines = ctx.species.map(s => s.vernacularIta ? `${s.vernacularIta} (${s.scientificName})` : s.scientificName)
    lines.push(`Specie vegetali osservate in zona in questo periodo dell'anno — dati GBIF/iNaturalist, "Galleria Verde": ${speciesLines.join(', ')}.`)
  }

  return lines.join('\n')
}
