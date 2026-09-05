import { describe, it, expect } from 'vitest'
import { metaCardStats, metaRowLocationStats, type MetaRowLocation } from '../metaCard'
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

function row(overrides: Partial<MetaRowLocation>): MetaRowLocation {
  return { metaType: 'borgo_citta', siteType: null, municipality: null, region: null, ...overrides }
}

describe('metaRowLocationStats — slot metriche adattivo per la riga elenco Mete', () => {
  it('un sentiero non mostra mai comune/regione qui: le sue metriche sono quelle escursionistiche, rese altrove', () => {
    const stats = metaRowLocationStats(row({ metaType: 'sentiero', municipality: 'Viterbo', region: 'Lazio' }))
    expect(stats).toEqual([])
  })

  it('borgo_citta con comune e regione → una riga "Luogo" con entrambi', () => {
    const stats = metaRowLocationStats(row({ metaType: 'borgo_citta', municipality: 'Calcata', region: 'Lazio' }))
    expect(stats).toEqual([{ key: 'location', label: 'Luogo', value: 'Calcata, Lazio' }])
  })

  it('borgo_citta senza comune né regione → array vuoto, mai un valore fabbricato', () => {
    const stats = metaRowLocationStats(row({ metaType: 'borgo_citta' }))
    expect(stats).toEqual([])
  })

  it('borgo_citta con solo la regione → una riga "Luogo" col solo valore noto', () => {
    const stats = metaRowLocationStats(row({ metaType: 'borgo_citta', region: 'Lazio' }))
    expect(stats).toEqual([{ key: 'location', label: 'Luogo', value: 'Lazio' }])
  })

  it('sito con categoria e comune → categoria prima, poi luogo', () => {
    const stats = metaRowLocationStats(row({ metaType: 'sito', siteType: 'museo', municipality: 'Roma' }))
    expect(stats).toEqual([
      { key: 'category', label: 'Categoria', value: 'Museo' },
      { key: 'location', label: 'Luogo', value: 'Roma' },
    ])
  })

  it('sito senza siteType né comune/regione → array vuoto', () => {
    const stats = metaRowLocationStats(row({ metaType: 'sito' }))
    expect(stats).toEqual([])
  })
})
