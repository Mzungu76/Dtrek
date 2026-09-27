import { describe, it, expect } from 'vitest'
import { buildSearchUrl, buildWorksCountQuery, buildWorksSampleQuery } from '../probe'

describe('buildSearchUrl', () => {
  it('usa wbsearchentities (API REST, non SPARQL) — lezione pagata dal vivo: CONTAINS/LCASE su rdfs:label in SPARQL va in timeout su Wikidata (2026-09-27)', () => {
    const url = buildSearchUrl('Galleria Borghese')
    expect(url).toContain('https://www.wikidata.org/w/api.php')
    expect(url).toContain('action=wbsearchentities')
    expect(url).toContain('search=Galleria%20Borghese')
    expect(url).toContain('language=it')
    expect(url).toContain('type=item')
  })

  it('lingua personalizzabile', () => {
    expect(buildSearchUrl('Uffizi', 'en')).toContain('language=en')
  })
})

describe('buildWorksCountQuery', () => {
  it('usa P195 (collezione) e P276 (ubicazione) insieme, con DISTINCT — verificato reale su Q841506 (Galleria Borghese, 240 opere, 2026-09-27)', () => {
    const q = buildWorksCountQuery('Q841506')
    expect(q).toContain('?opera wdt:P195 wd:Q841506')
    expect(q).toContain('?opera wdt:P276 wd:Q841506')
    expect(q).toContain('COUNT(DISTINCT ?opera)')
  })
})

describe('buildWorksSampleQuery', () => {
  it('include titolo (SERVICE wikibase:label), immagine (P18), autore (P170), anno (P571)', () => {
    const q = buildWorksSampleQuery('Q841506')
    expect(q).toContain('wdt:P18')
    expect(q).toContain('wdt:P170')
    expect(q).toContain('wdt:P571')
    expect(q).toContain('SERVICE wikibase:label')
    expect(q).toMatch(/LIMIT 10$/)
  })

  it('limit personalizzabile', () => {
    expect(buildWorksSampleQuery('Q841506', 5)).toMatch(/LIMIT 5$/)
  })
})
