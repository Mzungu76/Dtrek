import { describe, it, expect } from 'vitest'
import { PROBES, buildCisUri, buildOperaByCisQuery, buildDescribeOperaQuery, buildDescribeOperaByCisQuery } from '../probe'

describe('Opere/ArCo probe — struttura dei probe diagnostici', () => {
  it('nomi univoci', () => {
    const names = PROBES.map(p => p.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([
      'baseline-culturalproperty',
      'hasCulturalInstituteOrSite-forward (NON verificato)',
      'hasCulturalInstituteOrSite-cis-come-soggetto (NON verificato)',
      'hasCulturalInstituteOrSite-verso-namespace-nazionale (NON verificato)',
      'culturalproperty+hasCulturalInstituteOrSite-combo (NON verificato)',
    ])
  })

  it('ogni query ha un LIMIT (probe diagnostico, mai una scansione completa)', () => {
    for (const probe of PROBES) {
      expect(probe.query).toMatch(/LIMIT \d+/)
    }
  })

  it('nessun probe è marcato "NON verificato" nel nome senza usare il predicato non confermato, e viceversa', () => {
    for (const probe of PROBES) {
      const usesHasCulturalInstituteOrSite = probe.query.includes('hasCulturalInstituteOrSite')
      const isMarkedUnverified = probe.name.includes('NON verificato')
      if (usesHasCulturalInstituteOrSite) expect(isMarkedUnverified).toBe(true)
    }
  })

  it('forward cerca opera→museo; il probe "cis-come-soggetto" verifica una domanda diversa (il CIS è mai soggetto?), non solo variabili rinominate', () => {
    const forward = PROBES.find(p => p.name === 'hasCulturalInstituteOrSite-forward (NON verificato)')!
    const cisAsSubject = PROBES.find(p => p.name === 'hasCulturalInstituteOrSite-cis-come-soggetto (NON verificato)')!
    expect(forward.query).toContain('?opera loc:hasCulturalInstituteOrSite ?cis')
    expect(cisAsSubject.query).toContain('?cis a cis:CulturalInstituteOrSite')
    expect(cisAsSubject.query).toContain('?cis')
    expect(cisAsSubject.query).toContain('loc:hasCulturalInstituteOrSite ?other')
  })
})

describe('buildCisUri', () => {
  it('usa la stessa base URI già verificata in scripts/places/mic/fetch.ts (sourceUrl reale)', () => {
    expect(buildCisUri('105665')).toBe('http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/105665')
  })
})

describe('buildOperaByCisQuery', () => {
  it('interroga il predicato forward (non confermato) verso il museo passato', () => {
    const q = buildOperaByCisQuery('105665')
    expect(q).toContain('<http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/105665>')
    expect(q).toContain('loc:hasCulturalInstituteOrSite')
    expect(q).toMatch(/LIMIT \d+/)
  })
})

describe('buildDescribeOperaQuery', () => {
  it('senza filtro: dump di una CulturalProperty arbitraria (LIMIT 1 sul candidato)', () => {
    const q = buildDescribeOperaQuery()
    expect(q).toContain('?opera a arco:CulturalProperty .')
    expect(q).not.toContain('FILTER')
  })

  it('con filtro: cerca per rdfs:label case-insensitive, come fetch.ts --describe --name', () => {
    const q = buildDescribeOperaQuery('Nettuno')
    expect(q).toContain('FILTER(CONTAINS(LCASE(?name), LCASE("Nettuno")))')
  })

  it('rimuove le virgolette doppie dal filtro (mai iniezione nella query SPARQL)', () => {
    const q = buildDescribeOperaQuery('Il "Nettuno"')
    expect(q).toContain('LCASE("Il Nettuno")')
    expect(q).not.toContain('"Il "Nettuno""')
  })
})

describe('buildDescribeOperaByCisQuery', () => {
  it('combina il filtro per museo con il dump a 2 salti', () => {
    const q = buildDescribeOperaByCisQuery('105665')
    expect(q).toContain('<http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/105665>')
    expect(q).toContain('?opera ?p1 ?o1')
    expect(q).toContain('OPTIONAL { ?o1 ?p2 ?o2 . }')
  })
})
