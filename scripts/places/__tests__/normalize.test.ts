import { describe, it, expect } from 'vitest'
import { isPlausibleItalianCoordinate, normalizeForComparison, nameTokenSimilarity, sameMunicipality } from '../normalize'

describe('isPlausibleItalianCoordinate', () => {
  it('accetta un punto reale in Italia', () => {
    expect(isPlausibleItalianCoordinate(41.9, 12.5)).toBe(true) // Roma
  })
  it('rifiuta un punto fuori dal bbox italiano', () => {
    expect(isPlausibleItalianCoordinate(40.7, -74.0)).toBe(false) // New York
  })
  it('rifiuta NaN/Infinity', () => {
    expect(isPlausibleItalianCoordinate(NaN, 12.5)).toBe(false)
    expect(isPlausibleItalianCoordinate(41.9, Infinity)).toBe(false)
  })
})

describe('normalizeForComparison', () => {
  it('minuscolo, senza accenti, punteggiatura ridotta a spazio, spazi collassati', () => {
    expect(normalizeForComparison('Ábbazia   di  Farfa!!')).toBe('abbazia di farfa')
  })
  it('è idempotente su una stringa già normalizzata', () => {
    const s = 'castello orsini'
    expect(normalizeForComparison(s)).toBe(s)
  })
})

describe('nameTokenSimilarity', () => {
  it('nomi identici → 1', () => {
    expect(nameTokenSimilarity('Museo Etrusco', 'Museo Etrusco')).toBe(1)
  })
  it('stesse parole in ordine diverso → 1', () => {
    expect(nameTokenSimilarity('Museo Nazionale Etrusco', 'Museo Etrusco Nazionale')).toBe(1)
  })
  it('nomi completamente diversi → 0', () => {
    expect(nameTokenSimilarity('Castello Orsini', 'Cascata delle Marmore')).toBe(0)
  })
  it('sovrapposizione parziale → tra 0 e 1', () => {
    const score = nameTokenSimilarity('Abbazia di Farfa', 'Abbazia di Fossanova')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })
  it('stringa vuota → 0, mai un errore', () => {
    expect(nameTokenSimilarity('', 'Museo Etrusco')).toBe(0)
    expect(nameTokenSimilarity('   ', 'Museo Etrusco')).toBe(0)
  })
})

describe('sameMunicipality', () => {
  it('stesso Comune, maiuscole/accenti diversi → true', () => {
    expect(sameMunicipality('Viterbo', 'VITERBO')).toBe(true)
    expect(sameMunicipality('Città della Pieve', 'citta della pieve')).toBe(true)
  })
  it('Comuni diversi → false', () => {
    expect(sameMunicipality('Viterbo', 'Bracciano')).toBe(false)
  })
  it('assente su un lato → false, non un errore', () => {
    expect(sameMunicipality(undefined, 'Viterbo')).toBe(false)
    expect(sameMunicipality('Viterbo', null)).toBe(false)
  })
})
