import { describe, expect, it } from 'vitest'
import { trimHomeStart } from '../trimHomeStart'

const HOME = { lat: 41.9, lon: 12.5 }

// ~0.009° di latitudine ≈ 1 km — comodo per costruire punti dentro/fuori un raggio di 1 km senza
// calcolare l'haversine a mano.
const NEAR_HOME: [number, number] = [41.9005, 12.5]   // ~55 m da casa
const FAR_1: [number, number] = [41.95, 12.5]         // lontano
const FAR_2: [number, number] = [42.0, 12.6]          // lontano, diverso dal primo

describe('trimHomeStart', () => {
  it('senza un punto di casa, la traccia resta invariata', () => {
    const polyline = [NEAR_HOME, FAR_1, FAR_2]
    expect(trimHomeStart(polyline, null)).toBe(polyline)
  })

  it('una traccia già lontana da casa fin dal primo punto resta invariata', () => {
    const polyline = [FAR_1, FAR_2]
    expect(trimHomeStart(polyline, HOME)).toEqual(polyline)
  })

  it('taglia i punti iniziali vicini a casa, mantiene il resto', () => {
    const polyline = [NEAR_HOME, NEAR_HOME, FAR_1, FAR_2]
    expect(trimHomeStart(polyline, HOME)).toEqual([FAR_1, FAR_2])
  })

  it('un anello che torna a casa viene tagliato anche in coda', () => {
    const polyline = [NEAR_HOME, FAR_1, FAR_2, NEAR_HOME]
    expect(trimHomeStart(polyline, HOME)).toEqual([FAR_1, FAR_2])
  })

  it('una traccia interamente dentro il raggio di casa non sparisce', () => {
    const polyline = [NEAR_HOME, NEAR_HOME, NEAR_HOME]
    expect(trimHomeStart(polyline, HOME)).toBe(polyline)
  })

  it('con meno di due punti non c\'è nulla da tagliare', () => {
    const polyline: [number, number][] = [NEAR_HOME]
    expect(trimHomeStart(polyline, HOME)).toBe(polyline)
  })

  it('il raggio è configurabile', () => {
    // NEAR_HOME è a ~55 m: con un raggio di 10 m non viene considerato "vicino a casa".
    const polyline = [NEAR_HOME, FAR_1]
    expect(trimHomeStart(polyline, HOME, 0.01)).toEqual(polyline)
  })
})
