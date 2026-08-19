import { describe, it, expect } from 'vitest'
import { arrayMax, arrayMin } from '@/lib/arrayMinMax'

// DTREK-AUDIT.md P1 #16 — Math.max(...arr)/Math.min(...arr) lancia RangeError su un array
// abbastanza grande (una traccia GPS registrata a lungo, decine di migliaia di punti) perché lo
// spread passa un argomento per elemento, oltre il limite di argomenti del motore JS. Stesso bug
// già trovato una volta in produzione (components/RouteMap3D.tsx's seriesMax/seriesMin).
describe('arrayMax/arrayMin', () => {
  it('trova il massimo/minimo su un array normale', () => {
    expect(arrayMax([3, 7, 1, 9, 4])).toBe(9)
    expect(arrayMin([3, 7, 1, 9, 4])).toBe(1)
  })

  it('gestisce valori negativi', () => {
    expect(arrayMax([-5, -1, -9])).toBe(-1)
    expect(arrayMin([-5, -1, -9])).toBe(-9)
  })

  it('torna 0 su un array vuoto invece di -Infinity/Infinity', () => {
    expect(arrayMax([])).toBe(0)
    expect(arrayMin([])).toBe(0)
  })

  it('funziona su un singolo elemento', () => {
    expect(arrayMax([42])).toBe(42)
    expect(arrayMin([42])).toBe(42)
  })

  it('non lancia RangeError su un array molto grande dove Math.max(...arr) lo farebbe', () => {
    const huge = Array.from({ length: 200_000 }, (_, i) => i)
    expect(() => Math.max(...huge)).toThrow(RangeError)
    expect(arrayMax(huge)).toBe(199_999)
    expect(arrayMin(huge)).toBe(0)
  })
})
