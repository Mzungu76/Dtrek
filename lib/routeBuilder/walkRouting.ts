// Dijkstra + ricostruzione percorso su un WalkNetwork (lib/routeBuilder/osmGraph.ts) — estratto da
// lib/navigation/escapeEngine.ts (che lo usava solo per sé, come funzioni locali non esportate)
// perché ora serve un secondo chiamante: l'itinerario a piedi fra le tappe di un Borgo/Città
// (lib/metaSearch/borgoItinerary.ts). Stessa identica logica, un solo posto invece di due copie
// — escapeEngine.ts importa da qui, non ha più una propria copia.
import type { WalkNetwork } from './osmGraph'

export interface DijkstraResult {
  dist: Map<number, number>
  prev: Map<number, number>
  viaHighway: Map<number, string | undefined>
  visited: Set<number>
}

/** Plain Dijkstra, no priority-queue library — graphs here are a single area's OSM network (at
 *  most a few thousand nodes before maxDistM/maxNodes prune it), and this runs on-demand (once
 *  per user tap, or once per leg of an itinerary), not per fix, so an O(n²) min-scan is a
 *  non-issue in practice. */
export function dijkstra(network: WalkNetwork, startNodeId: number, maxDistM: number, maxNodes: number): DijkstraResult {
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
