// Lean GBIF species lookup for AI prompt context (guide/resoconto) — same
// occurrence search as app/api/flora/route.ts (the "Galleria Verde" UI
// gallery) but without images/Wikipedia descriptions, since the AI only
// needs species names to ground its own narration in real seasonal data.
const GBIF_BASE = 'https://api.gbif.org/v1'
const USER_AGENT = 'DTrek/1.0 (mzulpt@gmail.com)'

export interface FloraSpeciesSummary {
  scientificName: string
  vernacularIta: string | null
  family: string | null
}

interface GbifOccurrence {
  speciesKey?: number
  scientificName?: string
  family?: string
  usageKey?: number
  media?: unknown[]
  decimalLatitude?: number
  decimalLongitude?: number
}

interface GbifSearchResponse {
  results: GbifOccurrence[]
}

interface GbifVernacularName {
  vernacularName: string
  language: string
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal, next: { revalidate: 86400 } })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchVernacularIta(usageKey: number): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/species/${usageKey}/vernacularNames?limit=20`, 1500)
    if (!res.ok) return null
    const data = await res.json() as { results?: GbifVernacularName[] }
    return data.results?.find(v => v.language === 'ita')?.vernacularName ?? null
  } catch {
    return null
  }
}

/** bbox coords in `minLat,maxLat,minLon,maxLon` order, matching GBIF's decimalLatitude/decimalLongitude range params. */
export async function fetchFloraSpeciesSummary(
  minLat: number, maxLat: number, minLon: number, maxLon: number,
  month: number, limit = 12,
): Promise<FloraSpeciesSummary[]> {
  const params = new URLSearchParams()
  params.set('decimalLatitude', `${minLat},${maxLat}`)
  params.set('decimalLongitude', `${minLon},${maxLon}`)
  params.set('kingdomKey', '6') // Plantae
  params.set('month', String(month))
  params.set('hasCoordinate', 'true')
  params.set('limit', '50')

  let data: GbifSearchResponse
  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/occurrence/search?${params.toString()}`, 5000)
    if (!res.ok) return []
    data = await res.json() as GbifSearchResponse
  } catch {
    return []
  }

  const bySpecies = new Map<number, GbifOccurrence>()
  for (const occ of data.results ?? []) {
    if (occ.speciesKey === undefined || !occ.scientificName) continue
    if (!bySpecies.has(occ.speciesKey)) bySpecies.set(occ.speciesKey, occ)
  }

  const deduped = Array.from(bySpecies.values()).slice(0, limit)

  const vernaculars = await Promise.allSettled(
    deduped.map(occ => occ.usageKey ? fetchVernacularIta(occ.usageKey) : Promise.resolve(null)),
  )

  return deduped.map((occ, i) => ({
    scientificName: occ.scientificName!,
    family: occ.family ?? null,
    vernacularIta: vernaculars[i].status === 'fulfilled' ? (vernaculars[i] as PromiseFulfilledResult<string | null>).value : null,
  }))
}
