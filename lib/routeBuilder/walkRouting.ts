// Dijkstra + ricostruzione percorso su un WalkNetwork (lib/routeBuilder/osmGraph.ts) — estratto da
// lib/navigation/escapeEngine.ts (che lo usava solo per sé, come funzioni locali non esportate)
// perché ora serve un secondo chiamante: l'itinerario a piedi fra le tappe di un Borgo/Città
// (lib/metaSearch/borgoItinerary.ts). Stessa identica logica, un solo posto invece di due copie
// — escapeEngine.ts importa da qui, non ha più una propria copia.
import type { WalkNetwork, GraphEdge } from './osmGraph'

export interface DijkstraResult {
  dist: Map<number, number>
  prev: Map<number, number>
  viaHighway: Map<number, string | undefined>
  visited: Set<number>
}

/** Plain Dijkstra, no priority-queue library — graphs here are a single area's OSM network (at
 *  most a few thousand nodes before maxDistM/maxNodes prune it), and this runs on-demand (once
 *  per user tap, or once per leg of an itinerary), not per fix, so an O(n²) min-scan is a
 *  non-issue in practice.
 *  `isEdgeAllowed`, opzionale: esclude un arco dall'esplorazione invece di limitarsi a pesarlo —
 *  usato da lib/routeBuilder/multiStopRoute.ts sia per "trekking urbano" (esclude path/track/
 *  footway/bridleway/steps, cammina solo su strade) sia per escludere gli archi già percorsi in un
 *  tentativo precedente quando cerca un cammino più vicino a un target di lunghezza (invece del
 *  più breve) — per questo riceve anche il nodo di partenza dell'arco: `edge.to` da solo non basta
 *  a identificare quale coppia di nodi è già stata esclusa. Omesso, ogni arco del WalkNetwork
 *  resta percorribile come prima di questo parametro — comportamento invariato per gli altri
 *  chiamanti (app/api/borgo-itinerary/route.ts, lib/navigation/escapeEngine.ts). */
export function dijkstra(
  network: WalkNetwork, startNodeId: number, maxDistM: number, maxNodes: number,
  isEdgeAllowed?: (edge: GraphEdge, fromNodeId: number) => boolean,
): DijkstraResult {
  const dist = new Map<number, number>([[startNodeId, 0]])
  const prev = new Map<number, number>()
  const viaHighway = new Map<number, string | undefined>()
  const visited = new Set<number>()

  while (visited.size < maxNodes) {
    let currentId: number | null = null
    let currentDist = Infinity
    for (const [id, d] of Array.from(dist)) {
      if (!visited.has(id) && d < currentDist) { currentDist = d; currentId = id }
    }
    if (currentId == null || currentDist > maxDistM) break
    visited.add(currentId)

    const node = network.nodes.get(currentId)
    if (!node) continue
    for (const edge of node.edges) {
      if (isEdgeAllowed && !isEdgeAllowed(edge, currentId)) continue
      const nd = currentDist + edge.distM
      if (nd > maxDistM) continue
      const existing = dist.get(edge.to)
      if (existing == null || nd < existing) {
        dist.set(edge.to, nd)
        prev.set(edge.to, currentId)
        viaHighway.set(edge.to, edge.highway)
      }
    }
  }

  return { dist, prev, viaHighway, visited }
}

/** Nodo per nodo, dal nodo di partenza al bersaglio, seguendo la catena `prev` di un DijkstraResult
 *  già calcolato — vuoto se `targetNodeId` non è mai stato raggiunto (non presente in `prev` e
 *  diverso da `startNodeId`). */
export function reconstructPath(network: WalkNetwork, prev: Map<number, number>, targetNodeId: number, startNodeId: number): [number, number][] {
  const path: [number, number][] = []
  let cur: number | undefined = targetNodeId
  while (cur != null) {
    const node = network.nodes.get(cur)
    if (node) path.unshift([node.lat, node.lon])
    if (cur === startNodeId) break
    cur = prev.get(cur)
  }
  return path
}

/** Come reconstructPath, ma la sequenza di ID nodo invece delle coordinate — serve a chi deve poi
 *  identificare gli ARCHI effettivamente percorsi (es. lib/routeBuilder/multiStopRoute.ts, per
 *  escluderli e forzare un percorso alternativo quando quello più breve è più corto del target
 *  richiesto), non solo disegnarli su mappa. */
export function reconstructNodePath(prev: Map<number, number>, targetNodeId: number, startNodeId: number): number[] {
  const path: number[] = []
  let cur: number | undefined = targetNodeId
  while (cur != null) {
    path.unshift(cur)
    if (cur === startNodeId) break
    cur = prev.get(cur)
  }
  return path
}
