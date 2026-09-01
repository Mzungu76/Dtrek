import { haversineM } from './geoUtils'
import type { TimeBudget } from './metaSearch/types'

// Generazione itinerari Borgo/Città (piano §26) — Meta + POI contenuti + tempo disponibile +
// interessi → un Percorso ordinato. Deterministico, mai un LLM a decidere l'ordine delle tappe
// (piano §21, stesso principio della ricerca): l'AI potrà eventualmente spiegare l'itinerario
// prodotto qui, non inventarne uno diverso.
//
// Algoritmo v1: nearest-neighbor greedy a partire dal punto di partenza, troncato dal budget di
// tempo (cammino a ritmo pedonale + un tempo di visita fisso per tappa — nessun dato reale di
// "durata di visita per POI" esiste ancora, piano §46 "Place enrichment" è lavoro futuro). Il
// piano stesso anticipa questo limite: "In futuro il motore potrà usare routing pedonale" — questa
// è la v1 esplicitamente prevista, non un ripiego nascosto.

export interface ItineraryStop {
  id: string
  name: string
  latitude: number
  longitude: number
  description?: string
}

export interface OrderedItineraryStop extends ItineraryStop {
  order: number
  distanceFromPreviousMeters: number
  cumulativeDistanceMeters: number
  cumulativeTimeSeconds: number
}

export interface Itinerary {
  stops: OrderedItineraryStop[]
  totalDistanceMeters: number
  estimatedTimeSeconds: number
  // Tappe scartate perché il budget di tempo si esaurisce prima di raggiungerle — mai fabbricato
  // un itinerario che sfori il tempo disponibile dell'utente (piano §19, "Quanto tempo?").
  omittedStopIds: string[]
}

// Ritmo pedonale in un centro storico (più lento di un cammino escursionistico in piano, per
// dislivelli/vicoli/soste fotografiche implicite) — stima esplicita, non misurata: da rivedere se
// in futuro emergono dati reali di percorrenza urbana.
const WALKING_SPEED_M_PER_MIN = 60
// Tempo di visita fisso per tappa in assenza di un dato reale per-POI (durata_visita, piano §22/
// §23 — non ancora disponibile, vedi lib/metaSearch/ranking.ts). Conservativo: meglio proporre
// meno tappe di quante ce ne stiano davvero, che un itinerario che sfora il tempo dichiarato.
const DEFAULT_VISIT_MINUTES_PER_STOP = 10

const TIME_BUDGET_MINUTES: Record<TimeBudget, number> = {
  '30min': 30,
  '1h': 60,
  '2h': 120,
  mezza_giornata: 240,
  giornata: 480,
}

export interface GenerateItineraryParams {
  start: { latitude: number; longitude: number }
  stops: ItineraryStop[]
  timeAvailable?: TimeBudget
  visitMinutesPerStop?: number
}

// Nessun limite di tempo dato → include tutte le tappe nell'ordine geografico più breve trovato
// (nearest-neighbor), senza troncare — un itinerario "libero" (piano §25, "itinerario libero") è
// un caso legittimo, non un errore.
export function generateItinerary(params: GenerateItineraryParams): Itinerary {
  const visitMinutesPerStop = params.visitMinutesPerStop ?? DEFAULT_VISIT_MINUTES_PER_STOP
  const budgetSeconds = params.timeAvailable ? TIME_BUDGET_MINUTES[params.timeAvailable] * 60 : Infinity

  const remaining = [...params.stops]
  const ordered: OrderedItineraryStop[] = []
  let current = params.start
  let cumulativeDistance = 0
  let cumulativeTime = 0
  let order = 0

  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDistance = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(current.latitude, current.longitude, remaining[i].latitude, remaining[i].longitude)
      if (d < nearestDistance) { nearestDistance = d; nearestIdx = i }
    }
    const walkSeconds = (nearestDistance / WALKING_SPEED_M_PER_MIN) * 60
    const visitSeconds = visitMinutesPerStop * 60
    const projectedTime = cumulativeTime + walkSeconds + visitSeconds
    if (projectedTime > budgetSeconds) break // il budget non copre nemmeno questa tappa più vicina

    const stop = remaining[nearestIdx]
    remaining.splice(nearestIdx, 1)
    cumulativeDistance += nearestDistance
    cumulativeTime = projectedTime
    order++
    ordered.push({
      ...stop, order,
      distanceFromPreviousMeters: nearestDistance,
      cumulativeDistanceMeters: cumulativeDistance,
      cumulativeTimeSeconds: cumulativeTime,
    })
    current = { latitude: stop.latitude, longitude: stop.longitude }
  }

  return {
    stops: ordered,
    totalDistanceMeters: cumulativeDistance,
    estimatedTimeSeconds: cumulativeTime,
    omittedStopIds: remaining.map(s => s.id),
  }
}
