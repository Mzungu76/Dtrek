import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl } from '../officialUrl'

describe('normalizeSiteUrl', () => {
  it('lascia invariato un URL corretto', () => expect(normalizeSiteUrl('https://www.altaviadellegrazie.com/')).toBe('https://www.altaviadellegrazie.com/'))
  it('corregge il doppio protocollo', () => expect(normalizeSiteUrl('https://https//www.camminodellacqua.org')).toBe('https://www.camminodellacqua.org/'))
  it('toglie gli spazi codificati in coda', () => expect(normalizeSiteUrl('http://www.camminodellesettesorelle.it%20/')).toBe('http://www.camminodellesettesorelle.it/'))
  it('aggiunge https se manca il protocollo', () => expect(normalizeSiteUrl('www.esempio.it/cammino')).toBe('https://www.esempio.it/cammino'))
  it('scarta ciò che non è un sito web', () => {
    expect(normalizeSiteUrl('')).toBeNull()
    expect(normalizeSiteUrl(null)).toBeNull()
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSiteUrl('non un url')).toBeNull()
  })
})
