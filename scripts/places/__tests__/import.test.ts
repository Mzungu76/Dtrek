import { describe, it, expect } from 'vitest'
import { candidateToPartialUpdate, mergeMetadata } from '../import'
import type { PlaceCandidate } from '../types'

// Fixture minima valida — solo i campi obbligatori di PlaceCandidate (types.ts), il resto
// deliberatamente assente per verificare che candidateToPartialUpdate non li includa nell'update.
const MINIMAL: PlaceCandidate = {
  name: 'Nepi',
  metaType: 'borgo_citta',
  latitude: 42.2306,
  longitude: 12.3517,
  source: 'istat',
  sourceId: '056039',
  confidence: 1,
}

describe('candidateToPartialUpdate', () => {
  // Regressione del bug reale: un ri-fetch ISTAT che aggiorna una riga già esistente non deve MAI
  // azzerare un campo che quella fonte non fornisce affatto (wikidata_id, image_url...) — solo
  // un update parziale, mai un overwrite completo con `?? null`, altrimenti un arricchimento
  // successivo di un'altra fonte (wikidata/enrich.ts, mic/fetch.ts) verrebbe cancellato dal
  // prossimo semplice ri-fetch della fonte originale. Vedi il commento su refreshExistingPlace
  // in import.ts per l'analisi completa.
  it('non include nell\'update i campi che il candidato non fornisce (undefined)', () => {
    const update = candidateToPartialUpdate(MINIMAL)
    expect(update).not.toHaveProperty('wikidata_id')
    expect(update).not.toHaveProperty('image_url')
    expect(update).not.toHaveProperty('description')
    expect(update).not.toHaveProperty('subtype')
    expect(update).not.toHaveProperty('official_url')
    expect(update).not.toHaveProperty('website')
    expect(update).not.toHaveProperty('opening_hours')
    expect(update).not.toHaveProperty('address')
  })

  it('include sempre nome/coordinate/confidence — i campi che ogni fonte fornisce comunque', () => {
    const update = candidateToPartialUpdate(MINIMAL)
    expect(update).toMatchObject({ name: 'Nepi', latitude: 42.2306, longitude: 12.3517, confidence: 1 })
  })

  it('include un campo opzionale quando il candidato lo fornisce davvero', () => {
    const withExtras: PlaceCandidate = { ...MINIMAL, region: 'Lazio', province: 'Viterbo', municipalityIstatCode: '056039' }
    const update = candidateToPartialUpdate(withExtras)
    expect(update).toMatchObject({ region: 'Lazio', province: 'Viterbo', municipality_istat_code: '056039' })
  })

  // Bug reale (MIC_DATA_SOURCES.md §9/§10, corretto in questa sessione): prima di mergeMetadata,
  // un ri-fetch della stessa fonte non toccava mai `metadata` — fieldProvenance scritta al primo
  // insert restava congelata per sempre (retrievedAt incluso).
  it('un candidato senza metadata non tocca il campo (comportamento invariato)', () => {
    const update = candidateToPartialUpdate(MINIMAL)
    expect(update).not.toHaveProperty('metadata')
  })

  it('un candidato con metadata la include, fusa con quella esistente sulla riga', () => {
    const withMetadata: PlaceCandidate = { ...MINIMAL, metadata: { micTypeLabel: 'Museo' } }
    const update = candidateToPartialUpdate(withMetadata, { needsReview: true })
    expect(update.metadata).toEqual({ needsReview: true, micTypeLabel: 'Museo' })
  })
})

describe('mergeMetadata', () => {
  it('nessuna metadata esistente, nessuna in arrivo → oggetto vuoto', () => {
    expect(mergeMetadata(null, undefined)).toEqual({})
    expect(mergeMetadata(undefined, undefined)).toEqual({})
  })

  it('nessuna metadata in arrivo → quella esistente resta intatta', () => {
    expect(mergeMetadata({ a: 1 }, undefined)).toEqual({ a: 1 })
  })

  it('chiavi non fieldProvenance: quella in arrivo vince, il resto della esistente resta', () => {
    expect(mergeMetadata({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('fieldProvenance si fonde CAMPO PER CAMPO, non come blob unico (il punto del bug §9/§10)', () => {
    const existing = {
      fieldProvenance: {
        description: { value: 'vecchia descrizione', source: 'mic', retrievedAt: '2026-01-01', confidence: 'high' as const },
        price: { value: null, source: 'mic', retrievedAt: '2026-01-01', confidence: 'low' as const, status: 'missing' as const },
      },
    }
    const incoming = {
      fieldProvenance: {
        description: { value: 'nuova descrizione', source: 'mic', retrievedAt: '2026-09-21', confidence: 'high' as const },
      },
    }
    const merged = mergeMetadata(existing, incoming)
    expect(merged.fieldProvenance).toEqual({
      description: { value: 'nuova descrizione', source: 'mic', retrievedAt: '2026-09-21', confidence: 'high' },
      price: { value: null, source: 'mic', retrievedAt: '2026-01-01', confidence: 'low', status: 'missing' },
    })
  })
})
