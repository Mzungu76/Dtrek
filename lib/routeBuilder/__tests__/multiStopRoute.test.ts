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

  it('in modalità naturalistico preferisce un sentiero a una strada bianca più corta', () => {
    // A diretto (1-4, ~1000m, track — livello "quiet", il preferito nelle altre modalità) vs B
    // (1-2-3-4, ~1500m totali, path — un sentiero): in "naturalistico" il sentiero passa in testa
    // all'ordine di preferenza, quindi B viene scelto nonostante sia più lungo.
    const nodes = detourNodes()
    const network = buildNetwork(nodes, [
      [1, 4, 'track'],
      [1, 2, 'path'], [2, 3, 'path'], [3, 4, 'path'],
    ])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[4]], 'naturalistico')
    expect(outcome.legs).toHaveLength(1)
    expect(outcome.legs[0].real).toBe(true)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(1400)
    expect(outcome.legs[0].distanceM).toBeLessThan(1600)
  })

  // Riproduce il bug segnalato dall'utente (screenshot, dopo il fix del ripiego a distanza reale):
  // due punti nello STESSO centro storico (Chiesa e centro di un Borgo), distanza minima, collegati
  // SOLO da una piazza pedonale — se `pedestrian` non fosse un tipo di via riconosciuto (né in
  // WALKABLE_HIGHWAY, osmGraph.ts, né in highwayTier/URBAN_ALLOWED_HIGHWAY qui), l'arco non
  // esisterebbe proprio nel grafo scaricato o verrebbe escluso in "urbano" — "nessun cammino
  // trovato" pur essendo i due punti a pochi metri l'uno dall'altro, non un problema di budget.
  it('collega due punti dello stesso centro storico attraverso una piazza pedonale (pedestrian)', () => {
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(80) } }
    const network = buildNetwork(nodes, [[1, 2, 'pedestrian']])
    const misto = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'misto')
    expect(misto.legs[0].real).toBe(true)
    expect(misto.legs[0].distanceM).toBeCloseTo(80, 0)
    // "urbano" esclude i sentieri ma MAI una piazza pedonale — è l'essenza stessa del trekking
    // urbano, non un compromesso di sicurezza come `path`/`footway`.
    const urbano = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'urbano')
    expect(urbano.legs[0].real).toBe(true)
  })

  it('senza un target di distanza sceglie il cammino preferito, non lo allunga inutilmente', () => {
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(500) } }
    const network = buildNetwork(nodes, [[1, 2, 'track']])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'misto', null)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(400)
    expect(outcome.legs[0].distanceM).toBeLessThan(600)
  })

  // Riproduce il bug segnalato dall'utente: due tappe reali collegate solo da una strada (road,
  // moltiplicatore di costo 2.5x) restano in ripiego a linea d'aria quando fra loro (in direzione
  // diversa) esiste una fitta rete di vie "quiet" a basso costo — es. i sentieri di una riserva
  // naturale — abbastanza estesa da esaurire DIJKSTRA_MAX_NODES prima che la ricerca pesata per
  // tipo di via arrivi mai a visitare il nodo della strada, anche se quella strada è vicinissima in
  // metri reali. Non è un problema di budget di distanza (la strada dista solo 200m) ma di ORDINE
  // di visita: Dijkstra esplora per costo crescente, quindi una fitta diramazione a basso costo (mai
  // collegata al bersaglio) precede nella coda un nodo più vicino in realtà ma penalizzato — vedi il
  // commento su DIJKSTRA_FALLBACK_MAX_NODES in multiStopRoute.ts.
  it('trova comunque un cammino reale quando una fitta rete a basso costo esaurisce il budget di nodi prima della strada che collega le tappe', () => {
    const nodes: Record<number, { lat: number; lon: number }> = {
      1: { lat: 0, lon: 0 },
      // Nodo "A" sulla strada che porta al bersaglio — 200m a est di 1, "residential" (road, 2.5x
      // ⇒ costo 500) — e il bersaglio stesso, appena oltre.
      2: { lat: 0, lon: degFor(200) },
      3: { lat: 0, lon: degFor(201) },
    }
    const edges: [number, number, string][] = [
      [1, 2, 'residential'],
      [2, 3, 'track'],
    ]
    // Diramazione a bassissimo costo (track, 1x) in un'altra direzione — 30 000 nodi a 0.01m l'uno
    // dall'altro (costo cumulativo ~300, sempre sotto i 500 del nodo sulla strada): più della metà
    // di questa diramazione basta da sola a esaurire DIJKSTRA_MAX_NODES (25 000) prima che la
    // ricerca pesata visiti mai il nodo 2.
    const DECOY_COUNT = 30_000
    let prevId = 1
    for (let i = 0; i < DECOY_COUNT; i++) {
      const id = 100 + i
      nodes[id] = { lat: -degFor(0.01 * (i + 1)), lon: 0 }
      edges.push([prevId, id, 'track'])
      prevId = id
    }
    const network = buildNetwork(nodes, edges)
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[3]], 'misto')
    expect(outcome.legs).toHaveLength(1)
    expect(outcome.legs[0].real).toBe(true)
    expect(outcome.legs[0].distanceM).toBeGreaterThan(190)
    expect(outcome.legs[0].distanceM).toBeLessThan(210)
    // La diagnostica (vedi §4 punto 2 del doc di stato) deve riflettere esattamente lo scenario
    // che questo test riproduce: il tentativo pesato esaurisce il budget di nodi (non trova un
    // cammino non perché non esista, ma perché il budget finisce prima), e il ripiego a distanza
    // reale è quello che produce davvero il cammino restituito.
    expect(outcome.legs[0].diagnostic?.pathSource).toBe('distance_fallback')
    expect(outcome.legs[0].diagnostic?.preferred.budgetExhausted).toBe(true)
    expect(outcome.legs[0].diagnostic?.fallback?.budgetExhausted).toBe(false)
  })

  it('diagnostica pathSource:"preferred" quando la ricerca pesata trova subito il cammino, senza bisogno del ripiego', () => {
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(500) } }
    const network = buildNetwork(nodes, [[1, 2, 'track']])
    const outcome = buildMultiStopRoute(network, [nodes[1], nodes[2]], 'misto')
    expect(outcome.legs[0].real).toBe(true)
    expect(outcome.legs[0].diagnostic?.pathSource).toBe('preferred')
    expect(outcome.legs[0].diagnostic?.fallback).toBeUndefined()
  })

  it('nessuna diagnostica quando il ripiego a linea d\'aria è dovuto a uno snap alla rete fallito (too_far_from_network)', () => {
    // Le due tappe sono troppo lontane da qualunque nodo della rete (SNAP_THRESHOLD_M=350) — mai
    // avviato un Dijkstra, niente da diagnosticare oltre al motivo già in fallbackReason.
    const nodes = { 1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: degFor(500) } }
    const network = buildNetwork(nodes, [[1, 2, 'track']])
    const far = { lat: 5, lon: 5 }
    const outcome = buildMultiStopRoute(network, [nodes[1], far], 'misto')
    expect(outcome.legs[0].real).toBe(false)
    expect(outcome.legs[0].fallbackReason).toBe('too_far_from_network')
    expect(outcome.legs[0].diagnostic).toBeUndefined()
  })
})
