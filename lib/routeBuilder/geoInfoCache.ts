// Cache locale (IndexedDB, vedi lib/localStore.ts) per i piccoli arricchimenti geografici via
// Overpass introdotti per le guide — classificazione del punto di partenza
// (lib/routeBuilder/startPointInfo.ts), opzioni di ritorno (lib/routeBuilder/returnOptions.ts) e
// copertura Street View (lib/routeBuilder/streetViewCoverage.ts). Senza questa cache, ognuna di
// queste chiamate ripartirebbe da zero a OGNI visione della stessa guida — con più utenti, il
// carico su Overpass (servizio pubblico condiviso, la stessa infrastruttura su cui si regge la
// ricerca percorsi) scalerebbe con le visualizzazioni di pagina invece che con i contenuti creati.
// TTL lungo perché sono fatti geografici che cambiano di rado (un parcheggio o una fermata bus non
// spariscono da un giorno all'altro) — non serve rifreschi frequenti, solo evitare che la cache
// diventi eterna se OSM viene aggiornato nel frattempo.
import { lsGet, lsSet } from '@/lib/localStore'

const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 giorni

interface CacheEntry<T> { value: T; savedAt: number }

// { hit: false } (cache assente/scaduta) va distinto da un valore cachato che è esso stesso `null`
// (es. "nessun servizio trovato nei dintorni" è un risultato valido, non un cache-miss) — altrimenti
// quell'esito legittimo verrebbe ricontrollato su Overpass a ogni visione, proprio il carico che
// questa cache serve a evitare.
export type GeoInfoCacheResult<T> = { hit: true; value: T } | { hit: false }

export async function getCachedGeoInfo<T>(key: string): Promise<GeoInfoCacheResult<T>> {
  const entry = await lsGet<CacheEntry<T>>(key).catch(() => null)
  if (!entry) return { hit: false }
  if (Date.now() - entry.savedAt > TTL_MS) return { hit: false }
  return { hit: true, value: entry.value }
}

export async function setCachedGeoInfo<T>(key: string, value: T): Promise<void> {
  await lsSet<CacheEntry<T>>(key, { value, savedAt: Date.now() }).catch(() => {})
}
