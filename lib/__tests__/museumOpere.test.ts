import { describe, it, expect } from 'vitest'
import { buildNearbyQuery, buildWorksQuery, nameTokenSimilarity, normalizeForComparison } from '../museumOpere'

describe('normalizeForComparison / nameTokenSimilarity', () => {
  it('stessa logica duplicata da scripts/places/normalize.ts — Jaccard sui token, robusta a ordine/accenti/maiuscole', () => {
    expect(nameTokenSimilarity('Museo Nazionale Etrusco', 'Museo Etrusco Nazionale')).toBe(1)
    expect(nameTokenSimilarity('Galleria Borghese', 'GALLERIA BORGHESE')).toBe(1)
  })

  it('verificato reale: "Museo civico archeologico e paleontologico di Macerata Feltria" -> "Museo civico archeologico e paleontologico" (0.63, 2026-09-27, sopra soglia)', () => {
    const score = nameTokenSimilarity(
      'Museo civico archeologico e paleontologico di Macerata Feltria',
      'Museo civico archeologico e paleontologico',
    )
    expect(score).toBeCloseTo(0.625, 2)
  })

  it('0 quando uno dei due nomi è vuoto dopo normalizzazione', () => {
    expect(nameTokenSimilarity('', 'Museo X')).toBe(0)
    expect(nameTokenSimilarity('***', 'Museo X')).toBe(0)
  })
})

describe('buildNearbyQuery', () => {
  it('usa wikibase:around con centro e raggio in km — stesso pattern già in produzione (scripts/places/wikidata/enrich.ts)', () => {
    const q = buildNearbyQuery(41.9, 12.5, 200)
    expect(q).toContain('wikibase:center "Point(12.5 41.9)"^^geo:wktLiteral')
    expect(q).toContain('wikibase:radius "0.200"')
    expect(q).toContain('SERVICE wikibase:label')
  })

  it('raggio personalizzabile', () => {
    expect(buildNearbyQuery(0, 0, 500)).toContain('wikibase:radius "0.500"')
  })
})

describe('buildWorksQuery', () => {
  it('usa P195/P276 (verificato reale: Galleria Borghese Q841506, 240 opere) filtrate per sottoclasse di opera d\'arte (Q838948) — fix dopo l\'anomalia mostra/esposizione trovata su P276 senza filtro', () => {
    const q = buildWorksQuery('Q841506')
    expect(q).toContain('?opera wdt:P195 wd:Q841506')
    expect(q).toContain('?opera wdt:P276 wd:Q841506')
    expect(q).toContain('?opera wdt:P31/wdt:P279* wd:Q838948')
    expect(q).toContain('wdt:P18')
    expect(q).toContain('wdt:P170')
    expect(q).toContain('wdt:P571')
    expect(q).toMatch(/LIMIT 24$/)
  })

  it('limit personalizzabile', () => {
    expect(buildWorksQuery('Q841506', 5)).toMatch(/LIMIT 5$/)
  })
})
