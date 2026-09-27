import { describe, it, expect } from 'vitest'
import { buildNearbyQuery, buildWorksQuery, nameTokenSimilarity, normalizeForComparison, dedupeByWikidataId } from '../museumOpere'
import type { MuseumOpera } from '../museumOpere'

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
  })

  it('DISTINCT ?opera nella sotto-query, PRIMA del LIMIT — fix bug segnalato dal vivo (2026-09-27, museo di Gubbio, 4 card identiche per la stessa opera): senza, un\'opera che soddisfa sia P195 sia P276 viene contata due volte dalla UNION', () => {
    const q = buildWorksQuery('Q841506')
    expect(q).toContain('SELECT DISTINCT ?opera WHERE')
    // Il LIMIT deve stare DENTRO la sotto-query (dopo DISTINCT, prima dei JOIN OPTIONAL esterni) —
    // altrimenti tronca su righe già duplicate, restituendo meno opere distinte del richiesto.
    const distinctIdx = q.indexOf('SELECT DISTINCT ?opera')
    const limitIdx = q.indexOf('LIMIT')
    const optionalIdx = q.indexOf('OPTIONAL')
    expect(limitIdx).toBeGreaterThan(distinctIdx)
    expect(limitIdx).toBeLessThan(optionalIdx)
  })

  it('limit personalizzabile', () => {
    expect(buildWorksQuery('Q841506', 5)).toContain('LIMIT 5')
  })
})

describe('dedupeByWikidataId', () => {
  it('tiene solo la prima occorrenza per wikidataId — difesa in profondità oltre al DISTINCT (un\'opera con più autori/immagini produce righe multiple nel join OPTIONAL esterno)', () => {
    const opere: MuseumOpera[] = [
      { title: 'Madonna col bambino', creator: 'Benedetto Nucci', wikidataId: 'Q123' },
      { title: 'Madonna col bambino', creator: 'Benedetto Nucci', wikidataId: 'Q123' },
      { title: 'Madonna col bambino', creator: 'Altro Autore', wikidataId: 'Q123' },
      { title: 'Altra opera', wikidataId: 'Q456' },
    ]
    const result = dedupeByWikidataId(opere)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ title: 'Madonna col bambino', creator: 'Benedetto Nucci', wikidataId: 'Q123' })
    expect(result[1].wikidataId).toBe('Q456')
  })

  it('lista vuota → lista vuota', () => {
    expect(dedupeByWikidataId([])).toEqual([])
  })
})
