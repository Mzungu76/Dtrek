import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildNetworkSegments, fetchWalkNetwork, type WalkNetwork, type GraphNode } from '@/lib/routeBuilder/osmGraph'

// Coordinate arbitrarie ma monotone (0.001° ≈ 111m), solo per dare a ogni nodo una posizione
// distinta — la logica testata qui è puramente topologica (grado dei nodi), non geometrica.
function node(lat: number, lon: number): GraphNode {
  return { lat, lon, edges: [] }
}

function addEdge(nodes: Map<number, GraphNode>, a: number, b: number, wayId: number, highway = 'path') {
  const from = nodes.get(a)!, to = nodes.get(b)!
  from.edges.push({ to: b, distM: 100, wayId, highway })
  to.edges.push({ to: a, distM: 100, wayId, highway })
}

describe('buildNetworkSegments', () => {
  it('una catena dritta a-b-c-d (nessun incrocio) resta un solo tratto dagli estremi', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.001, 0)], [3, node(0.002, 0)], [4, node(0.003, 0)],
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 2, 3, 100)
    addEdge(nodes, 3, 4, 100)
    const network: WalkNetwork = { nodes }

    const segments = buildNetworkSegments(network)
    // Estremi 1 e 4 hanno grado 1 (giunzioni) — un solo tratto fra loro, con i nodi intermedi
    // 2/3 contratti dentro la stessa polilinea invece di restare 3 tratti minuscoli separati.
    // I punti intermedi sono qui perfettamente collineari — la semplificazione Douglas-Peucker
    // (lib/geoUtils.ts's simplifyPolyline, applicata a valle della contrazione) li rimuove per
    // design, quindi si verifica solo che gli estremi reali sopravvivano, non il conteggio esatto.
    expect(segments).toHaveLength(1)
    expect(segments[0].points[0]).toEqual([0, 0])
    expect(segments[0].points[segments[0].points.length - 1]).toEqual([0.003, 0])
  })

  it('una giunzione a T spezza in tre tratti, uno per ogni braccio', () => {
    // Centro (5) a grado 3 — una vera intersezione. Tre bracci da 2 nodi ciascuno.
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.001, 0)], [5, node(0.002, 0)],
      [3, node(0.003, 0)], [4, node(0.004, 0)],
      [6, node(0.002, 0.001)], [7, node(0.002, 0.002)],
    ])
    addEdge(nodes, 1, 2, 10)
    addEdge(nodes, 2, 5, 10)
    addEdge(nodes, 5, 3, 20)
    addEdge(nodes, 3, 4, 20)
    addEdge(nodes, 5, 6, 30)
    addEdge(nodes, 6, 7, 30)
    const network: WalkNetwork = { nodes }

    const segments = buildNetworkSegments(network)
    expect(segments).toHaveLength(3)
    // Ogni tratto parte o arriva al nodo centrale (5) — nessun tratto attraversa l'incrocio.
    for (const seg of segments) {
      const touchesCenter = seg.points.some(([lat, lon]) => lat === 0.002 && lon === 0)
      expect(touchesCenter).toBe(true)
    }
  })

  it('un ciclo isolato senza nessuna vera intersezione resta comunque un tratto selezionabile', () => {
    // Anello chiuso a-b-c-a, ogni nodo a grado 2 — nessun nodo farebbe mai da punto di partenza
    // nel primo giro (solo intersezioni reali): il secondo giro deve comunque emetterlo.
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.001, 0)], [3, node(0.0005, 0.001)],
    ])
    addEdge(nodes, 1, 2, 50)
    addEdge(nodes, 2, 3, 50)
    addEdge(nodes, 3, 1, 50)
    const network: WalkNetwork = { nodes }

    const segments = buildNetworkSegments(network)
    expect(segments).toHaveLength(1)
    // Il ciclo si chiude: il primo e l'ultimo punto del tratto coincidono.
    const pts = segments[0].points
    expect(pts[0]).toEqual(pts[pts.length - 1])
  })

  it('un ramo cieco (dead-end) produce un tratto che termina al nodo foglia', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.001, 0)], [3, node(0.002, 0)],
    ])
    addEdge(nodes, 1, 2, 70)
    addEdge(nodes, 2, 3, 70)
    const network: WalkNetwork = { nodes }

    const segments = buildNetworkSegments(network)
    expect(segments).toHaveLength(1)
    // Punti 1/2/3 collineari — vedi il commento sulla semplificazione nel primo test di questo file.
    expect(segments[0].points[0]).toEqual([0, 0])
    expect(segments[0].points[segments[0].points.length - 1]).toEqual([0.002, 0])
  })
})

describe('fetchWalkNetwork', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  // Verifica utente ("gli itinerari sono tornati in linea d'aria", anche dopo aver alzato il
  // timeout) — la causa reale: una Promise.any fra i 3 mirror premiava sempre il primo a
  // rispondere, anche quando quello era un mirror che aveva RINUNCIATO prima (una rete parziale,
  // HTTP 200 con `remark`), mentre un altro mirror stava per restituire la rete completa poco
  // dopo. Il fix (allSettled + preferenza per una risposta completa) va verificato qui, non solo
  // spiegato in un commento.
  it('preferisce una risposta completa anche se un mirror più \'pigro\' (parziale) arriva per primo', async () => {
    const partial = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }], remark: 'runtime timeout' }
    const complete = {
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0.001, lon: 0 },
        { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
      ],
    }
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('overpass-api.de')) return Promise.resolve({ ok: true, json: async () => partial })
      if (url.includes('overpass.openstreetmap.fr')) return Promise.resolve({ ok: true, json: async () => complete })
      return Promise.reject(new Error('mirror down'))
    }))

    const network = await fetchWalkNetwork([0, 0, 0.01, 0.01], 5000)
    // La rete completa ha 2 nodi collegati da una way — quella parziale ne avrebbe solo 1 isolato.
    expect(network.nodes.size).toBe(2)
  })

  it('nessun mirror completo → ripiega sulla risposta parziale con più elementi, mai la prima arrivata', async () => {
    const smallerPartial = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }], remark: 'runtime timeout' }
    const biggerPartial = {
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0.001, lon: 0 },
      ],
      remark: 'runtime timeout',
    }
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('overpass-api.de')) return Promise.resolve({ ok: true, json: async () => smallerPartial })
      if (url.includes('overpass.openstreetmap.fr')) return Promise.resolve({ ok: true, json: async () => biggerPartial })
      return Promise.reject(new Error('mirror down'))
    }))

    const network = await fetchWalkNetwork([0, 0, 0.01, 0.01], 5000)
    expect(network.nodes.size).toBe(2)
  })

  it('tutti i mirror falliscono → errore esplicito, mai una rete vuota spacciata per valida', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('mirror down'))))
    await expect(fetchWalkNetwork([0, 0, 0.01, 0.01], 5000)).rejects.toThrow()
  })
})
