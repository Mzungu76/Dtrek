// Equivalente di lib/gpxSourceFetch.ts per KML/KMZ — funzione separata invece di generalizzare
// findGpxLinkOnPage/downloadAndParseGpx, per non toccare quel file (usato anche da
// app/api/route-search/route.ts per la ricerca AI, che deve restare invariata).
import { parseKml } from './kmlParser'
import type { ServerParsedGpx } from './serverGpxParser'
import { extractKmlFromKmz } from './kmzExtract'
import { isBlockedHost } from './scrapeBlocklist'

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'
const KML_HREF_RE = /<a\b[^>]*href=["']([^"']+\.km[lz](?:[?#][^"']*)?)["']/i

export type KmlKind = 'kml' | 'kmz'

function kindFromUrl(url: string): KmlKind | null {
  if (/\.kmz(?:[?#]|$)/i.test(url)) return 'kmz'
  if (/\.kml(?:[?#]|$)/i.test(url)) return 'kml'
  return null
}

/** Stesso principio di findGpxLinkOnPage: fetch + regex sull'HTML, nessun download del file
 *  stesso — usato per decidere se una pagina offre un link diretto a una traccia KML/KMZ. */
export async function findKmlLinkOnPage(pageUrl: string): Promise<{ url: string; kind: KmlKind } | null> {
  if (isBlockedHost(pageUrl)) return null
  try {
    const res = await fetch(pageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    const html = await res.text()
    const match = KML_HREF_RE.exec(html)
    if (!match) return null
    const url = new URL(match[1], pageUrl).toString()
    const kind = kindFromUrl(url)
    return kind ? { url, kind } : null
  } catch {
    return null
  }
}

/** Scarica ed interpreta un KML o KMZ da un URL diretto — chiamata solo sul singolo link che
 *  l'utente ha scelto di importare, stesso principio "lavoro pesante solo su richiesta" di
 *  downloadAndParseGpx. */
export async function downloadAndParseKml(url: string, kind: KmlKind): Promise<ServerParsedGpx | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    if (kind === 'kmz') {
      const buf = new Uint8Array(await res.arrayBuffer())
      const kmlText = extractKmlFromKmz(buf)
      return kmlText ? parseKml(kmlText) : null
    }
    const text = await res.text()
    return parseKml(text)
  } catch {
    return null
  }
}

export { kindFromUrl }
