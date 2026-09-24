import { describe, it, expect } from 'vitest'
import { dijkstra, reconstructPath, aStarToTarget } from '../walkRouting'
import type { WalkNetwork, GraphNode } from '../osmGraph'

// Grafo sintetico minimo — nessuna rete, solo per verificare la logica di dijkstra/
// reconstructPath in isolamento (lo stesso motivo per cui questo file esiste come modulo
// condiviso: lib/navigation/escapeEngine.ts non può essere testato per il pathfinding senza un
// vero WalkNetwork OSM scaricato, che richiede rete).
function buildNetwork(nodes: Record<number, { lat: number; lon: number }>, edges: [number, number, number][]): WalkNetwork {
  const map = new Map<number, GraphNode>()
  for (const [id, pos] of Object.entries(nodes)) {
    map.set(Number(id), { lat: pos.lat, lon: pos.lon, edges: [] })
  }
  // Ogni edge è bidirezionale — stesso presupposto di una via pedonale reale (osmGraph.ts).
  for (const [a, b, distM] of edges) {
    map.get(a)!.edges.push({ to: b, distM, wayId: a * 1000 + b })
    map.get(b)!.edges.push({ to: a, distM, wayId: a * 1000 + b })
  }
  return { nodes: map }
}

describe('dijkstra', () => {
  it('preferisce il cammino più breve attraverso nodi intermedi a un collegamento diretto più lungo', () => {
    // 1-2-3-4 in linea (100m ciascuno, totale 300m) + un collegamento diretto 1-4 da 350m (più
    // lungo) — il percorso più breve verso 4 deve passare per 2 e 3, non per il collegamento diretto.
    const network = buildNetwork(
      { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.001 }, 3: { lat: 0, lon: 0.002 }, 4: { lat: 0, lon: 0.003 } },
      [[1, 2, 100], [2, 3, 100], [3, 4, 100], [1, 4, 350]],
    )
    const { dist, prev } = dijkstra(network, 1, 1000, 100)
    expect(dist.get(4)).toBe(300)
    expect(prev.get(4)).toBe(3)
    expect(prev.get(3)).toBe(2)
    expect(prev.get(2)).toBe(1)
  })

  it('preferisce un collegamento diretto più corto a un cammino più lungo attraverso nodi intermedi', () => {
    const network = buildNetwork(
      { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.001 }, 3: { lat: 0, lon: 0.002 }, 4: { lat: 0, lon: 0.003 } },
      [[1, 2, 100], [2, 3, 100], [3, 4, 100], [1, 4, 250]],
    )
    const { dist, prev } = dijkstra(network, 1, 1000, 100)
    expect(dist.get(4)).toBe(250)
    expect(prev.get(4)).toBe(1)
  })

  it('non raggiunge un nodo oltre maxDistM', () => {
    const network = buildNetwork(
      { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.01 } },
      [[1, 2, 500]],
    )
    const { dist, visited } = dijkstra(network, 1, 300, 100)
    expect(dist.has(2)).toBe(false)
    expect(visited.has(2)).toBe(false)
  })

  it('un nodo isolato (nessun edge) resta raggiungibile solo da sé stesso', () => {
    const network = buildNetwork({ 1: { lat: 0, lon: 0 }, 2: { lat: 1, lon: 1 } }, [])
    const { dist } = dijkstra(network, 1, 10_000, 100)
    expect(dist.get(1)).toBe(0)
    expect(dist.has(2)).toBe(false)
  })
})

describe('aStarToTarget', () => {
  it('trova la stessa distanza ottima di dijkstra quando il cammino più breve passa per nodi intermedi', () => {
    const network = buildNetwork(
      { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.001 }, 3: { lat: 0, lon: 0.002 }, 4: { lat: 0, lon: 0.003 } },
      [[1, 2, 100], [2, 3, 100], [3, 4, 100], [1, 4, 350]],
    )
    const { distM, prev } = aStarToTarget(network, 1, 4, 1000, 100)
    expect(distM).toBe(300)
    expect(prev.get(4)).toBe(3)
    expect(prev.get(3)).toBe(2)
  })

  it('preferisce un collegamento diretto più corto a un cammino più lungo attraverso nodi intermedi', () => {
    const network = buildNetwork(
      { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.001 }, 3: { lat: 0, lon: 0.002 }, 4: { lat: 0, lon: 0.003 } },
      [[1, 2, 100], [2, 3, 100], [3, 4, 100], [1, 4, 250]],
    )
    const { distM, prev } = aStarToTarget(network, 1, 4, 1000, 100)
    expect(distM).toBe(250)
    expect(prev.get(4)).toBe(1)
  })

  it('non raggiunge un bersaglio oltre maxDistM', () => {
    const network = buildNetwork({ 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.01 } }, [[1, 2, 500]])
    const { distM, visited } = aStarToTarget(network, 1, 2, 300, 100)
    expect(distM).toBeUndefined()
    expect(visited.has(2)).toBe(false)
  })

  it('un bersaglio coincidente con la partenza ha distanza 0 senza esplorare altri nodi', () => {
    const network = buildNetwork({ 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.01 } }, [[1, 2, 500]])
    const { distM, visited } = aStarToTarget(network, 1, 1, 1000, 100)
    expect(distM).toBe(0)
    expect(visited.size).toBe(1)
  })

  // Verifica utente (Chieti, place id eb07bfac-e861-484c-bb4c-acca63838e3f) — la causa reale del bug
  // (vedi il commento su aStarToTarget in lib/routeBuilder/walkRouting.ts): Dijkstra puro deve
  // esaurire un intero "anello" di nodi alla STESSA distanza prima di proseguire oltre, quale che
  // sia la direzione del bersaglio — qui 20 diramazioni isolate dal nodo di partenza, tutte alla
  // stessa distanza (10) del primo passo verso il bersaglio reale ma nella direzione OPPOSTA,
  // esauriscono da sole un budget di pochi nodi anche se il bersaglio è a soli 3 passi. A* pesa
  // ogni nodo anche per la distanza in linea d'aria dal bersaglio: le diramazioni (che se ne
  // allontanano) restano sempre più indietro nello heap del passo che avvicina, quindi non vengono
  // mai visitate quando il bersaglio si trova comunque prima nello heap.
  it('converge verso il bersaglio senza esaurire il budget su diramazioni nella direzione sbagliata', () => {
    const nodes: Record<number, { lat: number; lon: number }> = {
      1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 0.0001 }, 3: { lat: 0, lon: 0.0002 }, 4: { lat: 0, lon: 0.0003 },
    }
    const edges: [number, number, number][] = [[1, 2, 10], [2, 3, 10], [3, 4, 10]]
    for (let i = 0; i < 20; i++) {
      const branchId = 100 + i
      nodes[branchId] = { lat: 0, lon: -0.0001 * (i + 1) }
      edges.push([1, branchId, 10])
    }
    const network = buildNetwork(nodes, edges)

    const { distM, visited } = aStarToTarget(network, 1, 4, 1000, 6)
    expect(distM).toBe(30)
    expect(visited.size).toBeLessThanOrEqual(6)

    // Stesso identico grafo e budget: dijkstra puro deve visitare tutte e 21 le diramazioni/nodo
    // intermedio alla distanza 10 prima di poter proseguire fino al bersaglio a distanza 30 — un
    // budget di 6 non basta.
    const { dist: dijkstraDist } = dijkstra(network, 1, 1000, 6)
    expect(dijkstraDist.has(4)).toBe(false)
  })
})

describe('reconstructPath', () => {
  it('ricostruisce le coordinate in ordine dal nodo di partenza al bersaglio', () => {
    const network = buildNetwork(
      { 1: { lat: 10, lon: 20 }, 2: { lat: 11, lon: 21 }, 3: { lat: 12, lon: 22 } },
      [[1, 2, 100], [2, 3, 100]],
    )
    const { prev } = dijkstra(network, 1, 1000, 100)
    const path = reconstructPath(network, prev, 3, 1)
    expect(path).toEqual([[10, 20], [11, 21], [12, 22]])
  })

  it('un percorso di un solo nodo (partenza = bersaglio) restituisce quel solo punto', () => {
    const network = buildNetwork({ 1: { lat: 5, lon: 5 } }, [])
    const { prev } = dijkstra(network, 1, 1000, 100)
    expect(reconstructPath(network, prev, 1, 1)).toEqual([[5, 5]])
  })
})
