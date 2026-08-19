// DTREK-AUDIT.md P0 #10 — pathHazardMarkers legge gli stessi archi REALMENTE percorsi dal
// pathfinding (stessa fonte di pathHasSteps, mai una query/euristica separata). Fixture minimale
// costruita a mano, nessun Dijkstra reale necessario per esercitare la sola logica di estrazione.
import { describe, it, expect } from 'vitest'
import { pathHazardMarkers } from '../loopBuilder'
import type { WalkNetwork, GraphNode, GraphEdge } from '../osmGraph'

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
