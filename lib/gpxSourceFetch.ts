// Molte pagine che Giulia cita come fonte durante la ricerca percorsi con l'AI (CAI, enti parco,
// comuni, blog escursionistici) pubblicano un link diretto "scarica traccia GPX" — quando c'è,
// è un dato migliore di un match per nome su Overpass: è la traccia esatta, non un'approssimazione.
// Diverso (e più sicuro, vedi discussione con l'utente) dallo scraping di Komoot/AllTrails: qui si
// segue solo un link di download che la pagina stessa espone pubblicamente per chiunque la visiti.
import { parseGpxServerSide, type ServerParsedGpx } from './serverGpxParser'

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'
const GPX_HREF_RE = /<a\b[^>]*href=["']([^"']+\.gpx(?:[?#][^"']*)?)["']/i

// Mappe interattive renderizzate via JS (nessun link statico nell'HTML servito) o che richiedono
// un account per esportare il GPX — inutile anche solo provare a fare il fetch, vedi
// app/api/route-search/route.ts's findBestGpxUrl (usa altre pagine trovate da Giulia per queste).
const KNOWN_NO_DIRECT_DOWNLOAD_HOSTS = ['wikiloc.com', 'komoot.com', 'komoot.de', 'alltrails.com']

function likelyHasNoDirectDownload(pageUrl: string): boolean {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '')
    return KNOWN_NO_DIRECT_DOWNLOAD_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Controllo leggero (fetch + regex sull'HTML, nessun download del GPX stesso) usato in fase di
 * ricerca (app/api/route-search/route.ts) per decidere se un candidato ha davvero una traccia
 * scaricabile, prima ancora che l'utente scelga di importarlo.
 */
export async function findGpxLinkOnPage(pageUrl: string): Promise<string | null> {
  if (likelyHasNoDirectDownload(pageUrl)) return null
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    const html = await res.text()
    const match = GPX_HREF_RE.exec(html)
    if (!match) return null
    return new URL(match[1], pageUrl).toString()
  } catch {
    return null
  }
}

/**
 * Scarica e interpreta il GPX trovato da findGpxLinkOnPage — chiamata solo sul SINGOLO candidato
 * che l'utente ha scelto di importare (app/api/route-search/resolve/route.ts), stesso principio
 * "lavoro pesante solo su richiesta" già usato per la geometria Overpass/l'arricchimento DTM.
 */
export async function downloadAndParseGpx(gpxUrl: string): Promise<ServerParsedGpx | null> {
  try {
    const res = await fetch(gpxUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return parseGpxServerSide(text)
  } catch {
    return null
  }
}
