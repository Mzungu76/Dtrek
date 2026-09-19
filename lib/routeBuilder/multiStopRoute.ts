// Itinerario a piedi che deve toccare TUTTE le tappe scelte dall'utente, nell'ordine di selezione
// — a differenza di app/api/borgo-itinerary/route.ts (itinerario automatico passivo, tappe
// scoperte in autonomia e ordinate a vicino-più-vicino, con un ripiego a linea d'aria per una
// tappa isolata), questa è una generazione DELIBERATA: l'utente ha scelto a mano quali punti
// toccare, quindi un tratto irraggiungibile non deve mai degradare silenziosamente a linea
// d'aria — va dichiarato esplicitamente, per coppia di tappe, così l'utente può aggiustare la
// selezione (rimuovere quella tappa, cambiare urbano/misto) invece di ricevere un risultato che
// sembra completo ma non lo è. Puro (nessun import Supabase/Overpass), stesso livello di
// lib/routeBuilder/loopBuilder.ts — chi chiama fornisce già il WalkNetwork.
import { nearestGraphNode, type WalkNetwork, type GraphEdge } from './osmGraph'
import { dijkstra, reconstructPath } from './walkRouting'

export type MultiStopMode = 'urbano' | 'misto'

// "Trekking urbano": solo le vie di un centro abitato, mai un sentiero/tracciato/mulattiera — le
// stesse esclusioni descritte dall'utente ("deve ignorare i sentieri"). `footway` resta escluso
// insieme a path/track/bridleway/steps: OSM non distingue nei tag un marciapiede urbano da un
// sentiero di campagna, quindi non c'è modo affidabile di tenere l'uno ed escludere l'altro — la
// rete percorribile fetchata (WALKABLE_HIGHWAY, lib/routeBuilder/osmGraph.ts) resta comunque la
// stessa in entrambe le modalità, qui si filtra solo in fase di attraversamento del grafo.
const URBAN_ALLOWED_HIGHWAY = new Set(['residential', 'unclassified'])

function urbanEdgeFilter(edge: GraphEdge): boolean {
  return edge.highway != null && URBAN_ALLOWED_HIGHWAY.has(edge.highway)
}

// Soglia di aggancio più larga di quella dell'itinerario automatico (300m, borgo-itinerary) — le
// tappe qui sono scelte liberamente dall'utente sulla mappa, spesso più sparse delle sole "tappe
// vicine" scoperte in autonomia.
const SNAP_THRESHOLD_M = 350
// Più ampi di DIJKSTRA_MAX_DIST_M/MAX_NODES di borgo-itinerary.ts (3000/800): le tappe scelte
// dall'utente possono essere più distanti fra loro di un giro "nelle vicinanze" auto-scoperto.
const DIJKSTRA_MAX_DIST_M = 8000
const DIJKSTRA_MAX_NODES = 2500

export interface MultiStopLeg {
  fromStopIdx: number
  toStopIdx: number
  distanceM: number
  polyline: [number, number][]
}

export interface MultiStopFailedLeg {
  fromStopIdx: number
  toStopIdx: number
  reason: 'too_far_from_network' | 'no_path'
}

export type MultiStopOutcome =
  | { ok: true; legs: MultiStopLeg[] }
  | { ok: false; failedLegs: MultiStopFailedLeg[] }

/**
 * Percorso a piedi che tocca, in sequenza, tutti i punti di `stops` (indice 0 incluso) — un
 * Dijkstra + ricostruzione per ogni coppia consecutiva (stesso schema di routeLeg() in
 * app/api/borgo-itinerary/route.ts), MAI un ripiego a linea d'aria: una coppia che non si
 * raggiunge finisce in `failedLegs` e si continua comunque a verificare le altre, così un solo
 * tentativo elenca tutti i collegamenti mancanti invece di fermarsi al primo.
 */
export function buildMultiStopRoute(
  network: WalkNetwork, stops: { lat: number; lon: number }[], mode: MultiStopMode,
): MultiStopOutcome {
  const isEdgeAllowed = mode === 'urbano' ? urbanEdgeFilter : undefined
  const legs: MultiStopLeg[] = []
  const failedLegs: MultiStopFailedLeg[] = []

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const startNode = nearestGraphNode(network, from.lat, from.lon, SNAP_THRESHOLD_M)
    const endNode = nearestGraphNode(network, to.lat, to.lon, SNAP_THRESHOLD_M)
    if (!startNode || !endNode) {
      failedLegs.push({ fromStopIdx: i, toStopIdx: i + 1, reason: 'too_far_from_network' })
      continue
    }

    const { dist, prev } = dijkstra(network, startNode.nodeId, DIJKSTRA_MAX_DIST_M, DIJKSTRA_MAX_NODES, isEdgeAllowed)
    const targetDist = dist.get(endNode.nodeId)
    if (targetDist == null) {
      failedLegs.push({ fromStopIdx: i, toStopIdx: i + 1, reason: 'no_path' })
      continue
    }

    legs.push({
      fromStopIdx: i,
      toStopIdx: i + 1,
      distanceM: targetDist + startNode.distM + endNode.distM,
      polyline: reconstructPath(network, prev, endNode.nodeId, startNode.nodeId),
    })
  }

  if (failedLegs.length > 0) return { ok: false, failedLegs }
  return { ok: true, legs }
}
