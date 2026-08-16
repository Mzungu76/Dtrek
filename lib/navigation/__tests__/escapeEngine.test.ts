// Fase 3 di docs/navigator-orizzonti-roadmap.md — grafo sentieri sintetico piccolo (pochi nodi,
// non serve una fetch Overpass reale) per verificare l'invariante esplicito del modulo
// ("l'utente deve sempre sapere perché viene proposta una determinata opzione", spec §11) e
// l'ordine delle opzioni, che il commento del modulo dichiara fisso e intenzionale.
import { describe, it, expect } from 'vitest'
import { computeEscapeOptions, type EscapeEngineInput } from '../escapeEngine'
import type { WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import type { NavPoi, RouteProgress } from '../types'

const CURRENT_LAT = 45.005
const CURRENT_LON = 7.002

const routePolyline: [number, number][] = [
  [45.000, 7.000],
  [45.010, 7.000],
]

const progress: RouteProgress = {
  nearestSegmentIndex: 0,
  distanceToRouteM: 150,
  distanceAlongRouteM: 500,
  totalRouteM: 1100,
  nearestPointLat: 45.005,
  nearestPointLon: 7.000,
  expectedBearingDeg: 0,
}

// Nodo 1 (id 1) coincide con la posizione corrente — il più vicino per nearestGraphNode.
// Nodo 2 (id 2) raggiungibile via un sentiero ('path') abbastanza lontano dal percorso
// pianificato da contare come alternativa reale (oltre i 40m di MIN_ALTERNATIVE_DISTANCE_FROM_ROUTE_M).
// Nodo 3 (id 3) raggiungibile da lì via una via classificata come strada ('unclassified').
function buildNetwork(): WalkNetwork {
  return {
    nodes: new Map([
      [1, { lat: CURRENT_LAT, lon: CURRENT_LON, edges: [{ to: 2, distM: 150, wayId: 100, highway: 'path' }] }],
      [2, { lat: 45.006, lon: 7.003, edges: [
        { to: 1, distM: 150, wayId: 100, highway: 'path' },
        { to: 3, distM: 200, wayId: 101, highway: 'unclassified' },
      ] }],
      [3, { lat: 45.007, lon: 7.004, edges: [{ to: 2, distM: 200, wayId: 101, highway: 'unclassified' }] }],
    ]),
  }
}

const safePoi: NavPoi = { id: 'poi-1', lat: 45.008, lon: 7.005, name: 'Rifugio Test', type: 'hut' }

describe('computeEscapeOptions', () => {
  it('include sempre "torna sul percorso" per prima, anche senza grafo né POI', () => {
    const input: EscapeEngineInput = { network: null, routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress }
    const options = computeEscapeOptions(input)
    expect(options).toHaveLength(1)
    expect(options[0].kind).toBe('back_to_route')
  })

  it('genera le 4 tipologie nell\'ordine dichiarato dallo spec quando grafo e POI sono disponibili', () => {
    const input: EscapeEngineInput = {
      network: buildNetwork(), routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress, pois: [safePoi],
    }
    const options = computeEscapeOptions(input)
    expect(options.map((o) => o.kind)).toEqual(['back_to_route', 'alternative_trail', 'road', 'safe_poi'])
  })

  it('ogni opzione porta sempre un motivo non vuoto — invariante esplicito dello spec (§11)', () => {
    const input: EscapeEngineInput = {
      network: buildNetwork(), routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress, pois: [safePoi],
    }
    const options = computeEscapeOptions(input)
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('omette le opzioni che dipendono dal grafo quando il grafo non è disponibile', () => {
    const input: EscapeEngineInput = {
      network: null, routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress, pois: [safePoi],
    }
    const options = computeEscapeOptions(input)
    expect(options.map((o) => o.kind)).toEqual(['back_to_route', 'safe_poi'])
  })

  it('omette l\'opzione POI sicuro quando nessun POI ha un tipo rilevante (hut/bivouac/shelter)', () => {
    const notSafe: NavPoi = { id: 'poi-2', lat: 45.008, lon: 7.005, name: 'Punto panoramico', type: 'viewpoint' }
    const input: EscapeEngineInput = {
      network: null, routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress, pois: [notSafe],
    }
    const options = computeEscapeOptions(input)
    expect(options.some((o) => o.kind === 'safe_poi')).toBe(false)
  })

  it('la via alternativa preferisce la via di qualità migliore (path/track) rispetto a una strada, a parità di raggiungibilità', () => {
    const input: EscapeEngineInput = {
      network: buildNetwork(), routePolyline, currentLat: CURRENT_LAT, currentLon: CURRENT_LON, progress,
    }
    const options = computeEscapeOptions(input)
    const trail = options.find((o) => o.kind === 'alternative_trail')
    const road = options.find((o) => o.kind === 'road')
    expect(trail?.targetLat).toBeCloseTo(45.006)
    expect(road?.targetLat).toBeCloseTo(45.007)
  })
})
