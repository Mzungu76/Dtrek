import { describe, it, expect } from 'vitest'
import { borgoCardVariant, sitoCardFamily } from '../guideCardVariant'

describe('borgoCardVariant', () => {
  it('nessuna traccia → cammino_urbano', () => {
    expect(borgoCardVariant({})).toBe('cammino_urbano')
    expect(borgoCardVariant({ trackPoints: [] })).toBe('cammino_urbano')
    expect(borgoCardVariant({ trackPoints: [{ lat: 42, lon: 12 }] })).toBe('cammino_urbano') // un solo punto non è una traccia
  })

  it('traccia GPS reale (trackPoints o routePolyline con almeno 2 punti) → trekking_misto', () => {
    expect(borgoCardVariant({ trackPoints: [{ lat: 42, lon: 12 }, { lat: 42.01, lon: 12.01 }] })).toBe('trekking_misto')
    expect(borgoCardVariant({ routePolyline: [[42, 12], [42.01, 12.01]] })).toBe('trekking_misto')
  })
})

describe('sitoCardFamily', () => {
  it('tipi sempre naturali → galleria_sicurezza indipendentemente dai dati di visita', () => {
    for (const t of ['cascata', 'grotta', 'belvedere', 'area_naturale'] as const) {
      expect(sitoCardFamily(t, true)).toBe('galleria_sicurezza')
      expect(sitoCardFamily(t, false)).toBe('galleria_sicurezza')
    }
  })

  it('tipi "con orario" fissi → scheda_pratica indipendentemente dai dati di visita', () => {
    for (const t of ['museo', 'chiesa', 'abbazia', 'palazzo', 'teatro'] as const) {
      expect(sitoCardFamily(t, true)).toBe('scheda_pratica')
      expect(sitoCardFamily(t, false)).toBe('scheda_pratica')
    }
  })

  it('tipi ambigui (sito_archeologico/castello/monumento) seguono hasVisitInfo', () => {
    for (const t of ['sito_archeologico', 'castello', 'monumento'] as const) {
      expect(sitoCardFamily(t, true)).toBe('scheda_pratica')
      expect(sitoCardFamily(t, false)).toBe('galleria_sicurezza')
    }
  })

  it('siteType assente o "altro" → scheda_pratica di default', () => {
    expect(sitoCardFamily(undefined, false)).toBe('scheda_pratica')
    expect(sitoCardFamily('altro', false)).toBe('scheda_pratica')
  })
})
