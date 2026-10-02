import { describe, it, expect } from 'vitest'
import { computeCamminoEscapeOptions } from '../cammini/escapeServices'
import { cumulativeM } from '../cammini/ahead'
import type { ServiceItem } from '../cammini/services'

const line: [number, number][] = [[0, 0], [0, 0.05]]
const total = cumulativeM(line)[1]
const s = (id: string, category: ServiceItem['category'], lon: number, lat = 0, name?: string): ServiceItem => ({ id, category, kind: category === 'lodging' ? 'Hotel' : 'Fermata bus', lat, lon, name, confidence: 'bassa' })

describe('computeCamminoEscapeOptions', () => {
  const base = { routePolyline: line, currentLat: 0, currentLon: 0.01, alongM: 1112, totalM: total }
  it('accorcia la tappa con il primo alloggio/trasporto davanti, sul percorso', () => {
    const o = computeCamminoEscapeOptions({ ...base, services: [s('behind', 'lodging', 0.005), s('a', 'transport', 0.03, 0, 'Bivio'), s('b', 'lodging', 0.04)] })
    expect(o[0].label).toBe('Accorcia la tappa: Bivio')
    expect(o[0].distanceM).toBeGreaterThan(2000)
    expect(o[0].reason).toContain('risparmi')
    expect(o[0].reason).toContain('non verificato')
  })
  it('propone dove dormire e come uscire', () => {
    const o = computeCamminoEscapeOptions({ ...base, services: [s('l', 'lodging', 0.012, 0, 'Casa'), s('t', 'transport', 0.015, 0.001, 'Piazza')] })
    const labels = o.map(x => x.label)
    expect(labels).toContain('Dormi a Casa')
    expect(labels.some(l => l.startsWith('Esci con il bus'))).toBe(true)
    expect(o.every(x => x.kind === 'safe_poi' && x.reason.length > 0)).toBe(true)
  })
  it('scarta quanto è oltre 5 km e senza servizi non propone nulla', () => {
    expect(computeCamminoEscapeOptions({ ...base, services: [s('x', 'lodging', 0.1)] }).filter(x => x.label.startsWith('Dormi'))).toHaveLength(0)
    expect(computeCamminoEscapeOptions({ ...base, services: [] })).toEqual([])
  })
})
