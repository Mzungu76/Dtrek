// Tragitto a piedi reale tra due punti (rete pedonale OSM via Dijkstra, ripiego a linea d'aria
// quando non trovato) — estratto da app/api/borgo-itinerary/route.ts perché ora serve un secondo
// chiamante: app/api/borgo-itinerary/apply-overrides/route.ts, che deve ricalcolare i tragitti
// reali di un ordine di visita RIORGANIZZATO dall'utente (spostamento manuale di un punto tra
// tappe, confermato) — stessa identica logica, un solo posto invece di due copie.
import { fetchWalkNetworkCached } from './walkNetworkCache'
import { nearestGraphNode, type WalkNetwork } from './osmGraph'
import { aStarToTarget, reconstructPath, DIJKSTRA_MAX_DIST_M } from './walkRouting'
import { padBbox } from '../overpassTrails'
import { haversineM } from '../geoUtils'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

// Verifica utente (Chieti) — vedi il commento su aStarToTarget in lib/routeBuilder/walkRouting.ts:
// con Dijkstra puro questo tetto doveva bastare a esplorare un intero "anello" di nodi equidistanti
// in ogni direzione (~3700 nodi serviti per una tappa reale a 2,8km in un centro denso, ben oltre
// gli 800 di prima) — con A* lo stesso cammino ne esplora meno di 1000, perché la ricerca converge
// verso il bersaglio invece di espandersi alla cieca. Il margine resta ampio (non il minimo
// osservato) perché un centro storico ancora più denso di Chieti può sempre richiederne qualcuno in
// più, e il costo di un budget più alto qui è pagato solo quando serve davvero (A* si ferma appena
// il bersaglio viene estratto, mai un'esplorazione completa fino al tetto quando il cammino è breve).
const ASTAR_MAX_NODES = 4000
const SNAP_THRESHOLD_M = 300

export function routeLeg(
  network: WalkNetwork | null,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { distanceM: number; polyline: [number, number][]; real: boolean } {
  const straightLine = {
    distanceM: haversineM(from.lat, from.lon, to.lat, to.lon),
    polyline: [[from.lat, from.lon], [to.lat, to.lon]] as [number, number][],
    real: false,
  }
  if (!network || network.nodes.size === 0) return straightLine

  const start = nearestGraphNode(network, from.lat, from.lon, SNAP_THRESHOLD_M)
  const end = nearestGraphNode(network, to.lat, to.lon, SNAP_THRESHOLD_M)
  if (!start || !end) return straightLine

  const { distM, prev } = aStarToTarget(network, start.nodeId, end.nodeId, DIJKSTRA_MAX_DIST_M, ASTAR_MAX_NODES)
  if (distM == null) return straightLine

  return {
    distanceM: distM + start.distM + end.distM,
    polyline: reconstructPath(network, prev, end.nodeId, start.nodeId),
    real: true,
  }
}

/** Bbox della rete pedonale per un elenco di punti, con un margine di 400m (le vie che portano a
 *  un punto periferico spesso escono dal rettangolo stretto che li contiene tutti) — stessa cache
 *  bbox-based di sempre (walkNetworkCache.ts): un ricalcolo per lo STESSO borgo ricade quasi
 *  sempre su un hit di cache, mai un nuovo fetch Overpass. */
export async function fetchWalkNetworkForPoints(
  points: { lat: number; lon: number }[],
  timeoutMs: number,
): Promise<WalkNetwork | null> {
  const rawBbox: [number, number, number, number] = [
    Math.min(...points.map(p => p.lat)),
    Math.min(...points.map(p => p.lon)),
    Math.max(...points.map(p => p.lat)),
    Math.max(...points.map(p => p.lon)),
  ]
  const bbox = padBbox(rawBbox, 0.4)
  try {
    return await fetchWalkNetworkCached(bbox, false, timeoutMs)
  } catch (e) {
    console.error('[borgoWalkLegs] rete pedonale non disponibile, ripiego su linee d\'aria', e)
    return null
  }
}

/** Legs consecutive per una sequenza di waypoint (il primo è il punto di partenza, mai una tappa
 *  vera e propria — fromIdx -1 per il primo tratto, stesso schema di sempre). */
export function buildLegsForWaypoints(
  network: WalkNetwork | null,
  waypoints: { lat: number; lon: number }[],
): { legs: ItineraryLeg[]; totalDistanceM: number } {
  const legs: ItineraryLeg[] = []
  let totalDistanceM = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = routeLeg(network, waypoints[i], waypoints[i + 1])
    legs.push({ fromIdx: i - 1, toIdx: i, distanceM: leg.distanceM, polyline: leg.polyline, real: leg.real })
    totalDistanceM += leg.distanceM
  }
  return { legs, totalDistanceM }
}
