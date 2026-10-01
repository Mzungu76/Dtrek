import { describe, it, expect } from 'vitest'
import { densifyPolyline, smooth, gainLoss, downsample } from '../cammini/elevation'

describe('elevazione tappa', () => {
  it('infittisce a passo ~100 m e conserva gli estremi', () => {
    const line: [number, number][] = [[42, 13], [42.01, 13]] // ~1.11 km
    const d = densifyPolyline(line, 100)
    expect(d.length).toBeGreaterThan(9)
    expect(d[0][2]).toBe(0)
    expect(d[d.length - 1][2]).toBeGreaterThan(1000)
    expect(d[d.length - 1][0]).toBeCloseTo(42.01, 6)
  })
  it('lisciare riduce il rumore e gainLoss somma salita e discesa', () => {
    const noisy = [100, 104, 100, 104, 100, 104, 100, 104]
    const s = smooth(noisy, 3)
    expect(gainLoss(s).gainM).toBeLessThan(gainLoss(noisy).gainM)
    expect(gainLoss([0, 10, 5, 20])).toEqual({ gainM: 25, lossM: 5, maxM: 20, minM: 0 })
  })
  it('downsample limita i punti mantenendo primo e ultimo', () => {
    const d = downsample(Array.from({ length: 1000 }, (_, i) => i), 50)
    expect(d).toHaveLength(50)
    expect(d[0]).toBe(0); expect(d[49]).toBe(999)
  })
})
