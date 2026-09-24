// Orchestrazione delle personalizzazioni utente sopra il raggruppamento in tappe (piano
// guide-eccellenza Fase 2) — condivisa da app/api/borgo-itinerary/route.ts (calcolo "leggero" ad
// ogni apertura della guida) e app/api/borgo-itinerary/apply-overrides/route.ts (ricalcolo reale
// dopo uno spostamento manuale confermato dall'utente): stessa identica logica, un solo posto.
//
// Due percorsi, di costo molto diverso:
// - Nessun pin di tappa (solo punti spenti/tempi di visita modificati) → path ECONOMICO: le legs
//   già calcolate/cache restano valide (l'ordine di visita non cambia), si aggiusta solo il
//   raggruppamento in tappe. Il caso comune, per la stragrande maggioranza delle richieste.
// - Almeno un pin di tappa (spostamento manuale) → richiede un vero ricalcolo: i punti vanno
//   riordinati per bucket e i tragitti reali ricalcolati con Dijkstra sulla rete pedonale — quasi
//   sempre un hit di cache bbox (fetchWalkNetworkForPoints), mai una nuova query Overpass per lo
//   stesso borgo.
import {
  type ItineraryStopCandidate, type ItineraryTappa, type BorgoItineraryOverrides,
  spliceLegsForRemovedStops, effectiveVisitMinutesFor, groupStopsIntoTappe,
  bucketStopsByEffectiveTappa, orderStopsNearestNeighbor, summarizeTappa,
} from '@/lib/metaSearch/borgoItinerary'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'
import { fetchWalkNetworkForPoints, buildLegsForWaypoints } from './borgoWalkLegs'

export async function computePersonalizedTappe(
  center: { lat: number; lon: number },
  stops: ItineraryStopCandidate[],
  legs: ItineraryLeg[],
  overrides: BorgoItineraryOverrides | undefined,
  maxStopsPerTappa: number,
  maxMinutesPerTappa: number,
  walkNetworkTimeoutMs: number,
): Promise<ItineraryTappa[]> {
  // Punti spenti — esclusi dal raggruppamento, le due legs che li circondano sostituite da
  // un'unica leg "ponte" (spliceLegsForRemovedStops, mai un round-trip di rete: solo una
  // ricostruzione geometrica locale, gratuita anche per il caso comune di nessun punto spento).
  const disabledIds = new Set(stops.filter(s => overrides?.[s.id]?.disabled).map(s => s.id))
  const { stops: activeStops, legs: activeLegs } = disabledIds.size > 0
    ? spliceLegsForRemovedStops(stops, legs, disabledIds, center)
    : { stops, legs }

  const visitMinutesForStop = overrides
    ? (stop: ItineraryStopCandidate) => effectiveVisitMinutesFor(stop, overrides)
    : undefined

  const autoTappe = groupStopsIntoTappe(center, activeStops, activeLegs, maxStopsPerTappa, maxMinutesPerTappa, visitMinutesForStop)

  const hasPins = overrides != null && activeStops.some(s => overrides[s.id]?.tappaIndex != null)
  if (!hasPins) return autoTappe

  // Da qui in poi: almeno uno spostamento manuale confermato — i bucket "effettivi" non
  // rispecchiano più l'ordine/i tragitti già calcolati, vanno ricostruiti da zero per ciascun
  // bucket (vicino-più-vicino a partire dal punto d'arrivo del bucket precedente, poi un vero
  // cammino sulla rete pedonale tra quei waypoint).
  const buckets = bucketStopsByEffectiveTappa(autoTappe, overrides)
  const network = await fetchWalkNetworkForPoints([center, ...activeStops], walkNetworkTimeoutMs)

  const tappe: ItineraryTappa[] = []
  let cursor = center
  for (const bucketStops of buckets) {
    const ordered = orderStopsNearestNeighbor(cursor, bucketStops)
    const waypoints = [cursor, ...ordered.map(s => ({ lat: s.lat, lon: s.lon }))]
    const { legs: bucketLegs } = buildLegsForWaypoints(network, waypoints)
    tappe.push(summarizeTappa(ordered, bucketLegs, cursor, visitMinutesForStop))
    cursor = { lat: ordered[ordered.length - 1].lat, lon: ordered[ordered.length - 1].lon }
  }
  return tappe
}
