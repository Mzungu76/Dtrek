import { describe, it, expect } from 'vitest'
import {
  mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, groupStopsIntoTappe,
  personalizedTappaMinutes, resolveDurationSignalMinutes, visitMinutesFor, WALK_SPEED_MPS,
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

describe('visitMinutesFor', () => {
  it('siteType noto → il tempo di visita configurato per quel tipo (lib/metaTypes.ts)', () => {
    expect(visitMinutesFor({ siteType: 'museo' })).toBe(90)
    expect(visitMinutesFor({ siteType: 'monumento' })).toBe(15)
  })

  it('nessun siteType (tappa da Wikipedia, o archivio senza subtype) → il default prudente, mai zero', () => {
    expect(visitMinutesFor({})).toBeGreaterThan(0)
  })
})

describe('resolveDurationSignalMinutes', () => {
  it('nessuno storico → ricade sulla preferenza dichiarata', () => {
    expect(resolveDurationSignalMinutes(undefined, 200)).toBe(200)
  })

  it('storico con zero uscite → ricade comunque sulla preferenza dichiarata', () => {
    expect(resolveDurationSignalMinutes({ count: 0, sumDurationMin: 0, recent: [] }, 200)).toBe(200)
  })

  it('storico con uscite recenti → la media delle ultime, non la preferenza dichiarata', () => {
    const history = { count: 10, sumDurationMin: 3000, recent: [{ durationMin: 400 }, { durationMin: 600 }] }
    expect(resolveDurationSignalMinutes(history, 100)).toBe(500) // (400+600)/2, ignora sia sumDurationMin/count sia 100
  })

  it('storico senza uscite recenti salvate ma con conteggio → la media storica complessiva', () => {
    const history = { count: 5, sumDurationMin: 1000, recent: [] }
    expect(resolveDurationSignalMinutes(history, 100)).toBe(200) // 1000/5, ignora la preferenza dichiarata
  })
})

describe('personalizedTappaMinutes', () => {
  it('nessun segnale di durata → il default medio (150 min, ~2h30)', () => {
    expect(personalizedTappaMinutes(undefined)).toBe(150)
  })

  it('segnale uguale al riferimento (270 min) → invariato', () => {
    expect(personalizedTappaMinutes(270)).toBe(150)
  })

  it('scala proporzionalmente al segnale di durata', () => {
    expect(personalizedTappaMinutes(480)).toBe(Math.round(150 * (480 / 270)))
  })

  it('mai sotto il pavimento, anche per un segnale molto basso', () => {
    expect(personalizedTappaMinutes(90)).toBe(60)
  })

  it('mai oltre il tetto, anche per un segnale molto alto', () => {
    expect(personalizedTappaMinutes(1000)).toBe(300)
  })
})

describe('groupStopsIntoTappe', () => {
  const center = { lat: 0, lon: 0 }

  it('un elenco vuoto produce nessuna tappa', () => {
    expect(groupStopsIntoTappe(center, [], [], 6, 150)).toEqual([])
  })

  it('poche tappe vicine restano tutte in un\'unica tappa quando il budget di tempo è ampio', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0), stop('c', 'C', 0, 0)]
    const legs = [leg(500), leg(500), leg(500)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 600)
    expect(tappe).toHaveLength(1)
    expect(tappe[0].stops.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(tappe[0].distanceM).toBe(1500)
    expect(tappe[0].startPoint).toEqual(center)
    // Cammino (3×500m a WALK_SPEED_MPS) + visita (3× il default, nessun siteType impostato).
    const expectedMinutes = Math.round(3 * ((500 / WALK_SPEED_MPS / 60) + visitMinutesFor({})))
    expect(tappe[0].totalMinutes).toBe(expectedMinutes)
  })

  it('si divide per numero massimo di punti anche con un budget di tempo amplissimo', () => {
    const stops = ['a', 'b', 'c', 'd', 'e'].map(id => stop(id, id, 0, 0))
    const legs = stops.map(() => leg(100))
    const tappe = groupStopsIntoTappe(center, stops, legs, 2, 100_000)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('si divide per tempo massimo accumulato — cammino PIÙ tempo di visita, non solo distanza', () => {
    // Stesso identico tragitto (1000m ciascuna) ma tappe di tipo diverso (tempi di visita diversi):
    // un museo (90min) esaurisce il budget dopo un solo punto, un monumento (15min) ne fa stare di più.
    const legs = [leg(1000), leg(1000), leg(1000)]
    const budget = (1000 / WALK_SPEED_MPS / 60) + 100 // poco sopra "un museo", sotto "due musei"

    const museumStops = ['a', 'b', 'c'].map(id => stop(id, id, 0, 0, { siteType: 'museo' }))
    expect(groupStopsIntoTappe(center, museumStops, legs, 6, budget).map(t => t.stops.length)).toEqual([1, 1, 1])

    const monumentStops = ['a', 'b', 'c'].map(id => stop(id, id, 0, 0, { siteType: 'monumento' }))
    // Un monumento (15min) pesa molto meno di un museo: più punti stanno nello stesso budget.
    expect(groupStopsIntoTappe(center, monumentStops, legs, 6, budget).length)
      .toBeLessThan(groupStopsIntoTappe(center, museumStops, legs, 6, budget).length)
  })

  it('una tappa non è mai vuota, anche quando il primo punto da solo supera già il budget', () => {
    const stops = [stop('a', 'A', 0, 0, { siteType: 'museo' }), stop('b', 'B', 0, 0, { siteType: 'monumento' })]
    const legs = [leg(5000), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 40)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a'], ['b']])
  })

  it('la tappa successiva parte dall\'ultimo punto della precedente, non dal centro del borgo', () => {
    const stops = ['a', 'b', 'c'].map(id => stop(id, id, 1, 1))
    const legs = [leg(100), leg(100), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 1, 100_000)
    expect(tappe).toHaveLength(3)
    expect(tappe[0].startPoint).toEqual(center)
    expect(tappe[1].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[0] ('a')
    expect(tappe[2].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[1] ('b')
  })
})
