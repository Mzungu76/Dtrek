import { describe, it, expect } from 'vitest'
import { poisAhead, etaAtDistance, delayVsPlanMin, cumulativeM } from '../cammini/ahead'
import type { PoiItem } from '../overpass'

// Linea di ~3,3 km verso est lungo l'equatore (0,03° ≈ 3340 m).
const line: [number, number][] = [[0, 0], [0, 0.01], [0, 0.02], [0, 0.03]]
const poi = (id: number, lon: number, lat = 0): PoiItem => ({ id, type: 'spring', lat, lon, distFromTrack: 0 })

describe('poisAhead', () => {
  const total = cumulativeM(line)[3]
  it('ordina per distanza lungo la traccia e scarta i luoghi già superati', () => {
    const r = poisAhead([poi(1, 0.025), poi(2, 0.005), poi(3, 0.015)], line, 1000, total)
    expect(r.map(x => x.poi.id)).toEqual([3, 1])
    expect(r[0].distanceM).toBeGreaterThan(600)
    expect(r[0].distanceM).toBeLessThan(750)
  })
  it('scarta i luoghi lontani dalla traccia', () => {
    expect(poisAhead([poi(1, 0.02, 0.01)], line, 0, total)).toHaveLength(0)
    expect(poisAhead([poi(1, 0.02, 0.002)], line, 0, total)[0].offRouteM).toBeGreaterThan(200)
  })
  it('tollera un luogo appena superato', () => {
    expect(poisAhead([poi(1, 0.0099)], line, 1112, total)[0].distanceM).toBe(0)
  })
  it('rispetta il limite e una traccia vuota', () => {
    expect(poisAhead([poi(1, 0.01), poi(2, 0.02), poi(3, 0.03)], line, 0, total, { limit: 2 })).toHaveLength(2)
    expect(poisAhead([poi(1, 0.01)], [[0, 0]], 0, 0)).toEqual([])
  })
})

describe('etaAtDistance / delayVsPlanMin', () => {
  it('proporzionale al tempo che resta', () => {
    const now = new Date('2026-05-10T10:00:00Z')
    expect(etaAtDistance(500, 2000, 3600, now)?.toISOString()).toBe('2026-05-10T10:15:00.000Z')
    expect(etaAtDistance(5000, 2000, 3600, now)?.toISOString()).toBe('2026-05-10T11:00:00.000Z')
    expect(etaAtDistance(500, 0, 3600, now)).toBeNull()
    expect(etaAtDistance(500, 2000, null, now)).toBeNull()
  })
  it('scarto dal piano in minuti', () => {
    // piano: 10 km a 1,25 m/s = 8000 s; fatti 3000 s e ne restano 5600 → +600 s = 10 min di ritardo
    expect(delayVsPlanMin(3000, 5600, 10000, 1.25)).toBe(10)
    expect(delayVsPlanMin(3000, 4400, 10000, 1.25)).toBe(-10)
    expect(delayVsPlanMin(3000, null, 10000, 1.25)).toBeNull()
    expect(delayVsPlanMin(3000, 5000, 10000, null)).toBeNull()
  })
})
