import { describe, it, expect } from 'vitest'
import { buildMultiStopRoute } from '../multiStopRoute'
import type { WalkNetwork, GraphNode } from '../osmGraph'
import { haversineM } from '../../geoUtils'

// Stesso principio del grafo sintetico di walkRouting.test.ts, con l'aggiunta del tag highway per
// verificare la preferenza per tipo di via (TIER_COST_MULTIPLIER, multiStopRoute.ts). A differenza
// di quel test, qui distM è sempre calcolato dalle coordinate (come il vero addEdge, osmGraph.ts)
// invece di un'etichetta arbitraria — multiStopRoute.ts ricalcola la distanza reale dalla geometria
// del cammino trovato (polylineDistanceM), quindi un distM inventato scollegato dalle coordinate
// produrrebbe asserzioni sbagliate, non un bug nel codice sotto test.
function buildNetwork(
  nodes: Record<number, { lat: number; lon: number }>,
  edges: [number, number, string][],
): WalkNetwork {
  const map = new Map<number, GraphNode>()
  for (const [id, pos] of Object.entries(nodes)) {
    map.set(Number(id), { lat: pos.lat, lon: pos.lon, edges: [] })
  }
  for (const [a, b, highway] of edges) {
    const posA = nodes[a]
    const posB = nodes[b]
    const distM = haversineM(posA.lat, posA.lon, posB.lat, posB.lon)
    map.get(a)!.edges.push({ to: b, distM, wayId: a * 1000 + b, highway })
    map.get(b)!.edges.push({ to: a, distM, wayId: a * 1000 + b, highway })
  }
  return { nodes: map }
}

// ≈111320m per grado, sia in latitudine sia in longitudine vicino all'equatore (haversineM,
// lib/geoUtils.ts) — le coordinate sotto sono scelte per dare distanze reali comode da verificare.
const M_PER_DEG = 111320
function degFor(meters: number): number { return meters / M_PER_DEG }

// Percorso diretto 1→4 (residential/path, ~1000m) affiancato da un percorso "a rettangolo"
// 1→2→3→4 (track/unclassified, 250+1000+250 = ~1500m) — un vero detour geometrico, non solo
// un'etichetta diversa sullo stesso tratto: il diretto è realmente più corto.
function detourNodes() {
  return {
    1: { lat: 0, lon: 0 },
    2: { lat: -degFor(250), lon: 0 },
    3: { lat: -degFor(250), lon: degFor(1000) },
    4: { lat: 0, lon: degFor(1000) },
  }
}

describe('buildMultiStopRoute', () => {
  it('preferisce una strada bianca (track) più lunga a una strada residenziale più corta', () => {
    // A diretto (1-4, ~1000m, residential — livello "road", penalizzato 2.5x) vs B a tre tratti
    // (1-2-3-4, ~1500m totali, track — livello "quiet", nessuna penalità): A è più corto in realtà
    // (~1000 < ~1500) ma costa di più (2500 vs 1500 in unità di costo) — l'algoritmo deve scegliere
    // B nonostante sia più lungo.
    const nodes = detourNodes()
    const network = buildNetwork(nodes, [
      [1, 4, 'residential'],
      [1, 2, 'track'], [2, 3, 'track'], [3, 4, 'track'],
    ])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[4]], 'misto')
    expect(outcome.legs).toHaveLength(1)
    const leg = outcome.legs[0]
    expect(leg.real).toBe(true)
    // La distanza riportata è quella REALE del cammino scelto (B, ~1500m) — mai il costo pesato
    // usato solo internamente da Dijkstra per decidere quale preferire (sarebbe ~1000m se avesse
    // scelto A, la distanza reale del diretto).
    expect(leg.distanceM).toBeGreaterThan(1400)
    expect(leg.distanceM).toBeLessThan(1600)
    expect(leg.polyline).toHaveLength(4) // passa per i nodi 1,2,3,4
  })

  it("usa comunque una strada se è l'unico modo di collegare due tappe", () => {
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(800) } }
    const network = buildNetwork(nodes, [[1, 2, 'residential']])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'misto')
    expect(outcome.legs).toHaveLength(1)
    expect(outcome.legs[0].real).toBe(true)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(700)
    expect(outcome.legs[0].distanceM).toBeLessThan(900)
  })

  it('in modalità urbano ignora un sentiero anche se più corto di una strada', () => {
    // A diretto (1-4, ~1000m, path — un sentiero, escluso del tutto in urbano) vs B (1-2-3-4,
    // ~1500m totali, unclassified — ammesso). In "urbano" A non è nemmeno un'opzione, quindi B
    // (più lungo) è l'unico risultato possibile, non un ripiego a linea d'aria.
    const nodes = detourNodes()
    const network = buildNetwork(nodes, [
      [1, 4, 'path'],
      [1, 2, 'unclassified'], [2, 3, 'unclassified'], [3, 4, 'unclassified'],
    ])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[4]], 'urbano')
    expect(outcome.legs).toHaveLength(1)
    expect(outcome.legs[0].real).toBe(true)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(1400)
    expect(outcome.legs[0].distanceM).toBeLessThan(1600)
  })

  it('senza un target di distanza sceglie il cammino preferito, non lo allunga inutilmente', () => {
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(500) } }
    const network = buildNetwork(nodes, [[1, 2, 'track']])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'misto', null)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(400)
    expect(outcome.legs[0].distanceM).toBeLessThan(600)
  })
})
