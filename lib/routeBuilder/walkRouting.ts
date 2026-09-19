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

// Min-heap binario indicizzato per chiave numerica (qui: distanza percorsa) — sostituisce un
// min-scan O(n²) che andava benissimo finché maxNodes restava "poche migliaia" (il caso storico:
// un solo Borgo, tappe entro 2.5km). lib/routeBuilder/multiStopRoute.ts ha bisogno di esplorare
// reti ben più estese (tappe scelte liberamente dall'utente, anche paesi diversi collegati da
// strade di valle) — con un min-scan, un budget di nodi abbastanza alto da coprirle costava
// secondi per singola tratta (più tratte, più tentativi di ricerca del target = inaccettabile), E
// peggio: Dijkstra esplora i nodi più vicini per primi, quindi un budget insufficiente esauriva i
// nodi su una rete locale densa (vicoli, strade residenziali) PRIMA di raggiungere un sentiero
// lontano che esisteva davvero — un fallimento di ricerca, non di dati. Con un heap la stessa
// ricerca è O((V+E) log V): esplorare decine di migliaia di nodi resta rapido, quindi maxNodes può
// restare un tetto di sicurezza generoso invece del vero collo di bottiglia.
class MinHeap {
  private keys: number[] = []
  private vals: number[] = []

  get size(): number { return this.keys.length }

  push(key: number, val: number): void {
    this.keys.push(key)
    this.vals.push(val)
    let i = this.keys.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= this.keys[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): { key: number; val: number } | undefined {
    if (this.keys.length === 0) return undefined
    const topKey = this.keys[0]
    const topVal = this.vals[0]
    const lastKey = this.keys.pop()!
    const lastVal = this.vals.pop()!
    if (this.keys.length > 0) {
      this.keys[0] = lastKey
      this.vals[0] = lastVal
      let i = 0
      const n = this.keys.length
      for (;;) {
        const left = 2 * i + 1
        const right = 2 * i + 2
        let smallest = i
        if (left < n && this.keys[left] < this.keys[smallest]) smallest = left
        if (right < n && this.keys[right] < this.keys[smallest]) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return { key: topKey, val: topVal }
  }

  private swap(a: number, b: number): void {
    const tk = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = tk
    const tv = this.vals[a]; this.vals[a] = this.vals[b]; this.vals[b] = tv
  }
}

/**
 * Dijkstra su un WalkNetwork con coda a priorità — runs on-demand (una tantum per tocco utente, o
 * per tratta di un itinerario), mai per fix, ma su reti che possono avere decine di migliaia di
 * nodi (vedi commento su MinHeap sopra), quindi un algoritmo O((V+E) log V) invece di O(V²) qui
 * conta davvero.
 * `isEdgeAllowed`, opzionale: esclude un arco dall'esplorazione invece di limitarsi a pesarlo —
 * usato da lib/routeBuilder/multiStopRoute.ts sia per "trekking urbano" (esclude path/track/
 * footway/bridleway/steps, cammina solo su strade) sia per escludere gli archi già percorsi in un
 * tentativo precedente quando cerca un cammino più vicino a un target di lunghezza (invece del
 * più breve) — per questo riceve anche il nodo di partenza dell'arco: `edge.to` da solo non basta
 * a identificare quale coppia di nodi è già stata esclusa. Omesso, ogni arco del WalkNetwork
 * resta percorribile come prima di questo parametro — comportamento invariato per gli altri
 * chiamanti (app/api/borgo-itinerary/route.ts, lib/navigation/escapeEngine.ts).
 * `edgeCost`, opzionale: a differenza di `isEdgeAllowed` (sì/no), pesa un arco SENZA escluderlo —
 * usato da multiStopRoute.ts per preferire un tipo di via a un altro (es. una strada bianca a un
 * sentiero, un sentiero a una strada trafficata) restando comunque disposta a percorrerlo se è
 * l'unico modo di collegare due punti. Il valore restituito è un MOLTIPLICATORE su `edge.distM`
 * (1 = nessuna penalità), non una distanza reale — `dist` diventa quindi un costo pesato, non più
 * metri veri: chi chiama e ha bisogno della distanza reale del cammino trovato deve ricalcolarla
 * dalla geometria (reconstructPath), mai leggerla da `dist`. Omesso, tutti gli archi pesano 1 come
 * prima di questo parametro.
 */
export function dijkstra(
  network: WalkNetwork, startNodeId: number, maxDistM: number, maxNodes: number,
  isEdgeAllowed?: (edge: GraphEdge, fromNodeId: number) => boolean,
  edgeCost?: (edge: GraphEdge, fromNodeId: number) => number,
): DijkstraResult {
  const dist = new Map<number, number>([[startNodeId, 0]])
  const prev = new Map<number, number>()
  const viaHighway = new Map<number, string | undefined>()
  const visited = new Set<number>()

  const heap = new MinHeap()
  heap.push(0, startNodeId)

  while (visited.size < maxNodes) {
    const top = heap.pop()
    if (!top) break
    const currentId = top.val
    // Voce "stale": lo stesso nodo può finire nello heap più di una volta (una distanza migliore
    // trovata dopo averlo già inserito) — la prima estrazione (la più corta, per proprietà dello
    // heap) è quella valida, le successive vanno scartate senza rielaborarle.
    if (visited.has(currentId)) continue
    const currentDist = top.key
    if (currentDist > maxDistM) break // lo heap estrae in ordine crescente: da qui in poi tutto supera maxDistM
    visited.add(currentId)

    const node = network.nodes.get(currentId)
    if (!node) continue
    for (const edge of node.edges) {
      if (isEdgeAllowed && !isEdgeAllowed(edge, currentId)) continue
      const multiplier = edgeCost ? edgeCost(edge, currentId) : 1
      const nd = currentDist + edge.distM * multiplier
      if (nd > maxDistM) continue
      const existing = dist.get(edge.to)
      if (existing == null || nd < existing) {
        dist.set(edge.to, nd)
        prev.set(edge.to, currentId)
        viaHighway.set(edge.to, edge.highway)
        heap.push(nd, edge.to)
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
