import { describe, it, expect } from 'vitest'
import {
  mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, groupStopsIntoTappe, personalizedTappaDistanceM,
  type ItineraryStopCandidate,
} from '../borgoItinerary'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

function stop(id: string, name: string, lat: number, lon: number, extra: Partial<ItineraryStopCandidate> = {}): ItineraryStopCandidate {
  return { id, name, lat, lon, source: 'archivio', ...extra }
}

function leg(distanceM: number): ItineraryLeg {
  return { fromIdx: 0, toIdx: 1, distanceM, polyline: [], real: true }
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

describe('personalizedTappaDistanceM', () => {
  it('preferenze non ancora caricate → il default medio (3 km)', () => {
    expect(personalizedTappaDistanceM(undefined)).toBe(3000)
  })

  it('pref_durata uguale al default (270 min) → invariato', () => {
    expect(personalizedTappaDistanceM(270)).toBe(3000)
  })

  it('scala proporzionalmente a metà tra il pavimento e il tetto', () => {
    expect(personalizedTappaDistanceM(480)).toBe(Math.round(3000 * (480 / 270)))
  })

  it('mai sotto il pavimento, anche per una preferenza molto bassa', () => {
    expect(personalizedTappaDistanceM(60)).toBe(1500)
  })

  it('mai oltre il tetto, anche per una preferenza molto alta', () => {
    expect(personalizedTappaDistanceM(1000)).toBe(6000)
  })
})

describe('groupStopsIntoTappe', () => {
  const center = { lat: 0, lon: 0 }

  it('un elenco vuoto produce nessuna tappa', () => {
    expect(groupStopsIntoTappe(center, [], [], 6, 3000)).toEqual([])
  })

  it('poche tappe vicine restano tutte in un\'unica tappa', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0), stop('c', 'C', 0, 0)]
    const legs = [leg(500), leg(500), leg(500)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 3000)
    expect(tappe).toHaveLength(1)
    expect(tappe[0].stops.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(tappe[0].distanceM).toBe(1500)
    expect(tappe[0].startPoint).toEqual(center)
  })

  it('si divide per numero massimo di punti', () => {
    const stops = ['a', 'b', 'c', 'd', 'e'].map(id => stop(id, id, 0, 0))
    const legs = stops.map(() => leg(100))
    const tappe = groupStopsIntoTappe(center, stops, legs, 2, 10000)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('si divide per distanza massima accumulata', () => {
    const stops = ['a', 'b', 'c'].map(id => stop(id, id, 0, 0))
    const legs = [leg(1000), leg(1000), leg(1000)]
    // Tetto 1900m: dopo 'a' (1000) il tratto per 'b' (altri 1000) supererebbe il tetto → nuova tappa.
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 1900)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a'], ['b'], ['c']])
  })

  it('una tappa non è mai vuota, anche quando il primo punto da solo supera già il tetto', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0)]
    const legs = [leg(5000), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 1000)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a'], ['b']])
  })

  it('la tappa successiva parte dall\'ultimo punto della precedente, non dal centro del borgo', () => {
    const stops = ['a', 'b', 'c'].map(id => stop(id, id, 1, 1))
    const legs = [leg(100), leg(100), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 1, 10000)
    expect(tappe).toHaveLength(3)
    expect(tappe[0].startPoint).toEqual(center)
    expect(tappe[1].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[0] ('a')
    expect(tappe[2].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[1] ('b')
  })
})
