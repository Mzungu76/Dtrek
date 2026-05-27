// Wikipedia Geosearch + Summary API — 100% gratuita, nessuna chiave
// https://www.mediawiki.org/wiki/API:Geosearch

export interface WikiPage {
  pageid:      number
  title:       string
  description?: string
  extract:     string
  thumbnail?:  string
  url:         string
  dist:        number  // meters from query point
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
        } as WikiPage
      } catch {
        return null
      }
    }),
  )

  return pages.filter((p): p is WikiPage => p !== null)
}
