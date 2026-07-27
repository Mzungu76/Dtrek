// Assembles real naturalistic/phenological data (OSM forest type, GBIF
// seasonal species observations — the "Galleria Verde") into a text block
// for AI prompts (guide, resoconto), so the model grounds the
// nature-related sections in actual data instead of guessing.
import { computeBbox } from './geoUtils'
import { fetchFloraAlongRoute } from './overpassFlora'
import { fetchFloraSpeciesSummary, type FloraSpeciesSummary } from './gbifFloraSummary'
import type { FloraResult } from './floraTypes'

export interface NatureContext {
  forest: FloraResult | null
  species: FloraSpeciesSummary[]
}

const EMPTY: NatureContext = { forest: null, species: [] }

export async function fetchNatureContext(params: {
  trackPoints: Array<{ lat?: number; lon?: number }>
  altitudeMax?: number
  month: number
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

  return { ...EMPTY, forest, species }
}

/** Renders the context as a flat list of Italian sentences for prompt insertion. Returns '' when nothing is available. */
export function formatNatureContextBlock(ctx: NatureContext): string {
  const lines: string[] = []

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
