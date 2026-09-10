import crypto from 'crypto'
import { runWithConcurrency } from '@/lib/promisePool'

export const GBIF_BASE = 'https://api.gbif.org/v1'
export const GBIF_USER_AGENT = 'DTrek/1.0 (mzulpt@gmail.com)'

export interface GbifMedia {
  identifier?: string
  rightsHolder?: string
  creator?: string
  license?: string
}

export interface GbifOccurrence {
  key: number
  speciesKey?: number
  scientificName?: string
  species?: string // canonical binomial, no author — what Wikipedia titles use
  family?: string
  class?: string
  order?: string
  usageKey?: number
  license?: string
  media?: GbifMedia[]
  decimalLatitude?: number
  decimalLongitude?: number
}

export interface GbifSearchResponse {
  count: number
  results: GbifOccurrence[]
}

interface GbifVernacularName {
  vernacularName: string
  language: string
}

// GBIF's scientificName carries the taxonomic author (e.g. "Quercus ilex L."),
// which never matches a Wikipedia title. Prefer the canonical "species" field;
// fall back to stripping the author suffix off scientificName via regex.
export function canonicalSpeciesName(occ: GbifOccurrence): string | null {
  if (occ.species) return occ.species
  const sn = occ.scientificName
  if (!sn) return null
  const m = sn.match(/^([A-Z][a-zà-ÿ]+(?:\s+[×x]\s*[a-zà-ÿ-]+|\s+[a-zà-ÿ-]+){1,2})/)
  return m ? m[1] : null
}

export function imageApiUrl(gbifKey: number, identifier: string, size: '120x' | '400x'): string {
  const md5 = crypto.createHash('md5').update(identifier).digest('hex')
  return `${GBIF_BASE.replace('/v1', '')}/v1/image/cache/${size}/occurrence/${gbifKey}/media/${md5}`
}

export function licenseLabel(license: string | undefined): string {
  if (!license) return 'Licenza non specificata'
  if (license.includes('CC0')) return 'CC0'
  if (license.includes('CC_BY') || license.includes('CC-BY')) return 'CC BY 4.0'
  return license
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': GBIF_USER_AGENT },
      signal: controller.signal,
      next: { revalidate: 86400 },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchVernacularIta(usageKey: number): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/species/${usageKey}/vernacularNames?limit=20`, 2000)
    if (!res.ok) return null
    const data = await res.json() as { results?: GbifVernacularName[] }
    const match = data.results?.find(v => v.language === 'ita')
    return match?.vernacularName ?? null
  } catch {
    return null
  }
}

export async function fetchWikiSummary(title: string, lang: 'it' | 'en'): Promise<string | null> {
  try {
    const slug = encodeURIComponent(title.replace(/ /g, '_'))
    const res = await fetchWithTimeout(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`, 2500)
    if (!res.ok) return null
    const data = await res.json() as { extract?: string; type?: string }
    if (!data.extract || data.extract.length < 30 || data.type === 'disambiguation') return null
    return data.extract
  } catch {
    return null
  }
}

// Best-effort short description: Italian Wikipedia article for the scientific
// name first (species names are also valid Wikipedia titles in most
// languages), falling back to English Wikipedia if no Italian article exists.
export async function fetchSpeciesDescription(scientificName: string): Promise<string | null> {
  const it = await fetchWikiSummary(scientificName, 'it')
  if (it) return it
  return fetchWikiSummary(scientificName, 'en')
}

// Quanti item vengono arricchiti in parallelo — stesso numero totale di chiamate a
// GBIF/Wikipedia di prima, solo spalmate nel tempo invece che tutte insieme: così anche più
// utenti che aprono zone mai viste nello stesso istante non generano un unico picco di
// richieste verso quelle API pubbliche (vedi lib/galleryCascade.ts per lo stesso principio
// applicato alle celle di cache).
const ENRICH_CONCURRENCY = 5

/** Nome italiano (solo per specie con gbifUsageKey, cioè da GBIF) + descrizione (Wikipedia IT
 *  poi EN) per ogni item di app/api/flora e app/api/animals — condiviso perché identico nelle
 *  due route. */
export async function enrichSpeciesItems<T extends { vernacularNameIt: string | null; gbifUsageKey: number | null; scientificName: string; description: string | null }>(
  items: T[],
): Promise<{ vernacular: (string | null)[]; description: (string | null)[] }> {
  const indexed = items.map((item, idx) => ({ item, idx }))
  const vernacular: (string | null)[] = new Array(items.length).fill(null)
  const description: (string | null)[] = new Array(items.length).fill(null)

  await Promise.all([
    runWithConcurrency(indexed, ENRICH_CONCURRENCY,
      ({ item }) => item.vernacularNameIt ? Promise.resolve(item.vernacularNameIt) : item.gbifUsageKey ? fetchVernacularIta(item.gbifUsageKey) : Promise.resolve(null),
      ({ idx }, result) => { vernacular[idx] = result }),
    runWithConcurrency(indexed, ENRICH_CONCURRENCY,
      ({ item }) => item.description ? Promise.resolve(item.description) : fetchSpeciesDescription(item.scientificName),
      ({ idx }, result) => { description[idx] = result }),
  ])

  return { vernacular, description }
}
