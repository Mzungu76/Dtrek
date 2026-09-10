import { describe, expect, it } from 'vitest'
import { normalizeDiaryOrder, MAX_VOLUMES_PER_COLLECTION } from '../normalizeDiaryOrder'

describe('normalizeDiaryOrder', () => {
  it('scarta valori non stringa e stringhe vuote', () => {
    expect(normalizeDiaryOrder(['d1', '', null, 42, undefined, 'd2'])).toEqual(['d1', 'd2'])
  })

  it('elimina i doppioni mantenendo la prima posizione', () => {
    expect(normalizeDiaryOrder(['d1', 'd2', 'd1'])).toEqual(['d1', 'd2'])
  })

  it('mantiene l\'ordine ricevuto', () => {
    expect(normalizeDiaryOrder(['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  it('taglia al tetto massimo di volumi', () => {
    const tanti = Array.from({ length: MAX_VOLUMES_PER_COLLECTION + 5 }, (_, i) => `d${i}`)
    const risultato = normalizeDiaryOrder(tanti)
    expect(risultato).toHaveLength(MAX_VOLUMES_PER_COLLECTION)
    expect(risultato).toEqual(tanti.slice(0, MAX_VOLUMES_PER_COLLECTION))
  })

  it('array vuoto → array vuoto', () => {
    expect(normalizeDiaryOrder([])).toEqual([])
  })
})
