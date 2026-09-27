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
