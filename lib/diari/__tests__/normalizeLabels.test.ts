import { describe, expect, it } from 'vitest'
import { normalizeLabels, MAX_LABELS, MAX_LABEL_LENGTH } from '../normalizeLabels'

describe('normalizeLabels', () => {
  it('toglie gli spazi ai bordi', () => {
    expect(normalizeLabels(['  Natura  '])).toEqual(['Natura'])
  })

  it('scarta le stringhe vuote (anche solo spazi)', () => {
    expect(normalizeLabels(['', '   ', 'Urbano'])).toEqual(['Urbano'])
  })

  it('elimina i doppioni esatti, mantenendo la prima occorrenza', () => {
    expect(normalizeLabels(['Natura', 'Urbano', 'Natura'])).toEqual(['Natura', 'Urbano'])
  })

  it('un\'etichetta più lunga del limite viene scartata, non troncata', () => {
    const lunga = 'a'.repeat(MAX_LABEL_LENGTH + 1)
    expect(normalizeLabels([lunga, 'ok'])).toEqual(['ok'])
  })

  it('un\'etichetta esattamente al limite resta', () => {
    const alLimite = 'a'.repeat(MAX_LABEL_LENGTH)
    expect(normalizeLabels([alLimite])).toEqual([alLimite])
  })

  it('taglia all\'ottava etichetta, non ne scarta una a caso', () => {
    const tante = Array.from({ length: MAX_LABELS + 3 }, (_, i) => `l${i}`)
    const risultato = normalizeLabels(tante)
    expect(risultato).toHaveLength(MAX_LABELS)
    expect(risultato).toEqual(tante.slice(0, MAX_LABELS))
  })

  it('array vuoto → array vuoto', () => {
    expect(normalizeLabels([])).toEqual([])
  })
})
