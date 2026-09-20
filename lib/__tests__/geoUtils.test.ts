import { describe, it, expect } from 'vitest'
import { simplifyPolyline } from '@/lib/geoUtils'

// 0.001° di latitudine ≈ 111m.
const D = 0.001

describe('simplifyPolyline', () => {
  it('con meno di 3 punti resta invariata', () => {
    const points: [number, number][] = [[0, 0], [D, 0]]
    expect(simplifyPolyline(points, 5)).toEqual(points)
  })

  it('rimuove i vertici collineari entro la tolleranza', () => {
    const points: [number, number][] = [[0, 0], [D, 0], [2 * D, 0], [3 * D, 0]]
    const result = simplifyPolyline(points, 5)
    expect(result).toEqual([[0, 0], [3 * D, 0]])
  })

  it('mantiene sempre il primo e l\'ultimo punto', () => {
    const points: [number, number][] = [[0, 0], [D, 0.00005], [2 * D, 0]]
    const result = simplifyPolyline(points, 1000)
    expect(result[0]).toEqual([0, 0])
    expect(result[result.length - 1]).toEqual([2 * D, 0])
  })

  it('mantiene un vertice che devia oltre la tolleranza dalla corda', () => {
    // Deviazione laterale di ~55m rispetto alla corda [0,0]-[2D,0] — ben sopra una tolleranza di 5m.
    const points: [number, number][] = [[0, 0], [D, D / 2], [2 * D, 0]]
    const result = simplifyPolyline(points, 5)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual([D, D / 2])
  })

  it('scarta un vertice che devia meno della tolleranza dalla corda', () => {
    // Deviazione laterale di pochi metri — sotto una tolleranza di 50m.
    const points: [number, number][] = [[0, 0], [D, 0.00002], [2 * D, 0]]
    const result = simplifyPolyline(points, 50)
    expect(result).toEqual([[0, 0], [2 * D, 0]])
  })
})
