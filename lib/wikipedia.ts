// Wikipedia Geosearch + Summary API — 100% gratuita, nessuna chiave
// https://www.mediawiki.org/wiki/API:Geosearch

import type { PoiItem } from './overpass'

export interface WikiPage {
  pageid:      number
  title:       string
  description?: string
  extract:     string
  thumbnail?:  string
  url:         string
  dist:        number   // meters from query point
  lat?:        number   // article coordinates (from REST summary, when available)
  lon?:        number
  source?:     'wikipedia-it' | 'wikipedia-en' | 'wikivoyage-it'
}

// Shapes of the raw Wikimedia REST/Action API JSON — only the fields this module reads.
interface WikiRestSummary {
  pageid: number
  title: string
  description?: string
  extract: string
  thumbnail?: { source?: string }
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } }
  coordinates?: { lat?: number; lon?: number }
}

interface WikiSearchApiResponse {
  query?: { search?: { title: string }[] }
}

interface WikiGeosearchApiResponse {
  query?: { geosearch?: { pageid: number; title: string; dist: number }[] }
}

// POI types worth looking up (named items likely to have articles)
const WIKI_WORTHY = new Set<PoiItem['type']>([
  'peak', 'pass', 'waterfall', 'cave', 'ruins', 'archaeological',
  'castle', 'monument', 'tower', 'hut', 'bivouac',
])

// Generic names that are just the category word — no specific article exists for them. Includes
// the exact default labels lib/pois/overpassSource.ts's OVERPASS_DEFAULT_NAMES assigns to
// unnamed OSM features (e.g. "Acqua potabile" for an unnamed drinking_water point) — those aren't
// duplicated by importing that module (server-oriented, would drag its Overpass fetch logic into
// the client bundle here), just kept in sync by hand since the set rarely changes.
const GENERIC_POI_NAMES = new Set([
  'cascata', 'cascate', 'cascatella', 'cascatelle',
  'grotta', 'grotte', 'caverna', 'caverne',
  'rovine', 'rovina', 'ruderi', 'rudere',
  'torre', 'torri', 'sorgente', 'sorgenti',
  'fontana', 'fontanile', 'rifugio', 'bivacco',
  'monumento', 'monastero', 'chiesa', 'cappella',
  'valico', 'passo', 'cima', 'vetta', 'monte',
  'acqua potabile', 'area picnic', 'belvedere', 'riparo', 'croce',
])

// Max distance (km) between POI and the Wikipedia article's own coordinates
const MAX_DIST_KM: Record<string, number> = {
  waterfall: 8, cave: 8, spring: 5,
  ruins: 15, archaeological: 15,
  castle: 20, monument: 10, tower: 15,
  peak: 30, pass: 25,
  hut: 8, bivouac: 8,
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const dφ = (lat2 - lat1) * Math.PI / 180
  const dλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isSpecificName(name: string): boolean {
  return !GENERIC_POI_NAMES.has(name.toLowerCase().trim()) && name.trim().length > 4
}

// Articles found via text search must have coordinates close to the POI.
// Articles without coordinates are concept/disambiguation pages → rejected.
function isNearPoi(wiki: WikiPage, poi: PoiItem): boolean {
  if (!wiki.lat || !wiki.lon) return false   // no coordinates = concept article
  if (!poi.lat || !poi.lon) return true      // POI has no coords, can't check → allow
  const maxKm = MAX_DIST_KM[poi.type as string] ?? 20
  return distKm(wiki.lat, wiki.lon, poi.lat, poi.lon) <= maxKm
}

// Fetch the REST summary for a given title from any Wikimedia project
async function fetchSummary(
  title: string,
  lang: string,
  project: 'wikipedia' | 'wikivoyage' = 'wikipedia',
): Promise<WikiPage | null> {
  try {
    const slug = encodeURIComponent(title.replace(/ /g, '_'))
    const res = await fetch(
      `https://${lang}.${project}.org/api/rest_v1/page/summary/${slug}`,
      { headers: { 'Api-User-Agent': 'DtrekApp/1.0' } },
    )
    if (!res.ok) return null
    const s = await res.json() as WikiRestSummary
    if (!s.extract || s.extract.length < 50) return null
    return {
      pageid:      s.pageid,
      title:       s.title,
      description: s.description,
      extract:     s.extract,
      thumbnail:   s.thumbnail?.source,
      url:         s.content_urls?.mobile?.page ?? s.content_urls?.desktop?.page ?? '',
      dist:        0,
      lat:         s.coordinates?.lat,
      lon:         s.coordinates?.lon,
      source:      `${project}-${lang}` as WikiPage['source'],
    }
  } catch {
    return null
  }
}

// Search a Wikimedia project by name, return summary for best match (if relevant)
async function searchAndFetch(
  name: string,
  lang: string,
  project: 'wikipedia' | 'wikivoyage',
): Promise<WikiPage | null> {
  try {
    const searchUrl = `https://${lang}.${project}.org/w/api.php?` + new URLSearchParams({
      action: 'query', list: 'search', srsearch: name, srlimit: '1',
      srnamespace: '0', format: 'json', origin: '*',
    })
    const res = await fetch(searchUrl)
    if (!res.ok) return null
    const searchJson = await res.json() as WikiSearchApiResponse
    const top = searchJson.query?.search?.[0]
    if (!top) return null

    // Require the result title to share at least one significant word with the query name
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    const words = norm(name).split(' ').filter(w => w.length > 3)
    if (words.length === 0 || !words.some(w => norm(top.title).includes(w))) return null

    return fetchSummary(top.title, lang, project)
  } catch {
    return null
  }
}

/**
 * Look up information for each named POI that is physically on/near the route.
 * Cascade: OSM wikipedia= tag → Italian Wikipedia → English Wikipedia → Italian Wikivoyage
 *
 * Text-search results (steps 2-4) are validated geographically: the Wikipedia article
 * must have coordinates within MAX_DIST_KM of the POI. Articles without coordinates
 * (concept pages, disambiguation) are rejected. This prevents "cascatella" → "Cascate
 * delle Marmore" or "grotta" → "Grotta (geologia)" type false matches.
 */
export async function fetchWikiForNamedPois(
  pois: PoiItem[],
): Promise<{ poi: PoiItem; wiki: WikiPage }[]> {
  const candidates = pois
    .filter(p => p.name && WIKI_WORTHY.has(p.type) && isSpecificName(p.name))
    .slice(0, 10)

  if (candidates.length === 0) return []

  const results = await Promise.all(candidates.map(async poi => {
    try {
      // 1. OSM wikipedia= tag — authoritative, no proximity check needed
      const wikiTag = poi.tags?.['wikipedia'] ?? ''
      if (wikiTag) {
        const tagLang    = wikiTag.includes(':') ? wikiTag.split(':')[0] : 'it'
        const tagTitle   = wikiTag.includes(':') ? wikiTag.split(':').slice(1).join(':') : wikiTag
        const tagProject = wikiTag.startsWith('voy:') || tagLang === 'voy' ? 'wikivoyage' : 'wikipedia'
        const wiki = await fetchSummary(tagTitle, tagLang === 'voy' ? 'it' : tagLang, tagProject)
        if (wiki) return { poi, wiki }
      }

      // 2. Italian Wikipedia — proximity required
      const itWiki = await searchAndFetch(poi.name!, 'it', 'wikipedia')
      if (itWiki && isNearPoi(itWiki, poi)) return { poi, wiki: itWiki }

      // 3. English Wikipedia — proximity required
      const enWiki = await searchAndFetch(poi.name!, 'en', 'wikipedia')
      if (enWiki && isNearPoi(enWiki, poi)) return { poi, wiki: enWiki }

      // 4. Italian Wikivoyage — proximity required
      const voyWiki = await searchAndFetch(poi.name!, 'it', 'wikivoyage')
      if (voyWiki && isNearPoi(voyWiki, poi)) return { poi, wiki: voyWiki }

      return null
    } catch {
      return null
    }
  }))

  // Deduplicate by pageid, drop nulls
  const seen = new Set<number>()
  return results.filter((r): r is { poi: PoiItem; wiki: WikiPage } => {
    if (!r || seen.has(r.wiki.pageid)) return false
    seen.add(r.wiki.pageid)
    return true
  })
}


export async function fetchNearbyWiki(
  lat: number,
  lon: number,
  radiusM = 8000,
  limit   = 6,
  lang    = 'it',
): Promise<WikiPage[]> {
  // Geosearch
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
    action:   'query',
    list:     'geosearch',
    gscoord:  `${lat}|${lon}`,
    gsradius: String(radiusM),
    gslimit:  String(limit),
    format:   'json',
    origin:   '*',
  })
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) return []
  const searchData = await searchRes.json() as WikiGeosearchApiResponse
  const hits = searchData.query?.geosearch ?? []
  if (hits.length === 0) return []

  // Fetch page summaries in parallel
  const pages = await Promise.all(
    hits.map(async h => {
      try {
        const slug  = encodeURIComponent(h.title.replace(/ /g, '_'))
        const sumRes = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`,
          { headers: { 'Api-User-Agent': 'DtrekApp/1.0' } },
        )
        if (!sumRes.ok) return null
        const s = await sumRes.json() as WikiRestSummary
        if (!s.extract || s.extract.length < 30) return null
        return {
          pageid:      h.pageid,
          title:       s.title,
          description: s.description,
          extract:     s.extract,
          thumbnail:   s.thumbnail?.source,
          url:         s.content_urls?.mobile?.page ?? s.content_urls?.desktop?.page ?? '',
          dist:        h.dist,
          lat:         s.coordinates?.lat,
          lon:         s.coordinates?.lon,
        } as WikiPage
      } catch {
        return null
      }
    }),
  )

  return pages.filter((p): p is WikiPage => p !== null)
}
