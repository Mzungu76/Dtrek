import { describe, it, expect } from 'vitest'
import { classifyService, parseServices, buildServicesQuery } from '../cammini/services'
import { placeServices, nextOfCategory, serviceGaps, waterAdvice, countByCategory } from '../cammini/serviceGaps'
import { cumulativeM } from '../cammini/ahead'
import type { ServiceItem } from '../cammini/services'

describe('classifyService', () => {
  it('riconosce le categorie dai tag OSM', () => {
    expect(classifyService({ amenity: 'drinking_water' })?.category).toBe('water')
    expect(classifyService({ amenity: 'fountain' })).toBeNull()
    expect(classifyService({ amenity: 'fountain', drinking_water: 'yes' })?.category).toBe('water')
    expect(classifyService({ natural: 'spring' })).toBeNull()
    expect(classifyService({ tourism: 'hostel', hostel: 'pilgrim' })).toEqual({ category: 'lodging', kind: 'Ostello del pellegrino' })
    expect(classifyService({ shop: 'bakery' })?.category).toBe('shop')
    expect(classifyService({ amenity: 'cafe' })?.category).toBe('food')
    expect(classifyService({ railway: 'station' })?.category).toBe('transport')
    expect(classifyService({ highway: 'bus_stop' })?.kind).toBe('Fermata bus')
    expect(classifyService({ shop: 'clothes' })).toBeNull()
  })
})

describe('parseServices', () => {
  it('legge nodi e way con center, scarta il resto, dichiara l\'affidabilità', () => {
    const year = new Date().getFullYear()
    const r = parseServices([
      { type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'drinking_water' } },
      { type: 'way', id: 2, center: { lat: 3, lon: 4 }, tags: { tourism: 'hotel', name: 'Hotel X', phone: '1', website: 'w' } },
      { type: 'node', id: 3, lat: 5, lon: 6, tags: { shop: 'bakery', name: 'Forno', check_date: `${year}-01-01` } },
      { type: 'node', id: 4, lat: 7, lon: 8, tags: { shop: 'clothes' } },
      { type: 'way', id: 5, tags: { tourism: 'hotel' } },
    ])
    expect(r.map(s => s.id)).toEqual(['node/1', 'way/2', 'node/3'])
    expect(r[0].confidence).toBe('bassa')
    expect(r[1].confidence).toBe('media')
    expect(r[2].confidence).toBe('alta')
    expect(r[2].checkDate).toBe(`${year}-01-01`)
  })
  it('la query contiene il riquadro', () => {
    expect(buildServicesQuery('1,2,3,4')).toContain('(1,2,3,4)')
  })
})

const line: [number, number][] = [[0, 0], [0, 0.05]] // ~5,6 km verso est
const total = cumulativeM(line)[1]
const svc = (id: string, category: ServiceItem['category'], lon: number, lat = 0): ServiceItem => ({ id, category, kind: 'x', lat, lon, confidence: 'media' })

describe('placeServices / nextOfCategory / waterAdvice', () => {
  const placed = placeServices([svc('w2', 'water', 0.04), svc('w1', 'water', 0.01), svc('l', 'lodging', 0.03), svc('far', 'food', 0.02, 0.02)], line, total)
  it('ordina lungo la traccia e scarta i lontani', () => {
    expect(placed.map(p => p.service.id)).toEqual(['w1', 'l', 'w2'])
  })
  it('prossimo di una categoria', () => {
    const n = nextOfCategory(placed, 'water', 1500)!
    expect(n.service.id).toBe('w2')
    expect(nextOfCategory(placed, 'food', 0)).toBeNull()
  })
  it('acqua: prossima e tratto dopo', () => {
    const a = waterAdvice(placed, 0, total)
    expect(a.nextM).toBeGreaterThan(1000)
    expect(a.gapAfterM).toBeGreaterThan(3000) // fino alla seconda acqua
    const last = waterAdvice(placed, 4600, total)
    expect(last.nextM).toBeNull()
    const before = waterAdvice(placed, 3000, total)
    expect(before.gapAfterM).toBeCloseTo(total - placed[2].alongM, 0) // l'ultima acqua: poi fino all'arrivo
  })
})

describe('serviceGaps / countByCategory', () => {
  const placed = placeServices([svc('a', 'shop', 0.01), svc('b', 'food', 0.04)], line, total)
  it('tratti senza servizi con partenza e arrivo', () => {
    const g = serviceGaps(placed, ['food', 'shop', 'water'], total, 2000)
    expect(g).toHaveLength(1)
    expect(g[0].lengthM).toBeGreaterThan(3000)
    expect(serviceGaps(placed, ['food', 'shop'], total, 500).length).toBe(3)
  })
  it('conteggi', () => {
    expect(countByCategory(placed)).toEqual([{ category: 'shop', count: 1 }, { category: 'food', count: 1 }])
  })
})

describe('servicesAlongTrack', () => {
  it('tiene i servizi entro il raggio con la distanza, dal più vicino', async () => {
    const { servicesAlongTrack } = await import('../cammini/services')
    const track: [number, number][] = [[0, 0], [0, 0.02]]
    const els = [
      { type: 'node', id: 1, lat: 0.003, lon: 0.01, tags: { amenity: 'drinking_water' } }, // ~330 m
      { type: 'node', id: 2, lat: 0.0005, lon: 0.005, tags: { amenity: 'pharmacy' } },     // ~55 m
      { type: 'node', id: 3, lat: 0.02, lon: 0.01, tags: { amenity: 'cafe' } },            // ~2,2 km: fuori
    ]
    const r = servicesAlongTrack(els, track, 600)
    expect(r.map(s => s.id)).toEqual(['node/2', 'node/1'])
    expect(r[0].distFromTrack).toBeLessThan(100)
  })
})
