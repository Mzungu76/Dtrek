import { describe, it, expect } from 'vitest'
import { poisAlongTappa } from '../cammini/tappaPois'
import type { PoiItem } from '../overpass'

const points: [number, number, number][] = [[42, 13, 500], [42.01, 13, 520], [42.02, 13, 540], [42.03, 13, 560]]
const profile: [number, number][] = [[0, 500], [1100, 520], [2200, 540], [3300, 560]]
const poi = (id: number, lat: number): PoiItem => ({ id, type: 'chapel', lat, lon: 13.0001, distFromTrack: 8, name: `P${id}` })

describe('luoghi lungo la tappa', () => {
  it('km progressivi e ordine di cammino', () => {
    const r = poisAlongTappa([poi(2, 42.029), poi(1, 42.011)], points, profile, false)
    expect(r.map(x => x.poi.id)).toEqual([1, 2])
    expect(r[0].km).toBeCloseTo(1.1, 1)
    expect(r[1].km).toBeCloseTo(3.3, 1)
  })
  it('nel verso inverso si conta dall\'altra estremità e l\'ordine si ribalta', () => {
    const r = poisAlongTappa([poi(1, 42.011), poi(2, 42.029)], points, profile, true)
    expect(r.map(x => x.poi.id)).toEqual([2, 1])
    expect(r[0].km).toBeCloseTo(0, 1)
    expect(r[1].km).toBeCloseTo(2.2, 1)
  })
  it('senza profilo coerente non inventa nulla', () => {
    expect(poisAlongTappa([poi(1, 42)], points, [[0, 1]], false)).toEqual([])
  })
})
