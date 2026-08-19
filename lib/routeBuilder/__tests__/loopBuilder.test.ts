// DTREK-AUDIT.md P0 #10 — pathHazardMarkers legge gli stessi archi REALMENTE percorsi dal
// pathfinding (stessa fonte di pathHasSteps, mai una query/euristica separata). Fixture minimale
// costruita a mano, nessun Dijkstra reale necessario per esercitare la sola logica di estrazione.
import { describe, it, expect } from 'vitest'
import { pathHazardMarkers, terrainCostMultiplier, generateOutAndBackToPoint } from '../loopBuilder'
import type { WalkNetwork, GraphNode, GraphEdge } from '../osmGraph'
import type { HikerConcernKey } from '@/lib/hikerProfile'
import { haversineM } from '@/lib/geoUtils'

function node(lat: number, lon: number): GraphNode {
  return { lat, lon, edges: [] }
}

function link(network: WalkNetwork, aId: number, bId: number, extra: Partial<GraphEdge> = {}) {
  const a = network.nodes.get(aId)!
  const b = network.nodes.get(bId)!
  a.edges.push({ to: bId, distM: 100, wayId: 1, ...extra })
  b.edges.push({ to: aId, distM: 100, wayId: 1, ...extra })
}

function fixtureNetwork(): WalkNetwork {
  const nodes = new Map<number, GraphNode>()
  nodes.set(1, node(41.9, 12.5))
  nodes.set(2, node(41.901, 12.5))
  nodes.set(3, node(41.902, 12.5))
  return { nodes }
}

describe('pathHazardMarkers — nessun tag di pericolo', () => {
  it('nessun marker su un percorso senza sac_scale/ford sugli archi', () => {
    const network = fixtureNetwork()
    link(network, 1, 2)
    link(network, 2, 3)
    expect(pathHazardMarkers(network, [1, 2, 3])).toEqual([])
  })
})

describe('pathHazardMarkers — scala SAC', () => {
  it('T1-T3 (escursionismo ordinario) non produce alcun marker', () => {
    const network = fixtureNetwork()
    link(network, 1, 2, { sacScale: 'T3' })
    expect(pathHazardMarkers(network, [1, 2])).toEqual([])
  })

  it('T4 produce un marker "exposed" con la sigla corretta', () => {
    const network = fixtureNetwork()
    link(network, 1, 2, { sacScale: 'T4' })
    const markers = pathHazardMarkers(network, [1, 2])
    expect(markers).toHaveLength(1)
    expect(markers[0].kind).toBe('exposed')
    expect(markers[0].sacScale).toBe('T4')
    expect(markers[0].text).toContain('T4')
  })

  it('T5/T6 producono comunque un marker "exposed" (soglia T4+)', () => {
    const network = fixtureNetwork()
    link(network, 1, 2, { sacScale: 'T6' })
    const markers = pathHazardMarkers(network, [1, 2])
    expect(markers).toHaveLength(1)
    expect(markers[0].sacScale).toBe('T6')
  })

  it('il marker è posizionato sul nodo di arrivo dell\'arco taggato, non sull\'origine del percorso', () => {
    const network = fixtureNetwork()
    link(network, 1, 2)
    link(network, 2, 3, { sacScale: 'T5' })
    const markers = pathHazardMarkers(network, [1, 2, 3])
    expect(markers).toHaveLength(1)
    const to = network.nodes.get(3)!
    expect(markers[0].lat).toBe(to.lat)
    expect(markers[0].lon).toBe(to.lon)
  })
})

describe('pathHazardMarkers — guado', () => {
  it('ford=true produce un marker "ford"', () => {
    const network = fixtureNetwork()
    link(network, 1, 2, { ford: true })
    const markers = pathHazardMarkers(network, [1, 2])
    expect(markers).toHaveLength(1)
    expect(markers[0].kind).toBe('ford')
  })

  it('un arco con sia ford che sac_scale T4+ produce due marker distinti', () => {
    const network = fixtureNetwork()
    link(network, 1, 2, { ford: true, sacScale: 'T5' })
    const markers = pathHazardMarkers(network, [1, 2])
    expect(markers).toHaveLength(2)
    expect(markers.map(m => m.kind).sort()).toEqual(['exposed', 'ford'])
  })
})

describe('pathHazardMarkers — percorso vuoto/singolo nodo', () => {
  it('nessun marker su un percorso di un solo nodo (nessun arco da esaminare)', () => {
    const network = fixtureNetwork()
    expect(pathHazardMarkers(network, [1])).toEqual([])
  })
})

// DTREK-AUDIT.md P2 #22 — il Dijkstra minimizzava solo la distanza, nessun costo per scalini/
// terreno tecnico nel routing stesso. terrainCostMultiplier applica un costo extra SOLO quando
// l'utente ha dichiarato preoccupazioni pertinenti (mai un cambiamento per chi non le ha
// dichiarate).
describe('terrainCostMultiplier', () => {
  const steps: GraphEdge = { to: 2, distM: 100, wayId: 1, highway: 'steps' }
  const exposedT4: GraphEdge = { to: 2, distM: 100, wayId: 1, sacScale: 'T4' }
  const plain: GraphEdge = { to: 2, distM: 100, wayId: 1, highway: 'path' }

  it('senza alcuna preoccupazione dichiarata, il moltiplicatore è sempre 1 (nessun cambio di comportamento)', () => {
    expect(terrainCostMultiplier(steps, [])).toBe(1)
    expect(terrainCostMultiplier(exposedT4, [])).toBe(1)
  })

  it('vertigini aumenta il costo sia di scalini sia di terreno SAC T4+', () => {
    const concerns: HikerConcernKey[] = ['vertigini']
    expect(terrainCostMultiplier(steps, concerns)).toBeGreaterThan(1)
    expect(terrainCostMultiplier(exposedT4, concerns)).toBeGreaterThan(1)
  })

  it('salite_ripide aumenta il costo del terreno esposto ma non degli scalini da soli', () => {
    const concerns: HikerConcernKey[] = ['salite_ripide']
    expect(terrainCostMultiplier(exposedT4, concerns)).toBeGreaterThan(1)
    expect(terrainCostMultiplier(steps, concerns)).toBe(1)
  })

  it('orientamento aumenta il costo degli scalini ma non del terreno esposto da solo', () => {
    const concerns: HikerConcernKey[] = ['orientamento']
    expect(terrainCostMultiplier(steps, concerns)).toBeGreaterThan(1)
    expect(terrainCostMultiplier(exposedT4, concerns)).toBe(1)
  })

  it('un arco senza tag rilevanti non riceve mai un moltiplicatore, con qualunque preoccupazione', () => {
    expect(terrainCostMultiplier(plain, ['vertigini', 'salite_ripide', 'orientamento', 'terreno_instabile'])).toBe(1)
  })
})

// Rete con due alternative dallo stesso punto di partenza (1) allo stesso arrivo (3): una breve
// attraverso una scalinata (1->2->3, ~100m), una più lunga ma senza scalini (1->4->3, ~285m) — un
// test end-to-end sul chiamante reale, non solo sul moltiplicatore in isolamento. distM di ogni
// arco calcolato dalla haversine reale delle coordinate (stessa fonte usata da pathDistanceM in
// loopBuilder.ts) — non un valore arbitrario indipendente dalla geometria, altrimenti la distanza
// finale riportata dal candidato (ricalcolata dalla geometria) non corrisponderebbe al costo usato
// dal Dijkstra per scegliere il percorso.
function fixtureNetworkWithAlternatives(): WalkNetwork {
  const nodes = new Map<number, GraphNode>()
  nodes.set(1, node(41.90000, 12.50000))
  nodes.set(2, node(41.90045, 12.50000)) // ~50m a nord del nodo 1 (via scalinata)
  nodes.set(3, node(41.90090, 12.50000)) // ~50m oltre il nodo 2 — destinazione, via scalinata ~100m totali
  nodes.set(4, node(41.90000, 12.50151)) // ~125m a est del nodo 1 — da qui al nodo 3 ~160m (alternativa ~285m totali)
  return { nodes }
}

function linkReal(network: WalkNetwork, aId: number, bId: number, extra: Partial<GraphEdge> = {}) {
  const a = network.nodes.get(aId)!
  const b = network.nodes.get(bId)!
  const distM = haversineM(a.lat, a.lon, b.lat, b.lon)
  a.edges.push({ to: bId, distM, wayId: 1, ...extra })
  b.edges.push({ to: aId, distM, wayId: 1, ...extra })
}

describe('generateOutAndBackToPoint — il pathfinding sceglie davvero un\'alternativa più lunga per evitare gli scalini', () => {
  function buildNetwork(): WalkNetwork {
    const network = fixtureNetworkWithAlternatives()
    linkReal(network, 1, 2, { highway: 'steps' })
    linkReal(network, 2, 3, { highway: 'steps' })
    linkReal(network, 1, 4)
    linkReal(network, 4, 3)
    return network
  }

  it('senza preoccupazioni dichiarate, sceglie il percorso più corto attraverso la scalinata (~100m, non ~285m)', () => {
    const network = buildNetwork()
    const dest = network.nodes.get(3)!
    const candidate = generateOutAndBackToPoint(network, 1, dest.lat, dest.lon, 50, true)
    expect(candidate?.distanceM).toBeLessThan(150)
  })

  it('con vertigini dichiarata, sceglie la via più lunga (~285m) per evitare la scalinata', () => {
    const network = buildNetwork()
    const dest = network.nodes.get(3)!
    const candidate = generateOutAndBackToPoint(network, 1, dest.lat, dest.lon, 50, true, ['vertigini'])
    expect(candidate?.distanceM).toBeGreaterThan(200)
  })
})
