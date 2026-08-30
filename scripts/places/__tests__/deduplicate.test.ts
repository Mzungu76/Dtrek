import { describe, it, expect } from 'vitest'
import { scoreCandidateAgainstPlace, findBestMatch, AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD } from '../deduplicate'
import type { ExistingPlace, PlaceCandidate } from '../types'

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    name:      'Castello Orsini-Odescalchi',
    metaType:  'sito',
    subtype:   'castello',
    latitude:  42.0975,
    longitude: 12.1678,
    source:    'osm',
    sourceId:  'way/123',
    confidence: 1,
    ...overrides,
  }
}

function existing(overrides: Partial<ExistingPlace> = {}): ExistingPlace {
  return {
    id:        'existing-1',
    name:      'Castello Orsini-Odescalchi',
    metaType:  'sito',
    subtype:   'castello',
    latitude:  42.0975,
    longitude: 12.1678,
    ...overrides,
  }
}

describe('scoreCandidateAgainstPlace', () => {
  it('stesso posto (coordinate/nome/comune/tipo identici) → confidence 1, sopra soglia auto-merge', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ municipality: 'Bracciano' }),
      existing({ municipality: 'Bracciano' }),
    )
    expect(result.confidence).toBe(1)
    expect(result.confidence).toBeGreaterThanOrEqual(AUTO_MERGE_THRESHOLD)
  })

  it('stesso wikidata_id → match certo (1) anche con coordinate molto distanti', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ wikidataId: 'Q1758666', latitude: 45.0, longitude: 7.0 }),
      existing({ wikidataId: 'Q1758666', latitude: 42.0975, longitude: 12.1678 }),
    )
    expect(result.confidence).toBe(1)
  })

  it('stesso municipality_istat_code su due borgo_citta → match certo (1) anche oltre MAX_MATCH_DISTANCE_M — caso reale: il centroide del confine comunale di un Comune grande/irregolare (es. Latina) può distare km dal punto usato da un\'altra fonte per lo stesso Comune', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({
        name: 'Latina', metaType: 'borgo_citta', subtype: undefined,
        municipalityIstatCode: '059011', latitude: 41.4676, longitude: 12.9037,
      }),
      existing({
        name: 'Latina', metaType: 'borgo_citta', subtype: undefined,
        municipalityIstatCode: '059011', latitude: 41.47284, longitude: 12.84509, // ~4.9km di distanza
      }),
    )
    expect(result.confidence).toBe(1)
  })

  it('municipality_istat_code diverso NON fa scattare il corto-circuito — resta il punteggio pesato normale', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ metaType: 'borgo_citta', subtype: undefined, municipalityIstatCode: '059011' }),
      existing({ metaType: 'borgo_citta', subtype: undefined, municipalityIstatCode: '058091' }),
    )
    expect(result.reasons.map(r => r.factor)).not.toContain('municipality_istat_code')
    expect(result.reasons.map(r => r.factor)).toContain('distance') // è passato dal percorso pesato, non dal corto-circuito
  })

  it('municipality_istat_code uguale ma un lato è un Sito (non borgo_citta) → nessun corto-circuito, mai fondere un Sito con il suo Comune', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ metaType: 'sito', municipalityIstatCode: '059011', latitude: 45.0, longitude: 7.0 }),
      existing({ metaType: 'borgo_citta', subtype: undefined, municipalityIstatCode: '059011' }),
    )
    expect(result.confidence).toBe(0) // metaType diverso + oltre MAX_MATCH_DISTANCE_M
  })

  it('oltre la distanza massima → confidence 0, anche con nome identico', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ latitude: 45.0, longitude: 7.0 }), // Torino
      existing(), // Bracciano — ben oltre MAX_MATCH_DISTANCE_M
    )
    expect(result.confidence).toBe(0)
  })

  it('stesse coordinate ma nome/comune diversi → match probabile, sotto soglia auto-merge', () => {
    const result = scoreCandidateAgainstPlace(
      candidate({ name: 'Rocca di Bracciano', municipality: 'Bracciano' }),
      existing({ name: 'Castello Orsini-Odescalchi', municipality: 'Anguillara Sabazia' }),
    )
    expect(result.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD)
    expect(result.confidence).toBeLessThan(AUTO_MERGE_THRESHOLD)
  })

  it('tipologia diversa penalizza il punteggio rispetto a un match altrimenti identico', () => {
    const sameType = scoreCandidateAgainstPlace(candidate(), existing())
    const diffType = scoreCandidateAgainstPlace(candidate({ subtype: 'museo' }), existing({ subtype: 'castello' }))
    expect(diffType.confidence).toBeLessThan(sameType.confidence)
  })
})

describe('findBestMatch', () => {
  it('nessuna riga esistente → null', () => {
    expect(findBestMatch(candidate(), [])).toBeNull()
  })

  it('sceglie la riga con confidence più alta tra più candidati', () => {
    const farAway = existing({ id: 'far', latitude: 45.0, longitude: 7.0 })
    const closeMatch = existing({ id: 'close' })
    const best = findBestMatch(candidate(), [farAway, closeMatch])
    expect(best?.place.id).toBe('close')
  })
})
