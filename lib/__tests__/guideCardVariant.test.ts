import { describe, it, expect } from 'vitest'
import { borgoCardVariant, sitoCardFamily, metaEligibleForHikingScores } from '../guideCardVariant'

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

// piano guide-eccellenza §Fase 4 — confine esplicito di tipologia per CTS/Safety Score, in AND
// col controllo sui dati che ciascun chiamante fa già da sé (qui non ripetuto: questa funzione
// decide solo se la TIPOLOGIA è ammessa, non se i dati bastano).
describe('metaEligibleForHikingScores', () => {
  it('un Sentiero è sempre ammesso, anche senza traccia (inserito a mano, vedi app/upload/page.tsx)', () => {
    expect(metaEligibleForHikingScores({ metaType: 'sentiero' })).toBe(true)
    expect(metaEligibleForHikingScores({})).toBe(true) // assente ⇒ trattato come 'sentiero'
  })

  it('un Sito non è MAI ammesso, anche se acquisisce per errore una traccia GPS reale', () => {
    expect(metaEligibleForHikingScores({ metaType: 'sito' })).toBe(false)
    expect(metaEligibleForHikingScores({
      metaType: 'sito',
      trackPoints: [{ lat: 42, lon: 12 }, { lat: 42.01, lon: 12.01 }],
    })).toBe(false)
    expect(metaEligibleForHikingScores({
      metaType: 'sito',
      routePolyline: [[42, 12], [42.01, 12.01]],
    })).toBe(false)
  })

  it('un Borgo/Città è ammesso solo con una traccia GPS reale collegata (variante trekking_misto)', () => {
    expect(metaEligibleForHikingScores({ metaType: 'borgo_citta' })).toBe(false)
    expect(metaEligibleForHikingScores({
      metaType: 'borgo_citta',
      trackPoints: [{ lat: 42, lon: 12 }, { lat: 42.01, lon: 12.01 }],
    })).toBe(true)
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
