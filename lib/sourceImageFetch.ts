// Foto di riferimento del percorso trovate tra le fonti che Giulia ha già citato durante la
// generazione della guida (app/api/guide/route.ts) — non uno scraping del contenuto della pagina,
// ma la lettura del meta tag og:image (o twitter:image come ripiego), lo stesso meccanismo che i
// siti usano apposta per mostrare un'anteprima con foto quando la pagina viene condivisa altrove
// (WhatsApp, Twitter, Slack...): un'immagine resa pubblica per essere mostrata così, con link e
// attribuzione alla fonte. Stesso principio prudente già discusso per il download dei GPX — mai
// sui domini in lib/scrapeBlocklist.ts (Komoot/AllTrails/Wikiloc), che comunque non la espongono.
import { isBlockedHost } from './scrapeBlocklist'

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

// I meta tag <meta property="og:image" content="..."> possono avere gli attributi in ordine
// diverso a seconda del sito — due varianti per ciascuna convenzione (og:image e twitter:image),
// provate in ordine di affidabilità/diffusione.
const META_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
]

/** Controllo leggero (fetch + regex sull'HTML) — legge solo il meta tag, non l'immagine stessa. */
export async function findSourceImage(pageUrl: string): Promise<string | null> {
  if (isBlockedHost(pageUrl)) return null
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    const html = await res.text()

    for (const re of META_IMAGE_PATTERNS) {
      const match = re.exec(html)
      if (!match) continue
      try {
        const resolved = new URL(match[1], pageUrl)
        if (resolved.protocol === 'http:' || resolved.protocol === 'https:') return resolved.toString()
      } catch { /* URL malformato, prova il pattern successivo */ }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Prova più URL (le fonti citate da Giulia in questa guida) in parallelo, in ordine di priorità —
 * tiene la prima immagine trovata, non necessariamente la più veloce a rispondere.
 */
export async function findBestSourceImage(urls: string[]): Promise<{ url: string; imageUrl: string } | null> {
  const candidates = urls.slice(0, 4)
  if (candidates.length === 0) return null
  const results = await Promise.all(candidates.map(u => findSourceImage(u)))
  const idx = results.findIndex((r): r is string => !!r)
  return idx >= 0 ? { url: candidates[idx], imageUrl: results[idx]! } : null
}
