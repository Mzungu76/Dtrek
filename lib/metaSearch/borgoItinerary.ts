import { haversineM } from '../geoUtils'
import { DEFAULT_VISIT_MINUTES, SITE_TYPE_CONFIG, type SiteType } from '../metaTypes'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

// ~4.3 km/h — un ritmo da visita (con soste implicite), non una camminata sportiva: la stessa
// differenza per cui la stima di un Sentiero (lib/trailStats.ts) non è utilizzabile qui. Vive qui
// (non in app/api/borgo-itinerary/route.ts, che la importa) perché il raggruppamento in tappe a
// tempo (più sotto) ne ha bisogno per convertire una distanza in un tempo di cammino equivalente.
export const WALK_SPEED_MPS = 1.2

// Tetto di punti per singola tappa — condiviso da app/api/borgo-itinerary/route.ts (raggruppamento
// automatico) e app/api/borgo-itinerary/apply-overrides/route.ts (stesso raggruppamento sui bucket
// non toccati da un pin manuale): un solo valore, mai due copie che potrebbero divergere.
export const MAX_STOPS_PER_TAPPA = 6

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
  /** Cammino + visita di ogni tappa (verifica utente: "un poi potrebbe essere molto vicino ma
   *  richiedere mezza giornata di visita") — il vero criterio di chiusura di una tappa, la
   *  distanza sopra resta solo per mostrare i km percorsi. */
  totalMinutes: number
  /** Punto di partenza di QUESTA tappa — il Borgo stesso per la prima tappa, l'ultima tappa
   *  della tappa precedente per le successive: la camminata continua da lì, non si
   *  "teletrasporta" da un capo all'altro della città tra una tappa e la successiva. */
  startPoint: { lat: number; lon: number }
}

/** Tempo di visita tipico di una tappa — SITE_TYPE_CONFIG (lib/metaTypes.ts) quando il siteType è
 *  noto, altrimenti DEFAULT_VISIT_MINUTES (una tappa da Wikipedia senza classificazione, o
 *  dall'archivio senza subtype) — mai zero, sparirebbe dal budget come se non richiedesse nulla. */
export function visitMinutesFor(stop: { siteType?: SiteType }): number {
  return stop.siteType ? SITE_TYPE_CONFIG[stop.siteType].visitMinutes : DEFAULT_VISIT_MINUTES
}

// ── Personalizzazioni dell'utente (verifica utente — slider del tempo di visita, "spegnimento" di
// un punto, spostamento manuale tra tappe) — persistite sparse su planned_hikes.
// borgo_itinerary_overrides (mai un default duplicato per ogni punto, solo le voci che l'utente ha
// davvero cambiato), applicate qui sopra all'elenco base condiviso (dtrek_places.itinerary_cache)
// prima del raggruppamento in tappe. ─────────────────────────────────────────────────────────────

export interface BorgoStopOverride {
  /** Sostituisce visitMinutesFor(stop) per QUESTO punto — dallo slider dell'utente. */
  visitMinutes?: number
  /** "Spento" dall'utente — mai considerato nel budget/raggruppamento, ma non sparisce: resta
   *  visibile (semitrasparente) e riattivabile. */
  disabled?: boolean
  /** Tappa scelta esplicitamente dall'utente (indice 0-based) — vince sul raggruppamento
   *  automatico. Uno spostamento manuale richiede un ricalcolo dei tragitti reali lato server
   *  (verifica utente: "ricalcolo reale al server quando l'utente conferma"), mai una linea d'aria
   *  istantanea lato client. */
  tappaIndex?: number
}

export type BorgoItineraryOverrides = Record<string, BorgoStopOverride>

/**
 * Applica le personalizzazioni all'elenco base (già ordinato/con le legs reali) — separa i punti
 * "spenti" (esclusi dal budget/raggruppamento, mai dal risultato: il chiamante li mostra comunque,
 * semitrasparenti) da quelli attivi. Le legs restano quelle originali (indicizzate come stops) fino
 * a un'eventuale richiesta di ricalcolo — questa funzione non tocca mai i tragitti.
 */
export function partitionStopsByOverrides(
  stops: ItineraryStopCandidate[],
  overrides: BorgoItineraryOverrides | undefined,
): { activeStops: ItineraryStopCandidate[]; disabledStops: ItineraryStopCandidate[] } {
  if (!overrides) return { activeStops: stops, disabledStops: [] }
  const activeStops: ItineraryStopCandidate[] = []
  const disabledStops: ItineraryStopCandidate[] = []
  for (const stop of stops) {
    if (overrides[stop.id]?.disabled) disabledStops.push(stop)
    else activeStops.push(stop)
  }
  return { activeStops, disabledStops }
}

/** Tempo di visita effettivo di un punto — l'override dell'utente se presente, altrimenti il
 *  default per tipo (visitMinutesFor sopra). Iniettato in groupStopsIntoTappe invece di una
 *  seconda copia dell'algoritmo di raggruppamento: la sola differenza tra "con override" e "senza"
 *  è QUALE tempo si somma per ciascun punto, non come si somma. */
export function effectiveVisitMinutesFor(stop: ItineraryStopCandidate, overrides: BorgoItineraryOverrides | undefined): number {
  return overrides?.[stop.id]?.visitMinutes ?? visitMinutesFor(stop)
}

// Un segmento comodo di visita (cammino + soste) quando non c'è ancora nessun segnale
// sull'utente — DEFAULT_REFERENCE_MINUTES rispecchia lo stesso default di user_settings.pref_durata
// (lib/useUserPrefs.ts), la base rispetto a cui scalare qualunque segnale reale.
const DEFAULT_TAPPA_MINUTES = 150
const DEFAULT_REFERENCE_MINUTES = 270
// Mai una tappa così corta da essere inutile, né così lunga da vanificare il senso stesso di
// "tappa" — un pavimento e un tetto attorno al valore scalato, non un secondo criterio a sé.
const MIN_TAPPA_MINUTES = 60
const MAX_TAPPA_MINUTES = 300

/**
 * Segnale di durata da usare per personalizzare una tappa — verifica utente: "sei sicuro di
 * considerare anche lo storico? Io gestisco anche distanze più lunghe". Priorità allo storico
 * REALE (lib/hikerHistory.ts — le ultime uscite se già disponibili, altrimenti la media storica)
 * quando l'utente ha già attività registrate: più affidabile di una preferenza impostata una volta
 * in Impostazioni e mai più toccata. Ricade su quella preferenza (pref_durata) solo per un utente
 * ancora senza storico. Struttura minimale (non l'intero HikerHistoryStats) apposta: questo modulo
 * resta puro/testabile senza importare lib/hikerHistory.ts (solo lato server).
 */
export function resolveDurationSignalMinutes(
  history: { count: number; sumDurationMin: number; recent: { durationMin: number }[] } | undefined,
  prefDurataMinutes: number | undefined,
): number | undefined {
  if (history && history.count > 0) {
    if (history.recent.length > 0) return history.recent.reduce((s, r) => s + r.durationMin, 0) / history.recent.length
    return history.sumDurationMin / history.count
  }
  return prefDurataMinutes
}

/**
 * Budget di tempo "comodo" per una singola tappa, personalizzato sul segnale di durata risolto
 * sopra (storico reale o preferenza dichiarata) — scala il default medio in proporzione, non lo
 * riusa direttamente: quel segnale rappresenta l'intera uscita che un utente preferisce fare, non
 * un singolo segmento tra le tante tappe di una città grande. undefined (nessun segnale
 * disponibile) ⇒ il default medio, mai bloccante.
 */
export function personalizedTappaMinutes(durationSignalMinutes: number | undefined): number {
  if (durationSignalMinutes == null || durationSignalMinutes <= 0) return DEFAULT_TAPPA_MINUTES
  const scaled = DEFAULT_TAPPA_MINUTES * (durationSignalMinutes / DEFAULT_REFERENCE_MINUTES)
  return Math.min(MAX_TAPPA_MINUTES, Math.max(MIN_TAPPA_MINUTES, Math.round(scaled)))
}

/**
 * Divide l'itinerario ordinato (già l'esito di orderStopsNearestNeighbor + le legs reali già
 * calcolate) in tappe percorribili — verifica utente: "all'interno dello stesso cammino non è
 * ragionevole piazzare più di un certo numero di punti [...] impossibile visitare 30 musei in una
 * camminata soltanto" + "un poi potrebbe essere molto vicino ma richiedere mezza giornata di
 * visita". Una tappa si chiude al PRIMO dei due limiti raggiunto (numero di punti o TEMPO
 * accumulato — cammino fino a quel punto più il tempo di visita di ciascuno, mai la sola
 * distanza), mai oltre — ma non è mai vuota: il primo punto entra sempre, anche quando da solo
 * supera già il budget (un singolo balzo lungo, o un museo molto lungo da visitare, non deve
 * produrre una tappa fantasma senza nulla dentro).
 */
export function groupStopsIntoTappe(
  center: { lat: number; lon: number },
  stops: ItineraryStopCandidate[],
  legs: ItineraryLeg[],
  maxStopsPerTappa: number,
  maxMinutesPerTappa: number,
  // Iniettabile — di default il tempo per tipo di sito, ma il chiamante può passare
  // effectiveVisitMinutesFor (sopra) per tenere conto degli slider dell'utente senza duplicare
  // questo algoritmo.
  visitMinutesForStop: (stop: ItineraryStopCandidate) => number = visitMinutesFor,
): ItineraryTappa[] {
  const tappe: ItineraryTappa[] = []
  let currentStops: ItineraryStopCandidate[] = []
  let currentLegs: ItineraryLeg[] = []
  let currentDistanceM = 0
  let currentMinutes = 0
  let tappaStart = center

  function flush() {
    if (currentStops.length === 0) return
    tappe.push({ stops: currentStops, legs: currentLegs, distanceM: currentDistanceM, totalMinutes: Math.round(currentMinutes), startPoint: tappaStart })
    tappaStart = { lat: currentStops[currentStops.length - 1].lat, lon: currentStops[currentStops.length - 1].lon }
    currentStops = []
    currentLegs = []
    currentDistanceM = 0
    currentMinutes = 0
  }

  stops.forEach((stop, i) => {
    const leg = legs[i]
    const legDistanceM = leg?.distanceM ?? 0
    const addedMinutes = (legDistanceM / WALK_SPEED_MPS / 60) + visitMinutesForStop(stop)
    if (currentStops.length > 0 && (
      currentStops.length >= maxStopsPerTappa ||
      currentMinutes + addedMinutes > maxMinutesPerTappa
    )) {
      flush()
    }
    currentStops.push(stop)
    currentLegs.push(leg)
    currentDistanceM += legDistanceM
    currentMinutes += addedMinutes
  })
  flush()

  return tappe
}

// ── Spostamento manuale tra tappe (verifica utente — "ricalcolo reale al server quando l'utente
// conferma", mai una linea d'aria istantanea lato client per QUESTO caso) e "spegnimento" di un
// punto (istantaneo, sempre lato client: nessun tragitto reale da ricalcolare, solo un "ponte" tra
// i due punti rimasti adiacenti). ────────────────────────────────────────────────────────────────

/**
 * Assembla una ItineraryTappa già pronta (stops+legs nello stesso ordine) sommando distanza e
 * tempo — stessa formula di somma di groupStopsIntoTappe, usata quando i confini della tappa non
 * derivano da un budget di tempo ma da un bucket già fissato altrove (un pin manuale di tappa,
 * lib/routeBuilder/borgoTappePersonalization.ts): mai una seconda versione della somma che
 * potrebbe divergere da quella "automatica".
 */
export function summarizeTappa(
  stops: ItineraryStopCandidate[],
  legs: ItineraryLeg[],
  startPoint: { lat: number; lon: number },
  visitMinutesForStop: (stop: ItineraryStopCandidate) => number = visitMinutesFor,
): ItineraryTappa {
  let distanceM = 0
  let minutes = 0
  stops.forEach((stop, i) => {
    const legDistanceM = legs[i]?.distanceM ?? 0
    distanceM += legDistanceM
    minutes += (legDistanceM / WALK_SPEED_MPS / 60) + visitMinutesForStop(stop)
  })
  return { stops, legs, distanceM, totalMinutes: Math.round(minutes), startPoint }
}

/**
 * Legs "ponte" in linea d'aria per una sequenza di waypoint — SOLO per un'anteprima ISTANTANEA
 * lato client di uno spostamento manuale non ancora confermato (componenti/guida/widgets/
 * BorgoTappeWidget.tsx): mai per il risultato finale mostrato dopo la conferma, quello arriva
 * sempre da un vero ricalcolo lato server (computePersonalizedTappe, lib/routeBuilder/
 * borgoTappePersonalization.ts) sulla rete pedonale reale. Stessa convenzione di indicizzazione di
 * ogni altra leg in questo modulo (fromIdx -1 per il primo tratto).
 */
export function buildStraightLegs(waypoints: { lat: number; lon: number }[]): ItineraryLeg[] {
  const legs: ItineraryLeg[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    legs.push({
      fromIdx: i - 1,
      toIdx: i,
      distanceM: haversineM(from.lat, from.lon, to.lat, to.lon),
      polyline: [[from.lat, from.lon], [to.lat, to.lon]],
      real: false,
    })
  }
  return legs
}

/**
 * Raggruppa le tappe ATTIVE (già escluse quelle spente, partitionStopsByOverrides sopra) per tappa
 * "effettiva": quella scelta dal raggruppamento automatico (groupStopsIntoTappe), salvo un pin
 * esplicito dell'utente (override.tappaIndex, spostamento manuale) che vince sempre. Un pin oltre
 * l'ultima tappa automatica apre le tappe intermedie/finali necessarie (mai un indice "perso" per
 * mancanza di spazio) — il chiamante (l'endpoint di ricalcolo) riordina poi ciascun bucket a
 * vicino-più-vicino e ne ricalcola i tragitti reali: questa funzione fa solo lo smistamento, mai
 * l'ordine di visita al suo interno.
 */
export function bucketStopsByEffectiveTappa(
  autoTappe: ItineraryTappa[],
  overrides: BorgoItineraryOverrides | undefined,
): ItineraryStopCandidate[][] {
  if (!overrides) return autoTappe.map(t => [...t.stops])

  const assignments: { stop: ItineraryStopCandidate; tappaIndex: number }[] = []
  autoTappe.forEach((tappa, autoIdx) => {
    for (const stop of tappa.stops) {
      const pinned = overrides[stop.id]?.tappaIndex
      assignments.push({ stop, tappaIndex: pinned != null ? Math.max(0, pinned) : autoIdx })
    }
  })

  const bucketCount = assignments.reduce((max, a) => Math.max(max, a.tappaIndex + 1), autoTappe.length)
  const buckets: ItineraryStopCandidate[][] = Array.from({ length: bucketCount }, () => [])
  for (const { stop, tappaIndex } of assignments) buckets[tappaIndex].push(stop)

  return buckets.filter(b => b.length > 0)
}

/**
 * Anteprima ISTANTANEA (nessun round-trip al server) di uno "spegnimento": rimuove i punti indicati
 * da stops/legs di una singola tappa, sostituendo le legs spezzate da un punto rimosso con un'unica
 * nuova leg "ponte" (linea d'aria tra i due punti rimasti adiacenti, mai spacciata per reale) — le
 * legs non toccate da una rimozione restano quelle originali, reali o meno che fossero. Opera su UNA
 * tappa alla volta (le stesse `stops`/`legs` già mostrate da BorgoTappeWidget), non sull'intero
 * itinerario: riattivare il punto in seguito significa semplicemente ricalcolare questa funzione
 * senza quell'id nell'insieme, mai una richiesta al server per un'operazione reversibile e gratuita.
 */
export function spliceLegsForRemovedStops(
  stops: ItineraryStopCandidate[],
  legs: ItineraryLeg[],
  removedStopIds: Set<string>,
  tappaStart: { lat: number; lon: number },
): { stops: ItineraryStopCandidate[]; legs: ItineraryLeg[] } {
  const resultStops: ItineraryStopCandidate[] = []
  const resultLegs: ItineraryLeg[] = []
  let prevPoint = tappaStart

  stops.forEach((stop, i) => {
    if (removedStopIds.has(stop.id)) return
    resultStops.push(stop)
    const prevOriginal = stops[i - 1]
    if (prevOriginal && removedStopIds.has(prevOriginal.id)) {
      resultLegs.push({
        fromIdx: resultStops.length - 2,
        toIdx: resultStops.length - 1,
        distanceM: haversineM(prevPoint.lat, prevPoint.lon, stop.lat, stop.lon),
        polyline: [[prevPoint.lat, prevPoint.lon], [stop.lat, stop.lon]],
        real: false,
      })
    } else {
      const leg = legs[i]
      resultLegs.push({ ...leg, fromIdx: resultStops.length - 2, toIdx: resultStops.length - 1 })
    }
    prevPoint = { lat: stop.lat, lon: stop.lon }
  })

  return { stops: resultStops, legs: resultLegs }
}
