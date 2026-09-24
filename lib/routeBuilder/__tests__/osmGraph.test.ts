import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildNetworkSegments, fetchWalkNetwork, stitchNearbyEndpoints, bridgeDisconnectedComponents, type WalkNetwork, type GraphNode } from '@/lib/routeBuilder/osmGraph'
import { haversineM } from '@/lib/geoUtils'

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

// BFS minimale solo per verificare la raggiungibilità (non serve un percorso pesato per questi test).
function reachable(nodes: Map<number, GraphNode>, fromId: number): Set<number> {
  const seen = new Set<number>([fromId])
  const queue = [fromId]
  while (queue.length > 0) {
    const cur = nodes.get(queue.shift()!)
    if (!cur) continue
    for (const e of cur.edges) {
      if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to) }
    }
  }
  return seen
}

describe('stitchNearbyEndpoints', () => {
  // Verifica utente (Sirmione: "Borgo storico" → "Grotte di Catullo", 630m in linea d'aria, resi
  // sempre in linea d'aria pur con SNAP_THRESHOLD_M e DIJKSTRA_MAX_DIST_M ampi) — causa reale
  // confermata sui dati di produzione (network reale scaricato, non ipotetica): due way OSM che si
  // toccano sul terreno (qui, ~8m di distanza) SENZA condividere un node, quindi due componenti del
  // grafo scollegate — nessuna soglia di aggancio/raggio Dijkstra risolve un arco che il grafo
  // scaricato non contiene affatto.
  it('collega due way vicine ma topologicamente scollegate, entro la soglia', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.0001, 0)], // way A, isolata
      [3, node(0.0001, 0.00007)], [4, node(0.0002, 0.00007)], // way B, isolata — nodo 3 a ~8m dal nodo 2
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 3, 4, 200)
    expect(reachable(nodes, 1).has(4)).toBe(false) // prima dello stitching, davvero scollegate

    stitchNearbyEndpoints(nodes)
    expect(reachable(nodes, 1).has(4)).toBe(true)
  })

  it('non collega due way oltre la soglia di distanza (mai un collegamento inventato)', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(0, 0)], [2, node(0.0001, 0)],
      [3, node(0.001, 0)], [4, node(0.0011, 0)], // ~100m dal nodo 2, ben oltre STITCH_THRESHOLD_M
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 3, 4, 200)

    stitchNearbyEndpoints(nodes)
    expect(reachable(nodes, 1).has(4)).toBe(false)
  })

  it('non usa come candidato un nodo già ad alta valenza (un vero incrocio mappato)', () => {
    // Nodo 2 (0,0) è un vero incrocio a 4 bracci, con un altro tratto isolato (3-4) a ~11m — entro
    // STITCH_THRESHOLD_M se nodo 2 fosse un candidato valido. Gli altri bracci dell'incrocio (5/6/7)
    // e nodo 1 restano lontani sia dal tratto 3-4 sia fra loro, così l'unico modo per 1 di
    // raggiungere 4 sarebbe proprio una scorciatoia da nodo 2 — quella che non deve esistere.
    const nodes = new Map<number, GraphNode>([
      [1, node(0, -0.002)], [2, node(0, 0)],
      [5, node(0.002, 0.002)], [6, node(0.002, -0.002)], [7, node(-0.002, 0)],
      [3, node(0, 0.0001)], [4, node(0, 0.0002)],
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 2, 5, 100)
    addEdge(nodes, 2, 6, 100)
    addEdge(nodes, 2, 7, 100)
    addEdge(nodes, 3, 4, 200)

    stitchNearbyEndpoints(nodes)
    expect(reachable(nodes, 1).has(4)).toBe(false)
  })
})

describe('bridgeDisconnectedComponents', () => {
  // Verifica utente (Chieti, place id eb07bfac-e861-484c-bb4c-acca63838e3f) — confermato sui dati
  // reali (walk_network_cache id=69): "Terme romane di Chieti" è un frammento isolato di sole 3
  // node, staccato dal resto della rete da un varco di ~56m — troppo largo per
  // STITCH_THRESHOLD_M=15 (Sirmione, ~8m). Qui il punto più vicino del frammento isolato (nodo 2)
  // cade a metà di un arco esistente dell'altra componente (nodi 10-11), non su uno dei suoi due
  // estremi: la distanza dal punto più vicino DELL'ARCO è ~100m (sotto soglia), mentre la distanza
  // dal nodo estremo più vicino (10 o 11) è ~269m (sopra soglia) — un aggancio solo ai node (come
  // stitchNearbyEndpoints) non troverebbe questo ponte con la stessa soglia.
  it('collega due componenti scollegate agganciando a metà di un arco esistente, non solo ai suoi nodi', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(-0.001, 0)], [2, node(0, 0)], // componente A, isolata
      [10, node(0.000898, -0.002246)], [11, node(0.000898, 0.002246)], // componente B, isolata
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 10, 11, 200)
    expect(reachable(nodes, 1).has(11)).toBe(false) // prima del ponte, davvero scollegate

    // Distanza dai due estremi del segmento, ben oltre la soglia — solo l'interno dell'arco è vicino.
    expect(haversineM(0, 0, 0.000898, -0.002246)).toBeGreaterThan(220)
    expect(haversineM(0, 0, 0.000898, 0.002246)).toBeGreaterThan(220)

    bridgeDisconnectedComponents(nodes)
    expect(reachable(nodes, 1).has(11)).toBe(true)
  })

  it('non collega due componenti oltre la soglia (mai un ponte inventato attraverso una barriera reale)', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(-0.001, 0)], [2, node(0, 0)],
      // Stesso segmento di sopra, ma spostato molto più lontano (~300m di distanza perpendicolare,
      // oltre COMPONENT_BRIDGE_MAX_M anche per il punto più vicino sull'arco).
      [10, node(0.0027, -0.002246)], [11, node(0.0027, 0.002246)],
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 10, 11, 200)

    bridgeDisconnectedComponents(nodes)
    expect(reachable(nodes, 1).has(11)).toBe(false)
  })

  it('non aggiunge nessuna scorciatoia quando le componenti sono già connesse', () => {
    const nodes = new Map<number, GraphNode>([
      [1, node(-0.001, 0)], [2, node(0, 0)],
      [10, node(0.000898, -0.002246)], [11, node(0.000898, 0.002246)],
    ])
    addEdge(nodes, 1, 2, 100)
    addEdge(nodes, 10, 11, 200)
    addEdge(nodes, 2, 10, 300) // già connesse da un arco reale

    bridgeDisconnectedComponents(nodes)
    const hasBridgeEdge = Array.from(nodes.values()).some(n => n.edges.some(e => e.wayId === -2))
    expect(hasBridgeEdge).toBe(false)
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

  // Verifica utente (Sirmione, log Vercel: "Overpass non disponibile" — i 3 mirror avevano TUTTI
  // rifiutato al primo giro) — passando dalla Promise.any di fetchOverpass alla scelta "risposta
  // migliore" si era perso anche il suo singolo retry dopo una pausa, che copriva proprio un
  // rifiuto simultaneo transitorio dei 3 mirror pubblici.
  it('tutti i mirror rifiutano al primo giro ma rispondono al secondo → un solo retry basta, mai un errore prematuro', async () => {
    const complete = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }, { type: 'node', id: 2, lat: 0.001, lon: 0 }] }
    let attempt = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      attempt++
      // Tutti e 3 i mirror (una sola chiamata fetch a "giro" per endpoint) rifiutano fino a
      // quando non è scattato il retry (attempt > 3, cioè il secondo giro di 3 chiamate).
      if (attempt <= 3) return Promise.reject(new Error('mirror down'))
      return Promise.resolve({ ok: true, json: async () => complete })
    }))

    const network = await fetchWalkNetwork([0, 0, 0.01, 0.01], 5000)
    expect(network.nodes.size).toBe(2)
    expect(attempt).toBe(6) // 3 mirror × 2 giri
  })
})
