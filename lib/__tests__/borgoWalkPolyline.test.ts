import { describe, it, expect } from 'vitest'
import { computeBorgoWalkFields, nearestPolylineIndex, splitPolylineByTappaEnds } from '../borgoWalkPolyline'
import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'

function itinerary(overrides: Partial<BorgoItinerary> = {}): BorgoItinerary {
  return {
    borgoName: 'Calcata',
    stops: [
      { id: 'a', name: 'Chiesa', lat: 1, lon: 1, source: 'archivio' },
      { id: 'b', name: 'Museo', lat: 2, lon: 2, source: 'wikipedia' },
    ],
    legs: [
      { fromIdx: -1, toIdx: 0, distanceM: 100, polyline: [[0, 0], [1, 1]], real: true },
      { fromIdx: 0, toIdx: 1, distanceM: 150, polyline: [[1, 1], [2, 2]], real: false },
    ],
    totalDistanceM: 250,
    estimatedTimeSeconds: 200,
    tappe: [],
    maxStopsPerTappa: 6,
    maxMinutesPerTappa: 150,
    ...overrides,
  }
}

describe('computeBorgoWalkFields', () => {
  it('concatena le polyline di tutte le legs in ordine', () => {
    const result = computeBorgoWalkFields(itinerary())
    expect(result?.borgoWalkPolyline).toEqual([[0, 0], [1, 1], [1, 1], [2, 2]])
  })

  it('lo hash riflette l\'ordine degli id delle tappe', () => {
    const result = computeBorgoWalkFields(itinerary())
    expect(result?.borgoWalkStopsHash).toBe('a,b')
  })

  it('nessuna leg → null, mai un campo vuoto scritto per forza', () => {
    expect(computeBorgoWalkFields(itinerary({ legs: [] }))).toBeNull()
  })

  it('tappe diverse producono hash diversi, anche a parità di numero', () => {
    const a = computeBorgoWalkFields(itinerary())
    const b = computeBorgoWalkFields(itinerary({
      stops: [
        { id: 'c', name: 'Altro', lat: 3, lon: 3, source: 'archivio' },
        { id: 'd', name: 'Altro2', lat: 4, lon: 4, source: 'archivio' },
      ],
    }))
    expect(a?.borgoWalkStopsHash).not.toBe(b?.borgoWalkStopsHash)
  })

  it('itinerario a tappa unica → nessun confine di tappa da segnalare', () => {
    const result = computeBorgoWalkFields(itinerary({
      tappe: [{ stops: [{ id: 'a', name: 'Chiesa', lat: 1, lon: 1, source: 'archivio' }], legs: [], distanceM: 100, totalMinutes: 30, startPoint: { lat: 0, lon: 0 } }],
    }))
    expect(result?.borgoWalkTappaEnds).toBeUndefined()
  })

  it('itinerario su più tappe → un confine per ogni tappa tranne l\'ultima, nel punto del suo ultimo stop', () => {
    const stopA = { id: 'a', name: 'Chiesa', lat: 1, lon: 1, source: 'archivio' as const }
    const stopB = { id: 'b', name: 'Museo', lat: 2, lon: 2, source: 'wikipedia' as const }
    const stopC = { id: 'c', name: 'Castello', lat: 3, lon: 3, source: 'archivio' as const }
    const result = computeBorgoWalkFields(itinerary({
      tappe: [
        { stops: [stopA, stopB], legs: [], distanceM: 200, totalMinutes: 90, startPoint: { lat: 0, lon: 0 } },
        { stops: [stopC], legs: [], distanceM: 100, totalMinutes: 60, startPoint: { lat: 2, lon: 2 } },
      ],
    }))
    expect(result?.borgoWalkTappaEnds).toEqual([{ lat: 2, lon: 2 }])
  })
})

// Spaziatura di 0.0002° (~22m a lat 0) tra punti consecutivi: abbastanza vicini perché più di uno
// resti entro TAPPA_BOUNDARY_MATCH_RADIUS_M (80m) da un dato punto di query, così i test su
// fromIndex/raggio sono significativi (non solo "l'unico entro raggio esiste o no").
describe('nearestPolylineIndex', () => {
  const polyline: [number, number][] = [[0, 0], [0, 0.0002], [0, 0.0004], [0, 0.0006]]

  it('trova il punto più vicino entro il raggio', () => {
    expect(nearestPolylineIndex(polyline, { lat: 0, lon: 0.00043 })).toBe(2)
  })

  it('null se il più vicino resta comunque troppo lontano (itinerario probabilmente cambiato)', () => {
    expect(nearestPolylineIndex(polyline, { lat: 5, lon: 5 })).toBeNull()
  })

  it('fromIndex limita la ricerca in avanti, per trovare i confini in ordine', () => {
    // Il punto più vicino in assoluto è l'indice 0 (distanza zero), ma entrambi gli indici 2 e 3
    // restano comunque entro il raggio da qui: cercando da 2 in poi deve trovare il 2 (il più
    // vicino dei due), mai tornare allo 0 già superato.
    expect(nearestPolylineIndex(polyline, { lat: 0, lon: 0 }, 2)).toBe(2)
  })
})

describe('splitPolylineByTappaEnds', () => {
  const polyline: [number, number][] = [[0, 0], [0, 0.0002], [0, 0.0004], [0, 0.0006], [0, 0.0008]]

  it('nessun confine → un solo segmento con l\'intera polyline', () => {
    expect(splitPolylineByTappaEnds(polyline, undefined)).toEqual([polyline])
  })

  it('un confine → due segmenti che condividono il punto di confine (continuità, mai un salto)', () => {
    const segments = splitPolylineByTappaEnds(polyline, [{ lat: 0, lon: 0.0004 }])
    expect(segments).toEqual([
      [[0, 0], [0, 0.0002], [0, 0.0004]],
      [[0, 0.0004], [0, 0.0006], [0, 0.0008]],
    ])
  })

  it('confine non trovato entro il raggio → rinuncia a spezzare, un solo segmento', () => {
    expect(splitPolylineByTappaEnds(polyline, [{ lat: 9, lon: 9 }])).toEqual([polyline])
  })
})
