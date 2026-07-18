// Equivalente di lib/kmlSourceFetch.ts per GeoJSON — stesso motivo per tenerlo separato da
// gpxSourceFetch.ts (usato anche dalla ricerca AI, che deve restare invariata).
import { parseGeoJson } from './geoJsonParser'
import type { ServerParsedGpx } from './serverGpxParser'
import { isBlockedHost } from './scrapeBlocklist'

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'
const GEOJSON_HREF_RE = /<a\b[^>]*href=["']([^"']+\.geojson(?:[?#][^"']*)?)["']/i

/** Stesso principio di findGpxLinkOnPage/findKmlLinkOnPage: fetch + regex sull'HTML, nessun
 *  download del file stesso. */
export async function findGeoJsonLinkOnPage(pageUrl: string): Promise<string | null> {
  if (isBlockedHost(pageUrl)) return null
  try {
    const res = await fetch(pageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    const html = await res.text()
    const match = GEOJSON_HREF_RE.exec(html)
    if (!match) return null
    return new URL(match[1], pageUrl).toString()
  } catch {
    return null
  }
}

/** Scarica ed interpreta un GeoJSON da un URL diretto — chiamata solo sul singolo link che
 *  l'utente ha scelto di importare, stesso principio "lavoro pesante solo su richiesta" di
 *  downloadAndParseGpx/downloadAndParseKml. */
export async function downloadAndParseGeoJson(url: string): Promise<ServerParsedGpx | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const text = await res.text()
    return parseGeoJson(text)
  } catch {
    return null
  }
}
