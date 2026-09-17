import { describe, it, expect } from 'vitest'
import { PROBES } from '../mic/probe'

describe('MiC probe — struttura dei probe diagnostici', () => {
  it('include tutti i probe richiesti, nomi univoci', () => {
    const names = PROBES.map(p => p.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([
      'baseline-type',
      'cis:hasSite',
      'cis:siteAddress+clvapit:fullAddress',
      'clvapit:hasRegion',
      'clvapit:hasGeometry+lat/long',
      'cis:hasAddress (NON verificato)',
      'combo-candidati-lazio',
      'combo-candidati+tipo',
      'combo-produzione-completa',
      'combo-candidati-senza-filtro-regione',
      'combo-candidati-uguaglianza-regione',
      'tutta-italia-con-coordinate',
      'lista-regioni',
    ])
  })

  it('solo il probe dedicato usa cis:hasAddress (predicato non verificato)', () => {
    for (const probe of PROBES) {
      const usesHasAddress = probe.query.includes('cis:hasAddress')
      expect(usesHasAddress).toBe(probe.name === 'cis:hasAddress (NON verificato)')
    }
  })

  it('i probe verificati non contengono predicati dedotti dalla sola documentazione CulturalON', () => {
    const verified = PROBES.filter(p => p.name !== 'cis:hasAddress (NON verificato)')
    const unverifiedPredicates = /cis:hasAddress|cis:hasGeographicalLocation|cis:Geometry\b|cis:hasLat|cis:hasLong|cis:adminUnitL2|cis:fullAddress|cis:name\b/
    for (const probe of verified) {
      expect(probe.query).not.toMatch(unverifiedPredicates)
    }
  })

  it('ogni query ha un LIMIT (probe diagnostico, mai una scansione completa)', () => {
    for (const probe of PROBES) {
      expect(probe.query).toMatch(/LIMIT \d+/)
    }
  })
})
