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
}

// POI types worth looking up on Wikipedia (named items likely to have articles)
const WIKI_WORTHY = new Set<PoiItem['type']>([
  'peak', 'pass', 'waterfall', 'cave', 'ruins', 'archaeological',
  'castle', 'monument', 'tower', 'hut', 'bivouac',
])

async function fetchSummary(title: string, lang: string): Promise<WikiPage | null> {
  try {
    const slug = encodeURIComponent(title.replace(/ /g, '_'))
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`,
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
    }
  } catch {
    return null
  }
}

/**
 * Look up Wikipedia for each named POI that is physically on/near the route.
 * Priority: OSM `wikipedia=` tag (authoritative) → name-based search.
 */
export async function fetchWikiForNamedPois(
  pois: PoiItem[],
  lang = 'it',
): Promise<{ poi: PoiItem; wiki: WikiPage }[]> {
  const candidates = pois
    .filter(p => p.name && WIKI_WORTHY.has(p.type))
    .slice(0, 10)

  if (candidates.length === 0) return []

  const results = await Promise.all(candidates.map(async poi => {
    try {
      // 1. Direct lookup via OSM wikipedia= tag
      const wikiTag = poi.tags?.['wikipedia'] ?? ''
      if (wikiTag) {
        const tagLang  = wikiTag.includes(':') ? wikiTag.split(':')[0] : lang
        const tagTitle = wikiTag.includes(':') ? wikiTag.split(':').slice(1).join(':') : wikiTag
        const wiki = await fetchSummary(tagTitle, tagLang)
        if (wiki) return { poi, wiki }
      }

      // 2. Search by POI name, accept result only if title clearly matches
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query', list: 'search', srsearch: poi.name!, srlimit: '1',
        srnamespace: '0', format: 'json', origin: '*',
      })
      const searchRes = await fetch(searchUrl)
      if (!searchRes.ok) return null
      const top = (await searchRes.json()).query?.search?.[0]
      if (!top) return null

      // Require the result title to share at least one significant word with the POI name
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '')
      const poiWords = norm(poi.name!).split(' ').filter(w => w.length > 3)
      if (poiWords.length === 0 || !poiWords.some(w => norm(top.title).includes(w))) return null

      const wiki = await fetchSummary(top.title, lang)
      return wiki ? { poi, wiki } : null
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
