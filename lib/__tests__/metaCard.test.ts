import { describe, it, expect } from 'vitest'
import { metaCardStats } from '../metaCard'
import type { MetaSearchResultItem } from '../metaSearch/types'

function item(overrides: Partial<MetaSearchResultItem>): MetaSearchResultItem {
  return {
    id: '1', metaType: 'sentiero', name: 'Test', latitude: 42, longitude: 12,
    rankingScore: 1, sourceCount: 1, confidence: 1,
    ...overrides,
  }
}

describe('metaCardStats — sentiero', () => {
  it('mostra solo le metriche valorizzate, nessun placeholder per quelle assenti', () => {
    const stats = metaCardStats(item({ metaType: 'sentiero', hikeStats: { distanceMeters: 5000 } }))
    expect(stats.map(s => s.key)).toEqual(['distance'])
    expect(stats[0].value).toBe('5.0 km')
  })

  it('nessun hikeStats → nessuna riga, mai "0 km / 0 m D+" (piano §24)', () => {
    const stats = metaCardStats(item({ metaType: 'sentiero' }))
    expect(stats).toEqual([])
  })

  it('tutte le metriche presenti → tutte le righe, nell\'ordine del piano §24', () => {
    const stats = metaCardStats(item({
      metaType: 'sentiero',
      hikeStats: { distanceMeters: 10000, elevationGain: 500, estimatedTimeSeconds: 14400, trailScore: 82 },
    }))
    expect(stats.map(s => s.key)).toEqual(['distance', 'elevation', 'duration', 'trailScore'])
  })
})

describe('metaCardStats — borgo_citta', () => {
  it('nessun dato di itinerario disponibile ancora (Blocco D) → array vuoto, non fabbricato', () => {
    const stats = metaCardStats(item({ metaType: 'borgo_citta' }))
    expect(stats).toEqual([])
  })
})

describe('metaCardStats — sito', () => {
  it('mostra la categoria quando siteType è presente', () => {
    const stats = metaCardStats(item({ metaType: 'sito', siteType: 'museo' }))
    expect(stats).toEqual([{ key: 'category', label: 'Categoria', value: 'Museo' }])
  })

  it('nessun siteType → nessuna riga categoria, mai un errore', () => {
    const stats = metaCardStats(item({ metaType: 'sito' }))
    expect(stats).toEqual([])
  })

  it('un sito non mostra mai metriche escursionistiche anche se hikeStats fosse presente per errore altrove', () => {
    const stats = metaCardStats(item({ metaType: 'sito', siteType: 'castello', hikeStats: { distanceMeters: 1000 } }))
    expect(stats.map(s => s.key)).not.toContain('distance')
  })
})
