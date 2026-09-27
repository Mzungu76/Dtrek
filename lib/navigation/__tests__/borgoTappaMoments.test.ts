import { describe, it, expect } from 'vitest'
import { buildTappaEndMoments } from '../borgoTappaMoments'

// Stessa spaziatura di lib/__tests__/borgoWalkPolyline.test.ts (0.0002° ≈ 22m a lat 0) — abbastanza
// vicina da restare entro il raggio di match, abbastanza larga da distinguere i punti tra loro.
const polyline: [number, number][] = [[0, 0], [0, 0.0002], [0, 0.0004], [0, 0.0006], [0, 0.0008]]

describe('buildTappaEndMoments', () => {
  it('nessun confine → nessun moment', () => {
    expect(buildTappaEndMoments(polyline, undefined)).toEqual([])
    expect(buildTappaEndMoments(polyline, [])).toEqual([])
  })

  it('un confine → un moment kind tappa_end, con indice e conteggio corretti', () => {
    const moments = buildTappaEndMoments(polyline, [{ lat: 0, lon: 0.0004 }])
    expect(moments).toHaveLength(1)
    expect(moments[0].kind).toBe('tappa_end')
    expect(moments[0].tappaIndex).toBe(0)
    expect(moments[0].tappaCount).toBe(2)
    expect(moments[0].text).toContain('Tappa 1 di 2')
  })

  it('la distanza lungo il percorso del moment corrisponde al punto trovato sulla polyline', () => {
    const moments = buildTappaEndMoments(polyline, [{ lat: 0, lon: 0.0004 }])
    // Indice 2 su 5 punti equispaziati di ~22.24m ciascuno (haversine reale, non un valore fisso).
    expect(moments[0].distanceAlongRouteM).toBeGreaterThan(40)
    expect(moments[0].distanceAlongRouteM).toBeLessThan(50)
  })

  it('due confini → due moment in ordine, tappaCount coerente con tre tappe totali', () => {
    const moments = buildTappaEndMoments(polyline, [{ lat: 0, lon: 0.0002 }, { lat: 0, lon: 0.0006 }])
    expect(moments).toHaveLength(2)
    expect(moments.map(m => m.tappaIndex)).toEqual([0, 1])
    expect(moments.every(m => m.tappaCount === 3)).toBe(true)
  })

  it('un confine troppo lontano dalla polyline viene scartato, non piazzato alla meno peggio', () => {
    const moments = buildTappaEndMoments(polyline, [{ lat: 9, lon: 9 }])
    expect(moments).toEqual([])
  })

  it('polyline troppo corta → nessun moment', () => {
    expect(buildTappaEndMoments([[0, 0]], [{ lat: 0, lon: 0 }])).toEqual([])
  })
})
