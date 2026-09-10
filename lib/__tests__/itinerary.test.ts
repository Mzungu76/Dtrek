import { describe, it, expect } from 'vitest'
import { generateItinerary, type ItineraryStop } from '../itinerary'

// Calcata (Comune reale, piano §26 la usa come esempio) — coordinate di fantasia ravvicinate per
// test deterministici, non le coordinate reali del borgo.
const START = { latitude: 42.2178, longitude: 12.4241 }

function stop(id: string, latOffset: number, lonOffset: number): ItineraryStop {
  return { id, name: id, latitude: START.latitude + latOffset, longitude: START.longitude + lonOffset }
}

describe('generateItinerary', () => {
  it('nessuna tappa → itinerario vuoto, mai un errore', () => {
    const result = generateItinerary({ start: START, stops: [] })
    expect(result.stops).toEqual([])
    expect(result.totalDistanceMeters).toBe(0)
    expect(result.omittedStopIds).toEqual([])
  })

  it('senza limite di tempo → include tutte le tappe (itinerario libero, piano §25)', () => {
    const stops = [stop('a', 0.001, 0), stop('b', 0.002, 0), stop('c', 0.0005, 0.001)]
    const result = generateItinerary({ start: START, stops })
    expect(result.stops).toHaveLength(3)
    expect(result.omittedStopIds).toEqual([])
  })

  it('ordina per prossimità (nearest-neighbor), non nell\'ordine di input', () => {
    // 'far' è la più lontana, deve finire per ultima anche se è la prima nell'array di input
    const far = stop('far', 0.01, 0.01)
    const near = stop('near', 0.0005, 0)
    const result = generateItinerary({ start: START, stops: [far, near] })
    expect(result.stops.map(s => s.id)).toEqual(['near', 'far'])
  })

  it('un budget di tempo insufficiente tronca l\'itinerario invece di sforare (piano §19)', () => {
    const stops = [stop('a', 0.001, 0), stop('b', 0.002, 0), stop('c', 0.003, 0)]
    const result = generateItinerary({ start: START, stops, timeAvailable: '30min', visitMinutesPerStop: 25 })
    // con 25min di visita a tappa e un budget di 30min, al massimo una tappa può rientrare
    expect(result.stops.length).toBeLessThan(3)
    expect(result.estimatedTimeSeconds).toBeLessThanOrEqual(30 * 60)
    expect(result.omittedStopIds.length).toBeGreaterThan(0)
  })

  it('distanza e tempo cumulativi crescono monotonicamente lungo l\'itinerario', () => {
    const stops = [stop('a', 0.001, 0), stop('b', 0.002, 0.001), stop('c', 0.0005, 0.002)]
    const result = generateItinerary({ start: START, stops })
    for (let i = 1; i < result.stops.length; i++) {
      expect(result.stops[i].cumulativeDistanceMeters).toBeGreaterThan(result.stops[i - 1].cumulativeDistanceMeters)
      expect(result.stops[i].cumulativeTimeSeconds).toBeGreaterThan(result.stops[i - 1].cumulativeTimeSeconds)
    }
  })

  it('numera le tappe da 1 in ordine di visita', () => {
    const stops = [stop('a', 0.001, 0), stop('b', 0.002, 0)]
    const result = generateItinerary({ start: START, stops })
    expect(result.stops.map(s => s.order)).toEqual([1, 2])
  })
})
