// Pathfinding sul grafo costruito da lib/routeBuilder/osmGraph.ts: dato un punto di partenza e
// una lunghezza target, genera candidati "andata e ritorno" o "anello" camminando sugli archi
// reali della rete (sentieri, tracciati, strade bianche) invece di limitarsi a cercare un percorso
// già segnato per nome.
import { haversineM } from '@/lib/geoUtils'
import { nearestGraphNode, type WalkNetwork } from './osmGraph'

const EARTH_RADIUS_M = 6371000
// Direzioni provate per generare i candidati "lontani" da cui costruire andata/ritorno o anello —
// 8 punti cardinali/intercardinali danno varietà di forma senza esplodere il numero di Dijkstra da
// calcolare (ognuno costa una visita completa del grafo del bbox).
const CANDIDATE_BEARINGS_DEG = [0, 45, 90, 135, 180, 225, 270, 315]
// Tolleranza sulla lunghezza target: un candidato la cui lunghezza reale si discosta oltre questa
// percentuale dal target richiesto viene scartato — meglio pochi candidati affidabili che uno
// fuori misura pur di riempire la lista.
const LENGTH_TOLERANCE = 0.25
// Moltiplicatore di penalità sugli archi già usati nell'andata quando si cerca il ritorno di un
// anello: abbastanza alto da farli evitare se esiste un'alternativa reale, non così alto da
// rendere il grafo instabile se quella è l'unica via percorribile (rete rada).
const REUSED_EDGE_PENALTY = 6
// Due candidati che condividono più di questa frazione di nodi sono considerati "lo stesso
// percorso" — si tiene solo il migliore dei due invece di proporli entrambi.
const DEDUPE_NODE_OVERLAP = 0.6

export type RouteType = 'anello' | 'andata_ritorno'

export interface RouteCandidate {
  type: RouteType
  polyline: [number, number][]
  distanceM: number
  bearingDeg: number
}

function destinationPoint(lat: number, lon: number, bearingDeg: number, distM: number): { lat: number; lon: number } {
  const δ = distM / EARTH_RADIUS_M
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: (φ2 * 180) / Math.PI, lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180 }
}

// Min-heap minimale per Dijkstra — il grafo di un bbox di ricerca (decine di migliaia di nodi al
// più) non giustifica una libreria esterna, ma una scansione lineare della frontiera sarebbe
// O(V²): con questo si resta O(E log V).
class MinHeap {
  private items: { key: number; nodeId: number }[] = []

  push(key: number, nodeId: number) {
    this.items.push({ key, nodeId })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].key <= this.items[i].key) break
      ;[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]]
      i = parent
    }
  }

  pop(): { key: number; nodeId: number } | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = i * 2 + 2
        let smallest = i
        if (l < this.items.length && this.items[l].key < this.items[smallest].key) smallest = l
        if (r < this.items.length && this.items[r].key < this.items[smallest].key) smallest = r
        if (smallest === i) break
        ;[this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]]
        i = smallest
      }
    }
    return top
  }

  get size() { return this.items.length }
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

/**
 * Dijkstra tra due nodi del grafo. `penalizedEdges`, se presente, moltiplica il costo (non la
 * distanza reale riportata) degli archi già usati in un altro tratto — usato per il tratto di
 * ritorno di un anello, per preferire un percorso diverso dall'andata senza escluderlo del tutto
 * se è l'unica via.
 */
function dijkstra(
  network: WalkNetwork,
  startId: number,
  endId: number,
  penalizedEdges?: Set<string>,
): number[] | null {
  if (startId === endId) return [startId]
  const dist = new Map<number, number>([[startId, 0]])
  const prev = new Map<number, number>()
  const visited = new Set<number>()
  const heap = new MinHeap()
  heap.push(0, startId)

  while (heap.size > 0) {
    const cur = heap.pop()!
    if (visited.has(cur.nodeId)) continue
    visited.add(cur.nodeId)
    if (cur.nodeId === endId) break

    const node = network.nodes.get(cur.nodeId)
    if (!node) continue
    for (const edge of node.edges) {
      if (visited.has(edge.to)) continue
      const penalty = penalizedEdges?.has(edgeKey(cur.nodeId, edge.to)) ? REUSED_EDGE_PENALTY : 1
      const cost = (dist.get(cur.nodeId) ?? Infinity) + edge.distM * penalty
      if (cost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, cost)
        prev.set(edge.to, cur.nodeId)
        heap.push(cost, edge.to)
      }
    }
  }

  if (!dist.has(endId)) return null
  const path: number[] = [endId]
  let at = endId
  while (at !== startId) {
    const p = prev.get(at)
    if (p == null) return null
    path.push(p)
    at = p
  }
  return path.reverse()
}

function pathDistanceM(network: WalkNetwork, path: number[]): number {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = network.nodes.get(path[i])
    const b = network.nodes.get(path[i + 1])
    if (!a || !b) continue
    total += haversineM(a.lat, a.lon, b.lat, b.lon)
  }
  return total
}

function pathToPolyline(network: WalkNetwork, path: number[]): [number, number][] {
  return path
    .map(id => network.nodes.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map(n => [n.lat, n.lon] as [number, number])
}

function nodeSetOverlap(a: Set<number>, b: Set<number>): number {
  let shared = 0
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  for (const id of Array.from(small)) if (big.has(id)) shared++
  return shared / small.size
}

function dedupeCandidates(candidates: RouteCandidate[], farNodeByBearing: Map<number, Set<number>>): RouteCandidate[] {
  const kept: RouteCandidate[] = []
  const keptNodeSets: Set<number>[] = []
  const sorted = [...candidates]
  for (const c of sorted) {
    const nodes = farNodeByBearing.get(c.bearingDeg)
    if (!nodes) { kept.push(c); keptNodeSets.push(new Set()); continue }
    const isDuplicate = keptNodeSets.some(existing => nodeSetOverlap(existing, nodes) > DEDUPE_NODE_OVERLAP)
    if (!isDuplicate) { kept.push(c); keptNodeSets.push(nodes) }
  }
  return kept
}

function withinTolerance(distanceM: number, targetDistanceM: number): boolean {
  return Math.abs(distanceM - targetDistanceM) / targetDistanceM <= LENGTH_TOLERANCE
}

/** Genera candidati andata-e-ritorno: un ramo verso un punto a ~metà della lunghezza target, poi lo stesso ramo invertito. */
export function generateOutAndBackCandidates(
  network: WalkNetwork,
  startNodeId: number,
  targetDistanceM: number,
  maxCandidates = 4,
): RouteCandidate[] {
  const start = network.nodes.get(startNodeId)
  if (!start) return []

  const candidates: RouteCandidate[] = []
  const farNodeSets = new Map<number, Set<number>>()

  for (const bearingDeg of CANDIDATE_BEARINGS_DEG) {
    const far = destinationPoint(start.lat, start.lon, bearingDeg, targetDistanceM / 2)
    const farNode = nearestGraphNode(network, far.lat, far.lon, targetDistanceM / 2)
    if (!farNode) continue

    const outPath = dijkstra(network, startNodeId, farNode.nodeId)
    if (!outPath) continue

    const distanceM = pathDistanceM(network, outPath) * 2
    if (!withinTolerance(distanceM, targetDistanceM)) continue

    const backPath = [...outPath].reverse().slice(1)
    const polyline = pathToPolyline(network, [...outPath, ...backPath])
    candidates.push({ type: 'andata_ritorno', polyline, distanceM, bearingDeg })
    farNodeSets.set(bearingDeg, new Set(outPath))
  }

  candidates.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM))
  return dedupeCandidates(candidates, farNodeSets).slice(0, maxCandidates)
}

/** Genera candidati ad anello: verso un punto a ~metà della lunghezza target, ritorno per una via diversa quando possibile. */
export function generateLoopCandidates(
  network: WalkNetwork,
  startNodeId: number,
  targetDistanceM: number,
  maxCandidates = 4,
): RouteCandidate[] {
  const start = network.nodes.get(startNodeId)
  if (!start) return []

  const candidates: RouteCandidate[] = []
  const nodeSets = new Map<number, Set<number>>()

  for (const bearingDeg of CANDIDATE_BEARINGS_DEG) {
    const far = destinationPoint(start.lat, start.lon, bearingDeg, targetDistanceM / 2)
    const farNode = nearestGraphNode(network, far.lat, far.lon, targetDistanceM / 2)
    if (!farNode) continue

    const outPath = dijkstra(network, startNodeId, farNode.nodeId)
    if (!outPath) continue

    const usedEdges = new Set<string>()
    for (let i = 0; i < outPath.length - 1; i++) usedEdges.add(edgeKey(outPath[i], outPath[i + 1]))

    const backPath = dijkstra(network, farNode.nodeId, startNodeId, usedEdges)
    if (!backPath) continue

    const fullPath = [...outPath, ...backPath.slice(1)]
    const distanceM = pathDistanceM(network, fullPath)
    if (!withinTolerance(distanceM, targetDistanceM)) continue

    const polyline = pathToPolyline(network, fullPath)
    candidates.push({ type: 'anello', polyline, distanceM, bearingDeg })
    nodeSets.set(bearingDeg, new Set(fullPath))
  }

  candidates.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM))
  return dedupeCandidates(candidates, nodeSets).slice(0, maxCandidates)
}
