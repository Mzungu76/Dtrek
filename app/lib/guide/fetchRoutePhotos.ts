import { fetchNearbyWiki, fetchWikiFullDetails } from '@/lib/wikipedia'
import { namesOverlap } from '@/lib/metaSearch/borgoItinerary'

export interface RoutePhoto {
  url: string
  credit: string
  title: string
}

// Raggio per un Borgo/Città o Sito SENZA traccia (un punto singolo, non il punto medio di un
// sentiero) — usato da SitoGalleryWidget.tsx e GuideReader.tsx (PhotoMosaic per un museo/sito
// scheda_pratica). Verifica utente (2026-09-27, "Galleria Doria Pamphilj", Roma centro storico):
// "a volte le immagini sembrano fuori contesto" — questa funzione non verifica MAI il soggetto
// della foto, solo orientamento/nome file (vedi i filtri sotto): un raggio ampio in un centro
// storico denso include facilmente un monumento o una piazza tutt'altro, a diverse centinaia di
// metri, con solo la vicinanza geografica a giustificarlo. Ridotto da 1.500m (già una riduzione
// precedente rispetto ai 15km del punto medio di un Sentiero, vedi commento in GuideReader.tsx) a
// una scala da isolato urbano: abbastanza da coprire i dintorni immediati di un edificio, stretto
// abbastanza da escludere la piazza o il monumento del blocco successivo.
export const SINGLE_POINT_PHOTO_RADIUS_M = 400

// Stesso valore di WIKIPEDIA_MATCH_RADIUS_M in lib/placePhotoCache.ts, duplicato invece di importato:
// quel modulo importa supabase e finirebbe nel bundle client (questo file gira anche nel browser).
const WIKIPEDIA_MATCH_RADIUS_M = 800

// Immagini della voce Wikipedia che combacia col nome del luogo: scelte da un editor per quel
// soggetto, quindi pertinenti — a differenza della geosearch Commons, che verifica solo la vicinanza.
async function fetchCuratedWikiPhotos(name: string, lat: number, lon: number, limit: number): Promise<RoutePhoto[]> {
  try {
    const pages = await fetchNearbyWiki(lat, lon, WIKIPEDIA_MATCH_RADIUS_M, 5)
    const match = pages.find(p => namesOverlap(name, p.title))
    if (!match) return []
    const { images } = await fetchWikiFullDetails(match)
    const seen = new Set<string>()
    const results: RoutePhoto[] = []
    for (const url of [match.thumbnail, ...images]) {
      if (!url || seen.has(url)) continue
      seen.add(url)
      results.push({ url, credit: 'Wikimedia Commons', title: match.title })
      if (results.length >= limit) break
    }
    return results
  } catch {
    return []
  }
}

/**
 * Foto per un luogo puntuale (Borgo/Sito, non un Sentiero): prima le immagini della voce Wikipedia
 * del luogo, poi — solo per i posti rimasti — la geosearch Commons generica (fetchRoutePhotos).
 */
export async function fetchPlacePhotos(
  name: string,
  lat: number,
  lon: number,
  radiusM = SINGLE_POINT_PHOTO_RADIUS_M,
  limit = 6,
): Promise<RoutePhoto[]> {
  const curated = await fetchCuratedWikiPhotos(name, lat, lon, limit)
  if (curated.length >= limit) return curated
  const filler = await fetchRoutePhotos(lat, lon, radiusM, limit - curated.length)
  const seen = new Set(curated.map(p => p.url))
  return [...curated, ...filler.filter(p => !seen.has(p.url))]
}

/**
 * Fetch geo-tagged landscape photos from Wikimedia Commons near a coordinate.
 * No API key required. Returns up to `limit` landscape-oriented photos.
 */
export async function fetchRoutePhotos(
  lat: number,
  lon: number,
  radiusM = 10000,
  limit = 6,
): Promise<RoutePhoto[]> {
  try {
    // Step 1: geosearch Wikimedia Commons, namespace 6 = File pages
    const geoRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: 'query', list: 'geosearch',
        gscoord: `${lat}|${lon}`, gsradius: String(radiusM),
        gslimit: '25', gsnamespace: '6',
        format: 'json', origin: '*',
      })}`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!geoRes.ok) return []
    const geoData = await geoRes.json()
    const hits: { pageid: number; title: string }[] = geoData.query?.geosearch ?? []
    if (!hits.length) return []

    // Step 2: batch-fetch imageinfo (url, dimensions, uploader)
    const infoRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: 'query', pageids: hits.map(h => h.pageid).join('|'),
        prop: 'imageinfo', iiprop: 'url|size|user', iiurlwidth: '900',
        format: 'json', origin: '*',
      })}`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!infoRes.ok) return []
    const infoData = await infoRes.json()

    const pages = Object.values(infoData.query?.pages ?? {}) as {
      title: string
      imageinfo?: { url: string; thumburl: string; thumbwidth: number; thumbheight: number; user: string }[]
    }[]

    const results: RoutePhoto[] = []
    for (const page of pages) {
      const ii = page.imageinfo?.[0]
      if (!ii?.thumburl) continue

      const lc = page.title.toLowerCase()
      // Skip SVG, logos, banners, icons, maps, diagrams
      if (lc.endsWith('.svg') || lc.endsWith('.gif')) continue
      if (/logo|icon|banner|schema|diagram|map|mappa|carta/.test(lc)) continue

      // Require landscape aspect ratio (width ≥ height × 1.3)
      const { thumbwidth: w, thumbheight: h } = ii
      if (!w || !h || w / h < 1.3) continue

      results.push({
        url:    ii.thumburl,
        credit: `© ${ii.user} / Wikimedia Commons`,
        title:  page.title.replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
      })
      if (results.length >= limit) break
    }
    return results
  } catch {
    return []
  }
}
