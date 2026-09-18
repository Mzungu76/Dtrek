import { describe, it, expect } from 'vitest'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from '../borgoItinerary'

function stop(id: string, name: string, lat: number, lon: number, extra: Partial<ItineraryStopCandidate> = {}): ItineraryStopCandidate {
  return { id, name, lat, lon, source: 'archivio', ...extra }
}

describe('mergeStopCandidates', () => {
  it('non duplica una voce Wikipedia vicina con un nome simile a una tappa già in archivio', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro (Vetralla)', 42.0001, 12.0001, { source: 'wikipedia', description: 'Una chiesa storica.' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a1')
    // Arricchita con la descrizione mancante presa da Wikipedia.
    expect(merged[0].description).toBe('Una chiesa storica.')
  })

  it('non sovrascrive una descrizione già presente in archivio', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0, { description: 'Descrizione originale MiC.' })]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro', 42.0001, 12.0001, { source: 'wikipedia', description: 'Testo Wikipedia.' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged[0].description).toBe('Descrizione originale MiC.')
  })

  it('tiene separate due voci vicine ma con nomi diversi', () => {
    const archive = [stop('a1', 'Museo Civico', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Palazzo Comunale', 42.0001, 12.0001, { source: 'wikipedia' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(2)
  })

  it('tiene separate due voci con nome simile ma lontane', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro', 43.0, 13.0, { source: 'wikipedia' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(2)
  })
})

describe('nearestStops', () => {
  it('tiene solo le N tappe più vicine al centro, in ordine di distanza', () => {
    const center = { lat: 42.0, lon: 12.0 }
    const stops = [
      stop('far', 'Lontana', 42.05, 12.05),
      stop('near', 'Vicina', 42.001, 12.001),
      stop('mid', 'Media', 42.01, 12.01),
    ]
    const result = nearestStops(center, stops, 2)
    expect(result.map(s => s.id)).toEqual(['near', 'mid'])
  })
})

describe('orderStopsNearestNeighbor', () => {
  it('visita sempre la tappa non ancora vista più vicina alla posizione corrente', () => {
    const start = { lat: 0, lon: 0 }
    // B è la più vicina al borgo, ma da B la tappa più vicina è C (non A, che è più lontana da B
    // di quanto lo sia C) — verifica che l'ordine segua la posizione CORRENTE, non solo la
    // distanza dal punto di partenza.
    const a = stop('a', 'A', 0, 0.010)
    const b = stop('b', 'B', 0, 0.001)
    const c = stop('c', 'C', 0, 0.002)
    const ordered = orderStopsNearestNeighbor(start, [a, b, c])
    expect(ordered.map(s => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('un elenco vuoto produce un ordine vuoto', () => {
    expect(orderStopsNearestNeighbor({ lat: 0, lon: 0 }, [])).toEqual([])
  })
})
