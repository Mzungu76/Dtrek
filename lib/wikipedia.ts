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

// POI types worth looking up (named items likely to have articles)
const WIKI_WORTHY = new Set<PoiItem['type']>([
  'peak', 'pass', 'waterfall', 'cave', 'ruins', 'archaeological',
  'castle', 'monument', 'tower', 'hut', 'bivouac',
])

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
    const s = await res.json()
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
    const top = (await res.json()).query?.search?.[0]
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
 */
export async function fetchWikiForNamedPois(
  pois: PoiItem[],
): Promise<{ poi: PoiItem; wiki: WikiPage }[]> {
  const candidates = pois
    .filter(p => p.name && WIKI_WORTHY.has(p.type))
    .slice(0, 10)

  if (candidates.length === 0) return []

  const results = await Promise.all(candidates.map(async poi => {
    try {
      // 1. OSM wikipedia= tag — authoritative, direct link
      const wikiTag = poi.tags?.['wikipedia'] ?? ''
      if (wikiTag) {
        const tagLang    = wikiTag.includes(':') ? wikiTag.split(':')[0] : 'it'
        const tagTitle   = wikiTag.includes(':') ? wikiTag.split(':').slice(1).join(':') : wikiTag
        const tagProject = wikiTag.startsWith('voy:') || tagLang === 'voy' ? 'wikivoyage' : 'wikipedia'
        const wiki = await fetchSummary(tagTitle, tagLang === 'voy' ? 'it' : tagLang, tagProject)
        if (wiki) return { poi, wiki }
      }

      // 2. Italian Wikipedia
      const itWiki = await searchAndFetch(poi.name!, 'it', 'wikipedia')
      if (itWiki) return { poi, wiki: itWiki }

      // 3. English Wikipedia (catches peaks / castles with no Italian article)
      const enWiki = await searchAndFetch(poi.name!, 'en', 'wikipedia')
      if (enWiki) return { poi, wiki: enWiki }

      // 4. Italian Wikivoyage (travel guide; covers historic towns, parks, attractions)
      const voyWiki = await searchAndFetch(poi.name!, 'it', 'wikivoyage')
      if (voyWiki) return { poi, wiki: voyWiki }

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
  const searchData = await searchRes.json()
  const hits: { pageid: number; title: string; dist: number }[] =
    searchData.query?.geosearch ?? []
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
        const s = await sumRes.json()
        if (!s.extract || s.extract.length < 30) return null
        return {
          pageid:      h.pageid,
          title:       s.title as string,
          description: s.description as string | undefined,
          extract:     s.extract as string,
          thumbnail:   (s.thumbnail?.source as string | undefined),
          url:         (s.content_urls?.mobile?.page ?? s.content_urls?.desktop?.page ?? '') as string,
          dist:        h.dist,
          lat:         s.coordinates?.lat as number | undefined,
          lon:         s.coordinates?.lon as number | undefined,
        } as WikiPage
      } catch {
        return null
      }
    }),
  )

  return pages.filter((p): p is WikiPage => p !== null)
}
