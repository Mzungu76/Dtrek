// Domini noti per non offrire contenuto liberamente riutilizzabile — mappe/tracce renderizzate via
// JS senza link statico nell'HTML servito, o piattaforme commerciali che richiedono un account e
// non vogliono essere hotlinkate. Stesso elenco per due usi distinti ma imparentati: il download
// diretto del GPX (lib/gpxSourceFetch.ts) e le immagini di riferimento del percorso
// (lib/sourceImageFetch.ts) — se un sito non va bene per l'uno, non va bene nemmeno per l'altro.
const SCRAPE_BLOCKED_HOSTS = ['wikiloc.com', 'komoot.com', 'komoot.de', 'alltrails.com']

export function isBlockedHost(pageUrl: string): boolean {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '')
    return SCRAPE_BLOCKED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}
