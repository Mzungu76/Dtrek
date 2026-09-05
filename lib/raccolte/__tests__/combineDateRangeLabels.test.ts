import { describe, expect, it } from 'vitest'
import { combineDateRangeLabels } from '../combineDateRangeLabels'

describe('combineDateRangeLabels', () => {
  it('nessuna etichetta → undefined (raccolta senza volumi con Reportage)', () => {
    expect(combineDateRangeLabels([])).toBeUndefined()
    expect(combineDateRangeLabels([undefined, undefined])).toBeUndefined()
  })

  it('un solo anno, ripetuto in più volumi, resta un anno solo', () => {
    expect(combineDateRangeLabels(['2026', '2026'])).toBe('2026')
  })

  it('anni diversi diventano l\'intervallo completo, non solo min/max dei singoli volumi', () => {
    expect(combineDateRangeLabels(['2024', '2026'])).toBe('2024–2026')
  })

  it('un volume con già un intervallo (anno–anno) allarga il range complessivo', () => {
    expect(combineDateRangeLabels(['2024–2025', '2026'])).toBe('2024–2026')
  })

  it('ignora le etichette assenti (volume senza Reportage) tra quelle presenti', () => {
    expect(combineDateRangeLabels(['2025', undefined, '2026'])).toBe('2025–2026')
  })
})
