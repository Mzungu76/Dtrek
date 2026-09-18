import { haversineM } from '../geoUtils'
import type { SiteType } from '../metaTypes'

// Logica pura dell'itinerario a piedi di un Borgo/Città (app/api/borgo-itinerary/route.ts) —
// nessuna rete/Supabase qui, solo unione/dedup delle tappe candidate e il loro ordine di visita,
// così è testabile senza dover scaricare nulla (Wikipedia/Overpass, entrambi bloccati in alcuni
// ambienti di sviluppo — vedi lo stesso problema già incontrato per i Siti duplicati MiC).

export interface ItineraryStopCandidate {
  /** id reale (dtrek_places.id) per una tappa dall'archivio, un id sintetico "wiki:<pageid>" per
   *  una tappa emersa solo da Wikipedia — mai lo stesso schema di id, per non poterli confondere
   *  con una Meta salvabile che non esiste ancora. */
  id: string
  name: string
  lat: number
  lon: number
  description?: string
  thumbnail?: string
  url?: string
  source: 'archivio' | 'wikipedia'
  siteType?: SiteType
}

const DEDUP_DISTANCE_M = 150

// Stesso approccio (per parole significative, non l'intera stringa) di scripts/places/mic/fetch.ts
// via lib/wikipedia.ts's searchAndFetch — sufficiente a distinguere "Chiesa di San Pietro" da
// "Chiesa di San Paolo" pur tollerando piccole differenze di formattazione ("Chiesa di San Pietro"
// vs "San Pietro, Chiesa").
function namesOverlap(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '')
  const wordsA = norm(a).split(' ').filter(w => w.length > 3)
  const wordsB = new Set(norm(b).split(' ').filter(w => w.length > 3))
  return wordsA.some(w => wordsB.has(w))
}

/**
 * Unisce le tappe già nel nostro archivio con quelle emerse da una geosearch Wikipedia intorno al
 * Borgo, senza doppioni: una voce Wikipedia entro DEDUP_DISTANCE_M da una tappa d'archivio con un
 * nome che condivide almeno una parola significativa è considerata lo stesso luogo — arricchisce
 * quella tappa (descrizione/immagine mancante) invece di aggiungerne una seconda.
 */
export function mergeStopCandidates(
  archiveStops: ItineraryStopCandidate[],
  wikiStops: ItineraryStopCandidate[],
): ItineraryStopCandidate[] {
  const merged = archiveStops.map(s => ({ ...s }))
  for (const wiki of wikiStops) {
    const dup = merged.find(s => haversineM(s.lat, s.lon, wiki.lat, wiki.lon) < DEDUP_DISTANCE_M && namesOverlap(s.name, wiki.name))
    if (dup) {
      if (!dup.description && wiki.description) dup.description = wiki.description
      if (!dup.thumbnail && wiki.thumbnail) dup.thumbnail = wiki.thumbnail
      continue
    }
    merged.push({ ...wiki })
  }
  return merged
}

/** Le `maxStops` tappe più vicine al centro del Borgo — un itinerario con 40 tappe non è più un
 *  "giro", è l'intero archivio della zona. */
export function nearestStops(center: { lat: number; lon: number }, stops: ItineraryStopCandidate[], maxStops: number): ItineraryStopCandidate[] {
  return [...stops]
    .sort((a, b) => haversineM(center.lat, center.lon, a.lat, a.lon) - haversineM(center.lat, center.lon, b.lat, b.lon))
    .slice(0, maxStops)
}

/** Ordine di visita a "vicino più vicino" (greedy nearest-neighbor) a partire dal Borgo — non
 *  l'ottimo assoluto (un vero TSP), ma per un pugno di tappe in un centro storico la differenza è
 *  trascurabile e l'algoritmo resta immediato da spiegare ("si va sempre verso la tappa più
 *  vicina non ancora visitata"). */
export function orderStopsNearestNeighbor(start: { lat: number; lon: number }, stops: ItineraryStopCandidate[]): ItineraryStopCandidate[] {
  const remaining = [...stops]
  const ordered: ItineraryStopCandidate[] = []
  let current = start
  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    remaining.forEach((s, i) => {
      const d = haversineM(current.lat, current.lon, s.lat, s.lon)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    const [next] = remaining.splice(bestIdx, 1)
    ordered.push(next)
    current = next
  }
  return ordered
}
