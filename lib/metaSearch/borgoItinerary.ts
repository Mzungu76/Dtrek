import { haversineM } from '../geoUtils'
import type { SiteType } from '../metaTypes'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

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
export function namesOverlap(a: string, b: string): boolean {
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

// ── Suddivisione in tappe (verifica utente — "se i POI sono tanti si suddividono in più tappe",
// pensata da subito per tornare utile anche ai futuri cammini multi-giorno tipo la Francigena, che
// riuseranno la stessa forma "Tappa" con un criterio di suddivisione diverso: un percorso
// predefinito diviso per giorni invece di un clustering algoritmico su un raggio di ricerca) ──────

export interface ItineraryTappa {
  stops: ItineraryStopCandidate[]
  /** Stessa lunghezza di `stops` — legs[i] è il tratto a piedi che ARRIVA a stops[i] (dal punto
   *  precedente, dentro la tappa o dalla tappa precedente per il primo). */
  legs: ItineraryLeg[]
  distanceM: number
  /** Punto di partenza di QUESTA tappa — il Borgo stesso per la prima tappa, l'ultima tappa
   *  della tappa precedente per le successive: la camminata continua da lì, non si
   *  "teletrasporta" da un capo all'altro della città tra una tappa e la successiva. */
  startPoint: { lat: number; lon: number }
}

// "Distanza media per un adulto" (verifica utente) — un ritmo da visita comodo con soste
// implicite (~40-45 minuti a WALK_SPEED_MPS, app/api/borgo-itinerary/route.ts), il default quando
// non c'è ancora una preferenza utente caricata. DEFAULT_PREF_DURATA_MIN rispecchia lo stesso
// default di user_settings.pref_durata (lib/useUserPrefs.ts) — la base rispetto a cui scalare.
const DEFAULT_TAPPA_DISTANCE_M = 3000
const DEFAULT_PREF_DURATA_MIN = 270
// Mai una tappa così corta da essere inutile, né così lunga da vanificare il senso stesso di
// "tappa" — un pavimento e un tetto attorno al valore scalato, non un secondo criterio a sé.
const MIN_TAPPA_DISTANCE_M = 1500
const MAX_TAPPA_DISTANCE_M = 6000

/**
 * Distanza massima "comoda" per una singola tappa, personalizzata sulle preferenze dell'utente
 * (verifica utente: "storico dell'utente, settato sulle sue preferenze... o distanza media per un
 * adulto") — scala il default medio in proporzione a pref_durata (minuti di camminata preferiti,
 * user_settings — lo stesso segnale già usato per Trail Score/Sicurezza), non lo riusa
 * direttamente come durata di UNA tappa: pref_durata rappresenta l'intera uscita che un utente
 * preferisce fare, non un singolo segmento tra le tante tappe di una città grande. undefined
 * (preferenze non ancora caricate) ⇒ il default medio, mai bloccante.
 */
export function personalizedTappaDistanceM(prefDurataMinutes: number | undefined): number {
  if (prefDurataMinutes == null) return DEFAULT_TAPPA_DISTANCE_M
  const scaled = DEFAULT_TAPPA_DISTANCE_M * (prefDurataMinutes / DEFAULT_PREF_DURATA_MIN)
  return Math.min(MAX_TAPPA_DISTANCE_M, Math.max(MIN_TAPPA_DISTANCE_M, Math.round(scaled)))
}

/**
 * Divide l'itinerario ordinato (già l'esito di orderStopsNearestNeighbor + le legs reali già
 * calcolate) in tappe percorribili — verifica utente: "all'interno dello stesso cammino non è
 * ragionevole piazzare più di un certo numero di punti [...] impossibile visitare 30 musei in una
 * camminata soltanto". Una tappa si chiude al PRIMO dei due limiti raggiunto (numero di punti o
 * distanza accumulata), mai oltre — ma non è mai vuota: il primo punto entra sempre, anche
 * quando da solo supera già la soglia di distanza (un singolo balzo lungo non deve produrre una
 * tappa fantasma senza nulla dentro).
 */
export function groupStopsIntoTappe(
  center: { lat: number; lon: number },
  stops: ItineraryStopCandidate[],
  legs: ItineraryLeg[],
  maxStopsPerTappa: number,
  maxDistancePerTappaM: number,
): ItineraryTappa[] {
  const tappe: ItineraryTappa[] = []
  let currentStops: ItineraryStopCandidate[] = []
  let currentLegs: ItineraryLeg[] = []
  let currentDistanceM = 0
  let tappaStart = center

  function flush() {
    if (currentStops.length === 0) return
    tappe.push({ stops: currentStops, legs: currentLegs, distanceM: currentDistanceM, startPoint: tappaStart })
    tappaStart = { lat: currentStops[currentStops.length - 1].lat, lon: currentStops[currentStops.length - 1].lon }
    currentStops = []
    currentLegs = []
    currentDistanceM = 0
  }

  stops.forEach((stop, i) => {
    const leg = legs[i]
    const legDistanceM = leg?.distanceM ?? 0
    if (currentStops.length > 0 && (
      currentStops.length >= maxStopsPerTappa ||
      currentDistanceM + legDistanceM > maxDistancePerTappaM
    )) {
      flush()
    }
    currentStops.push(stop)
    currentLegs.push(leg)
    currentDistanceM += legDistanceM
  })
  flush()

  return tappe
}
