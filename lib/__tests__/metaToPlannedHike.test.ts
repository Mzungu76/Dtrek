import { describe, it, expect } from 'vitest'
import { metaSearchResultToPlannedHike } from '../metaToPlannedHike'
import type { MetaSearchResultItem } from '../metaSearch/types'

function item(overrides: Partial<MetaSearchResultItem>): MetaSearchResultItem {
  return {
    id: 'place-1', metaType: 'borgo_citta', name: 'Calcata', latitude: 42.2178, longitude: 12.4241,
    rankingScore: 1, sourceCount: 1, confidence: 1,
    ...overrides,
  }
}

describe('metaSearchResultToPlannedHike', () => {
  it('rifiuta un risultato sentiero — quel flusso resta invariato', () => {
    expect(() => metaSearchResultToPlannedHike(item({ metaType: 'sentiero' }))).toThrow()
  })

  it('porta nome, posizione e collegamento al place — nessuna metrica escursionistica fabbricata', () => {
    const hike = metaSearchResultToPlannedHike(item({ metaType: 'borgo_citta' }))
    expect(hike.title).toBe('Calcata')
    expect(hike.placeId).toBe('place-1')
    expect(hike.latitude).toBe(42.2178)
    expect(hike.longitude).toBe(12.4241)
    expect(hike.metaType).toBe('borgo_citta')
    expect(hike.distanceMeters).toBe(0)
    expect(hike.elevationGain).toBe(0)
    expect(typeof hike.id).toBe('string')
    expect(hike.id.length).toBeGreaterThan(0)
  })

  it('porta siteType per un sito', () => {
    const hike = metaSearchResultToPlannedHike(item({ metaType: 'sito', siteType: 'castello' }))
    expect(hike.siteType).toBe('castello')
  })

  it('usa municipality come zone quando presente, altrimenti province/region', () => {
    const withMunicipality = metaSearchResultToPlannedHike(item({ municipality: 'Calcata', province: 'Viterbo' }))
    expect(withMunicipality.zone).toBe('Calcata')
    const withoutMunicipality = metaSearchResultToPlannedHike(item({ province: 'Viterbo', region: 'Lazio' }))
    expect(withoutMunicipality.zone).toBe('Viterbo')
  })
})
