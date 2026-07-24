// Pathfinding sul grafo costruito da lib/routeBuilder/osmGraph.ts: dato un punto di partenza e
// una lunghezza target, genera candidati "andata e ritorno" o "anello" camminando sugli archi
// reali della rete (sentieri, tracciati, strade bianche) invece di limitarsi a cercare un percorso
// già segnato per nome.
//
// Approccio (dopo un primo tentativo scartato — vedi git log): NON si piazza un punto geometrico
// "a metà lunghezza in una data direzione" e si spera di trovare un nodo di rete vicino — i
// sentieri reali seguono valli/creste, non si irradiano come raggi dal punto di partenza, quindi
// quel punto geometrico spesso non ha nessun nodo di rete nelle vicinanze anche quando esiste un
// percorso perfettamente valido nella zona (verificato con un grafo sintetico a zigzag). Si
// calcola invece un solo Dijkstra dal punto di partenza verso TUTTA la rete raggiungibile, e si
// scelgono come candidati i nodi la cui distanza REALE (non in linea d'aria) è già vicina al
// target — la geometria (bearing) serve solo a scegliere candidati in direzioni diverse tra loro,
// mai a decidere se un nodo è raggiungibile.
import { haversineM } from '@/lib/geoUtils'
import { nearestGraphNode, type WalkNetwork } from './osmGraph'

// Tolleranza sulla lunghezza target: un candidato la cui lunghezza reale si discosta oltre questa
// percentuale dal target richiesto viene scartato — meglio pochi candidati affidabili che uno
// fuori misura pur di riempire la lista. Alzata da 0.3 a 0.4 e poi a 0.45: l'utente ha imposto un
// minimo di 10 percorsi per ricerca (built+trovati insieme), quindi ammettere qualche candidato in
// più leggermente più lontano dal target è preferibile a restarne sotto.
const LENGTH_TOLERANCE = 0.45
// Moltiplicatore di penalità sugli archi già usati nell'andata quando si cerca il ritorno di un
// anello: abbastanza alto da farli evitare se esiste un'alternativa reale, non così alto da
// rendere il grafo instabile se quella è l'unica via percorribile (rete rada).
const REUSED_EDGE_PENALTY = 6
// Numero di settori direzionali (da bearing rispetto al punto di partenza) usati solo per
// scegliere candidati in direzioni diverse tra loro — non per la ricerca del percorso in sé, che
// lavora sempre su nodi già raggiungibili nel grafo. Alzato da 6 a 10 e poi a 16: più direzioni
// tentate, più candidati grezzi tra cui il punteggio finale sceglie — necessario per arrivare in
// modo affidabile al minimo di 10 risultati per ricerca imposto dall'utente.
const NUM_DIRECTION_BUCKETS = 16
// Due candidati che condividono più di questa frazione di nodi sono considerati "lo stesso
// percorso" — si tiene solo il migliore dei due invece di proporli entrambi.
const DEDUPE_NODE_OVERLAP = 0.6

export type RouteType = 'anello' | 'andata_ritorno' | 'solo_andata'

// Etichetta breve — usata dal wizard (components/upload/RouteBuilder.tsx, sia nel titolo di
// default alla scelta di un candidato "costruito" sia nella tile "Tipo"), da
// components/RouteResultCard.tsx e da app/percorsi-per-te/page.tsx (titolo di default all'azione
// "Apri"). Colocata col tipo che etichetta invece che duplicata in ciascun chiamante.
export function routeTypeLabel(t: RouteType): string {
  if (t === 'anello') return 'Anello'
  if (t === 'solo_andata') return 'Solo andata'
  return 'Andata e ritorno'
}

export interface RouteCandidate {
  type: RouteType
  polyline: [number, number][]
  distanceM: number
  bearingDeg: number
}

function bearingFromStart(start: { lat: number; lon: number }, node: { lat: number; lon: number }): number {
  const dLon = (node.lon - start.lon) * Math.PI / 180
  const lat1 = start.lat * Math.PI / 180
  const lat2 = node.lat * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
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

interface DijkstraResult {
  dist: Map<number, number>
  prev: Map<number, number>
}

/**
 * Dijkstra a sorgente singola verso TUTTA la rete raggiungibile (non si ferma a un nodo target) —
 * usato sia per mappare le distanze reali da cui scegliere i candidati, sia per il tratto di
 * ritorno di un anello. `penalizedEdges`, se presente, moltiplica il costo (non la distanza reale)
 * degli archi già usati in un altro tratto, per preferire un percorso diverso senza escluderlo del
 * tutto se è l'unica via.
 */
function dijkstraAll(network: WalkNetwork, startId: number, penalizedEdges?: Set<string>): DijkstraResult {
  const dist = new Map<number, number>([[startId, 0]])
  const prev = new Map<number, number>()
  const visited = new Set<number>()
  const heap = new MinHeap()
  heap.push(0, startId)

  while (heap.size > 0) {
    const cur = heap.pop()!
    if (visited.has(cur.nodeId)) continue
    visited.add(cur.nodeId)

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

  return { dist, prev }
}

function reconstructPath(prev: Map<number, number>, startId: number, endId: number): number[] | null {
  if (startId === endId) return [startId]
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

function dedupeCandidates(candidates: (RouteCandidate & { nodeSet: Set<number> })[]): RouteCandidate[] {
  const kept: (RouteCandidate & { nodeSet: Set<number> })[] = []
  for (const c of candidates) {
    const isDuplicate = kept.some(existing => nodeSetOverlap(existing.nodeSet, c.nodeSet) > DEDUPE_NODE_OVERLAP)
    if (!isDuplicate) kept.push(c)
  }
  return kept.map(({ nodeSet: _nodeSet, ...rest }) => rest)
}

function withinTolerance(distanceM: number, targetDistanceM: number): boolean {
  return Math.abs(distanceM - targetDistanceM) / targetDistanceM <= LENGTH_TOLERANCE
}

// Diagnostica: quando "candidati grezzi: 0" arriva insieme a una rete di dimensioni normali (vedi
// log applicativo in app/api/route-build/route.ts), la causa più probabile è che il nodo di
// partenza sia agganciato a un frammento di rete piccolo/isolato rispetto al totale scaricato —
// questi due numeri lo confermano o lo escludono senza dover indovinare.
function logReachDiagnostics(dist: Map<number, number>, totalNodes: number, targetOneWayM: number) {
  // Somma/riduzione manuale invece di Math.max(...values) — con reti di decine di migliaia di
  // nodi lo spread come argomenti di funzione rischia il limite dell'engine sugli argomenti.
  let maxReachM = 0
  for (const d of Array.from(dist.values())) if (d > maxReachM) maxReachM = d
  console.log(`[route-build] nodi raggiungibili dal punto di partenza: ${dist.size}/${totalNodes}, distanza massima raggiunta: ${Math.round(maxReachM)}m (target un ramo: ${Math.round(targetOneWayM)}m)`)
}

/**
 * Sceglie, tra i nodi la cui distanza reale da start rientra nella tolleranza attorno a
 * `targetOneWayM`, il migliore per ciascun settore direzionale — così i candidati risultano in
 * direzioni diverse tra loro invece di ammassarsi tutti sullo stesso sentiero principale.
 */
function pickCandidateNodesByDirection(
  network: WalkNetwork,
  start: { lat: number; lon: number },
  dist: Map<number, number>,
  targetOneWayM: number,
  maxCandidates: number,
): { nodeId: number; distanceM: number }[] {
  const inTolerance = Array.from(dist)
    .filter(([, d]) => withinTolerance(d, targetOneWayM))

  const bestPerBucket = new Map<number, { nodeId: number; distanceM: number }>()
  for (const [nodeId, distanceM] of inTolerance) {
    const node = network.nodes.get(nodeId)
    if (!node) continue
    const bucket = Math.floor(bearingFromStart(start, node) / (360 / NUM_DIRECTION_BUCKETS))
    const current = bestPerBucket.get(bucket)
    if (!current || Math.abs(distanceM - targetOneWayM) < Math.abs(current.distanceM - targetOneWayM)) {
      bestPerBucket.set(bucket, { nodeId, distanceM })
    }
  }

  return Array.from(bestPerBucket.values())
    .sort((a, b) => Math.abs(a.distanceM - targetOneWayM) - Math.abs(b.distanceM - targetOneWayM))
    .slice(0, maxCandidates)
}

/** Genera candidati andata-e-ritorno: verso un nodo la cui distanza reale è vicina a metà della lunghezza target, poi lo stesso ramo invertito. */
export function generateOutAndBackCandidates(
  network: WalkNetwork,
  startNodeId: number,
  targetDistanceM: number,
  maxCandidates = 14,
): RouteCandidate[] {
  const start = network.nodes.get(startNodeId)
  if (!start) return []

  const { dist, prev } = dijkstraAll(network, startNodeId)
  logReachDiagnostics(dist, network.nodes.size, targetDistanceM / 2)
  const picked = pickCandidateNodesByDirection(network, start, dist, targetDistanceM / 2, maxCandidates)

  const candidates: (RouteCandidate & { nodeSet: Set<number> })[] = []
  for (const { nodeId, distanceM: oneWayM } of picked) {
    const outPath = reconstructPath(prev, startNodeId, nodeId)
    if (!outPath) continue
    const backPath = [...outPath].reverse().slice(1)
    const polyline = pathToPolyline(network, [...outPath, ...backPath])
    const bearingDeg = bearingFromStart(start, network.nodes.get(nodeId)!)
    candidates.push({ type: 'andata_ritorno', polyline, distanceM: oneWayM * 2, bearingDeg, nodeSet: new Set(outPath) })
  }

  candidates.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM))
  return dedupeCandidates(candidates)
}

/** Genera candidati "solo andata" (punto A → punto B, nessun ritorno): stesso schema di
 *  generateOutAndBackCandidates ma senza raddoppiare il tratto — targetDistanceM qui è già la
 *  distanza di un solo ramo, non va dimezzata come per l'andata-e-ritorno. */
export function generateOneWayCandidates(
  network: WalkNetwork,
  startNodeId: number,
  targetDistanceM: number,
  maxCandidates = 14,
): RouteCandidate[] {
  const start = network.nodes.get(startNodeId)
  if (!start) return []

  const { dist, prev } = dijkstraAll(network, startNodeId)
  logReachDiagnostics(dist, network.nodes.size, targetDistanceM)
  const picked = pickCandidateNodesByDirection(network, start, dist, targetDistanceM, maxCandidates)

  const candidates: (RouteCandidate & { nodeSet: Set<number> })[] = []
  for (const { nodeId, distanceM } of picked) {
    const outPath = reconstructPath(prev, startNodeId, nodeId)
    if (!outPath) continue
    const polyline = pathToPolyline(network, outPath)
    const bearingDeg = bearingFromStart(start, network.nodes.get(nodeId)!)
    candidates.push({ type: 'solo_andata', polyline, distanceM, bearingDeg, nodeSet: new Set(outPath) })
  }

  candidates.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM))
  return dedupeCandidates(candidates)
}

/** Genera candidati ad anello: verso un nodo la cui distanza reale è vicina a metà della lunghezza target, ritorno per una via diversa quando possibile. */
export function generateLoopCandidates(
  network: WalkNetwork,
  startNodeId: number,
  targetDistanceM: number,
  maxCandidates = 14,
): RouteCandidate[] {
  const start = network.nodes.get(startNodeId)
  if (!start) return []

  const { dist, prev } = dijkstraAll(network, startNodeId)
  logReachDiagnostics(dist, network.nodes.size, targetDistanceM / 2)
  // Più candidati grezzi del necessario: per un anello il tratto di ritorno (via diversa) può
  // allungare il totale oltre tolleranza anche quando l'andata era ben piazzata, quindi conviene
  // provarne qualcuno in più prima di scartare.
  const picked = pickCandidateNodesByDirection(network, start, dist, targetDistanceM / 2, maxCandidates * 2)

  const candidates: (RouteCandidate & { nodeSet: Set<number> })[] = []
  for (const { nodeId: farNodeId } of picked) {
    const outPath = reconstructPath(prev, startNodeId, farNodeId)
    if (!outPath) continue

    const usedEdges = new Set<string>()
    for (let i = 0; i < outPath.length - 1; i++) usedEdges.add(edgeKey(outPath[i], outPath[i + 1]))

    const { prev: backPrev } = dijkstraAll(network, farNodeId, usedEdges)
    const backPath = reconstructPath(backPrev, farNodeId, startNodeId)
    if (!backPath) continue

    const fullPath = [...outPath, ...backPath.slice(1)]
    const distanceM = pathDistanceM(network, fullPath)
    if (!withinTolerance(distanceM, targetDistanceM)) continue

    const polyline = pathToPolyline(network, fullPath)
    const bearingDeg = bearingFromStart(start, network.nodes.get(farNodeId)!)
    candidates.push({ type: 'anello', polyline, distanceM, bearingDeg, nodeSet: new Set(fullPath) })
  }

  candidates.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM))
  return dedupeCandidates(candidates).slice(0, maxCandidates)
}

// Un luogo noto scelto dall'utente (vedi lib/routeBuilder/resolvePlace.ts) è un punto esatto, non
// una stima geometrica come i "punti lontani" usati sopra — può quindi ammettere una soglia di
// aggancio più larga di FAR_NODE_SNAP_THRESHOLD_M (qui non serve, il chiamante la passa esplicita).
const DESTINATION_SNAP_THRESHOLD_M = 1500

/**
 * Genera un singolo candidato verso una destinazione ESATTA (un luogo noto risolto per nome, non
 * un target di lunghezza) — nessun filtro di tolleranza sulla lunghezza, qui la distanza è un
 * risultato del percorso reale verso quel punto, non un vincolo da rispettare. Ritorna null se la
 * destinazione non è abbastanza vicina alla rete percorribile, o se non è raggiungibile dal punto
 * di partenza nello stesso bbox. `oneWay` sceglie andata-e-ritorno (default, raddoppia il tratto)
 * o solo andata (un unico ramo, per il RouteType 'solo_andata').
 */
export function generateOutAndBackToPoint(
  network: WalkNetwork,
  startNodeId: number,
  destLat: number,
  destLon: number,
  snapThresholdM = DESTINATION_SNAP_THRESHOLD_M,
  oneWay = false,
): RouteCandidate | null {
  const start = network.nodes.get(startNodeId)
  if (!start) return null

  const destNode = nearestGraphNode(network, destLat, destLon, snapThresholdM)
  if (!destNode) return null

  const { prev } = dijkstraAll(network, startNodeId)
  const outPath = reconstructPath(prev, startNodeId, destNode.nodeId)
  if (!outPath) return null

  const bearingDeg = bearingFromStart(start, network.nodes.get(destNode.nodeId)!)
  if (oneWay) {
    return { type: 'solo_andata', polyline: pathToPolyline(network, outPath), distanceM: pathDistanceM(network, outPath), bearingDeg }
  }

  const backPath = [...outPath].reverse().slice(1)
  const polyline = pathToPolyline(network, [...outPath, ...backPath])
  const distanceM = pathDistanceM(network, outPath) * 2

  return { type: 'andata_ritorno', polyline, distanceM, bearingDeg }
}
