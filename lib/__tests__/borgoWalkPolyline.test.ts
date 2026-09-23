import { describe, it, expect } from 'vitest'
import { computeBorgoWalkFields } from '../borgoWalkPolyline'
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
})
