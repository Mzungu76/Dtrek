import { haversineM } from '../geoUtils'
import { DEFAULT_VISIT_MINUTES, SITE_TYPE_CONFIG, type SiteType } from '../metaTypes'
import { DIJKSTRA_MAX_DIST_M } from '../routeBuilder/walkRouting'
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

// Stessa soglia della rete pedonale (lib/routeBuilder/borgoWalkLegs.ts): oltre questa distanza un
// tragitto non riceve comunque mai un cammino reale (routeLeg ricade sulla linea d'aria), quindi un
// candidato più lontano di così dal resto del cluster non produrrebbe un itinerario A PIEDI
// sensato in ogni caso — un solo valore condiviso, mai due soglie che potrebbero divergere.
export const MAX_STOP_NEIGHBOR_DISTANCE_M = DIJKSTRA_MAX_DIST_M

/**
 * Verifica utente (Chieti, place id eb07bfac-e861-484c-bb4c-acca63838e3f) — "Casa natale di S.
 * Camillo de Lellis" (a Bucchianico, un paese diverso) inclusa fra le tappe pur essendo a ~4,4km in
 * linea d'aria da OGNI altra tappa trovata (confermato sui dati reali di dtrek_places.
 * itinerary_cache) — RADIUS_STEPS (app/api/borgo-itinerary/route.ts) allarga il raggio di ricerca
 * fino a 20km per una città grande, ma nulla a valle scartava un candidato la cui distanza dal
 * resto del cluster fosse anomala rispetto alle altre tappe. Un raggio fisso dal CENTRO non
 * basterebbe a distinguere i due casi: una città vera densa può avere tappe genuine fino al bordo
 * del raggio massimo, raggiungibili però l'una dall'altra con una catena di passi brevi (mai un
 * salto isolato) — qui si verifica invece la raggiungibilità A CATENA entro maxNeighborDistM,
 * partendo dal centro del Borgo (sempre legittimo, il seme della ricerca): un candidato entra nel
 * cluster se è entro la soglia dal centro O da un altro candidato già nel cluster, quale che sia
 * l'estensione totale del centro storico — un candidato realmente isolato (un paese diverso emerso
 * dalla stessa geosearch) non lo è mai, nessuna catena di passi brevi lo raggiunge.
 */
export function excludeIsolatedOutliers<T extends { lat: number; lon: number }>(
  center: { lat: number; lon: number },
  stops: T[],
  maxNeighborDistM: number = MAX_STOP_NEIGHBOR_DISTANCE_M,
): { kept: T[]; outliers: T[] } {
  const clusterPoints: { lat: number; lon: number }[] = [center]
  let remaining = stops.map((stop, index) => ({ stop, index }))
  const keptIndexes = new Set<number>()

  let progress = true
  while (progress) {
    progress = false
    remaining = remaining.filter(({ stop, index }) => {
      const isInCluster = clusterPoints.some(p => haversineM(p.lat, p.lon, stop.lat, stop.lon) <= maxNeighborDistM)
      if (!isInCluster) return true
      keptIndexes.add(index)
      clusterPoints.push(stop)
      progress = true
      return false
    })
  }

  const kept: T[] = []
  const outliers: T[] = []
  stops.forEach((stop, index) => (keptIndexes.has(index) ? kept : outliers).push(stop))
  return { kept, outliers }
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

// Budget di una "giornata di visita culturale" (verifica utente: il tempo di un Borgo/Città non è
// la fatica fisica di un'escursione — pref_durata/lo storico escursionistico misuravano la cosa
// sbagliata, un vincolo fisico applicato a un'attività che non lo è). ~6 ore di visita attiva:
// abbastanza per un centro storico importante, pause/pranzo lasciati fuori (mai conteggiati come
// tempo di visita). Ogni tappa rappresenta una giornata (o una sua frazione, quando il contenuto
// del Borgo non la riempie) — "mezza giornata"/"giornata intera"/"più giorni" emergono così da
// soli dal numero di tappe che groupStopsIntoTappe produce quando l'utente non tocca nulla, mai da
// una scelta obbligatoria — ma restano comunque tre preset selezionabili esplicitamente (verifica
// utente: "mi dicevi che hai previsto anche la modifica della durata"), persistiti per Meta su
// planned_hikes.borgo_day_budget_minutes.
export const DAY_BUDGET_MINUTES = 360
export const HALF_DAY_BUDGET_MINUTES = 180
export const MULTI_DAY_BUDGET_MINUTES = 600

// Pavimento per il "trekking misto" sotto — un Borgo/Città con una traccia GPS reale collegata
// (borgoCardVariant 'trekking_misto', lib/guideCardVariant.ts) non deve mai azzerare del tutto il
// tempo per le soste culturali, anche quando il trek da solo esaurirebbe l'intera giornata: restano
// sempre un paio di soste "flash" possibili lungo il percorso.
const MIN_CULTURAL_BUDGET_MINUTES = 45

/**
 * Budget di tempo per tappa culturale — verifica utente: "budget residuo della giornata" per il
 * trekking misto, "automatico dal contenuto" (dayBudgetOverrideMinutes assente) per stabilire se
 * è mezza giornata/giornata/più giorni quando l'utente non ha mai scelto esplicitamente. Senza
 * nessuna traccia GPS reale collegata (cammino_urbano, il caso comune) l'intera giornata è libera
 * per la cultura: il budget (di default o scelto dall'utente) per intero. Con una traccia reale
 * (trekking_misto) il tempo del cammino fisico vero e proprio va sottratto prima — quello resta
 * legittimamente governato dal passo/storico escursionistico altrove (lib/hikerHistory.ts), qui
 * arriva già come durata. Un dayBudgetOverrideMinutes esplicito (planned_hikes.
 * borgo_day_budget_minutes) sostituisce solo il default automatico, la sottrazione del trekking
 * misto si applica comunque sopra: scegliere "giornata intera" mentre si è a metà di un trek reale
 * non deve mai promettere un'intera giornata libera che non esiste.
 *
 * trackDurationMinutes viene da PlannedHike.estimatedTimeSeconds — nasce a 0 per una Meta creata
 * dalla ricerca (lib/metaToPlannedHike.ts) e diventa reale solo quando una traccia GPX viene
 * davvero importata: lo stesso segnale usato da borgoCardVariant, senza dover rileggere
 * trackPoints/routePolyline (molto più pesanti) solo per un controllo di presenza.
 */
export function culturalTappaBudgetMinutes(
  trackDurationMinutes: number | undefined,
  dayBudgetOverrideMinutes?: number,
): number {
  const dayBudget = dayBudgetOverrideMinutes ?? DAY_BUDGET_MINUTES
  if (!trackDurationMinutes || trackDurationMinutes <= 0) return dayBudget
  return Math.max(MIN_CULTURAL_BUDGET_MINUTES, dayBudget - trackDurationMinutes)
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
