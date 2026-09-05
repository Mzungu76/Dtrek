import { describe, expect, it } from 'vitest'
import { aggregateCollections, type CollectionRow, type CollectionDiaryLinkRow } from '../aggregateCollections'
import type { DiarySummary } from '../../diari/aggregateDiaries'

function diario(overrides: Partial<DiarySummary> & { id: string }): DiarySummary {
  return {
    title: overrides.id, subtitle: '', author: '', coverUrl: null, footerText: '',
    isDefault: false, reportageCount: 0, pubblicabile: false,
    distanceMeters: 0, elevationGain: 0, lastActivityAt: null, labels: [], archivedAt: null,
    ...overrides,
  }
}

function collezione(overrides: Partial<CollectionRow> & { id: string }): CollectionRow {
  return { title: 'Raccolta', subtitle: '', cover_url: null, share_token: null, ...overrides }
}

describe('aggregateCollections', () => {
  it('una raccolta senza volumi ha tutti i totali a zero', () => {
    const [r] = aggregateCollections([collezione({ id: 'c1' })], [], [])
    expect(r).toMatchObject({ volumeCount: 0, reportageCount: 0, distanceMeters: 0, elevationGain: 0, isPublished: false })
  })

  it('somma le metriche dei Diari collegati, nell\'ordine non conta per i totali', () => {
    const diari = [
      diario({ id: 'd1', reportageCount: 3, distanceMeters: 10_000, elevationGain: 200 }),
      diario({ id: 'd2', reportageCount: 5, distanceMeters: 20_000, elevationGain: 800 }),
    ]
    const links: CollectionDiaryLinkRow[] = [
      { collection_id: 'c1', diary_id: 'd2', position: 0 },
      { collection_id: 'c1', diary_id: 'd1', position: 1 },
    ]
    const [r] = aggregateCollections([collezione({ id: 'c1' })], links, diari)
    expect(r.volumeCount).toBe(2)
    expect(r.reportageCount).toBe(8)
    expect(r.distanceMeters).toBe(30_000)
    expect(r.elevationGain).toBe(1000)
  })

  it('un Diario nella giunzione ma non più esistente non viene contato ed è come se non ci fosse', () => {
    const links: CollectionDiaryLinkRow[] = [{ collection_id: 'c1', diary_id: 'd-eliminato', position: 0 }]
    const [r] = aggregateCollections([collezione({ id: 'c1' })], links, [])
    expect(r.volumeCount).toBe(0)
  })

  it('isPublished riflette solo la presenza di uno share_token', () => {
    const [pubblicata] = aggregateCollections([collezione({ id: 'c1', share_token: 'x' })], [], [])
    expect(pubblicata.isPublished).toBe(true)
    const [nonPubblicata] = aggregateCollections([collezione({ id: 'c2', share_token: null })], [], [])
    expect(nonPubblicata.isPublished).toBe(false)
  })

  it('i link di un\'altra raccolta non influenzano questa', () => {
    const diari = [diario({ id: 'd1', reportageCount: 2 })]
    const links: CollectionDiaryLinkRow[] = [{ collection_id: 'altra', diary_id: 'd1', position: 0 }]
    const [r] = aggregateCollections([collezione({ id: 'c1' })], links, diari)
    expect(r.volumeCount).toBe(0)
    expect(r.reportageCount).toBe(0)
  })
})
