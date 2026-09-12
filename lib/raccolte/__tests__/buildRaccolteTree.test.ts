import { describe, expect, it } from 'vitest'
import { buildRaccolteTree, type ActivityTreeRow } from '../buildRaccolteTree'
import type { CollectionRow, CollectionDiaryLinkRow } from '../aggregateCollections'
import type { DiaryRow, PlannedDiaryLinkRow } from '../../diari/aggregateDiaries'

function collezione(overrides: Partial<CollectionRow> & { id: string }): CollectionRow {
  return { title: 'Raccolta', subtitle: '', cover_url: null, share_token: null, position: 0, ...overrides }
}
function diario(overrides: Partial<DiaryRow> & { id: string }): DiaryRow {
  return {
    title: overrides.id, subtitle: '', author: '', cover_url: null, footer_text: '',
    is_default: false, labels: [], archived_at: null, ...overrides,
  }
}
function attivita(overrides: Partial<ActivityTreeRow> & { id: string }): ActivityTreeRow {
  return { title: 'Escursione', start_time: '2024-01-01T00:00:00Z', distance_meters: 0, linked_planned_id: null, ...overrides }
}

describe('buildRaccolteTree', () => {
  it('una raccolta senza diari ha un array diari vuoto', () => {
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], [], [], [], [])
    expect(r.diari).toEqual([])
  })

  it('annida i Diari nella raccolta nell\'ordine di collection_diaries.position', () => {
    const diari = [diario({ id: 'd1', title: 'Uno' }), diario({ id: 'd2', title: 'Due' })]
    const links: CollectionDiaryLinkRow[] = [
      { collection_id: 'c1', diary_id: 'd2', position: 0 },
      { collection_id: 'c1', diary_id: 'd1', position: 1 },
    ]
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], links, diari, [], [])
    expect(r.diari.map(d => d.id)).toEqual(['d2', 'd1'])
  })

  it('annida i Reportage di un Diario passando dalla Meta collegata (linked_planned_id → diary_id)', () => {
    const diari = [diario({ id: 'd1' })]
    const links: CollectionDiaryLinkRow[] = [{ collection_id: 'c1', diary_id: 'd1', position: 0 }]
    const planned: PlannedDiaryLinkRow[] = [{ id: 'p1', diary_id: 'd1' }]
    const activities = [attivita({ id: 'a1', title: 'Anello', linked_planned_id: 'p1', distance_meters: 5000 })]
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], links, diari, planned, activities)
    expect(r.diari[0].reportage).toEqual([
      { id: 'a1', title: 'Anello', startTime: '2024-01-01T00:00:00Z', distanceMeters: 5000, linkedPlannedId: 'p1' },
    ])
  })

  it('ordina i Reportage di un Diario dal più recente al più vecchio', () => {
    const diari = [diario({ id: 'd1' })]
    const links: CollectionDiaryLinkRow[] = [{ collection_id: 'c1', diary_id: 'd1', position: 0 }]
    const planned: PlannedDiaryLinkRow[] = [{ id: 'p1', diary_id: 'd1' }, { id: 'p2', diary_id: 'd1' }]
    const activities = [
      attivita({ id: 'vecchio', linked_planned_id: 'p1', start_time: '2023-01-01T00:00:00Z' }),
      attivita({ id: 'recente', linked_planned_id: 'p2', start_time: '2024-06-01T00:00:00Z' }),
    ]
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], links, diari, planned, activities)
    expect(r.diari[0].reportage.map(a => a.id)).toEqual(['recente', 'vecchio'])
  })

  it('un Reportage la cui Meta non appartiene a nessun Diario non compare da nessuna parte', () => {
    const activities = [attivita({ id: 'a1', linked_planned_id: 'p-inesistente' })]
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], [], [], [], activities)
    expect(r.diari).toEqual([])
  })

  it('un Diario nella giunzione ma non più esistente non compare nell\'albero', () => {
    const links: CollectionDiaryLinkRow[] = [{ collection_id: 'c1', diary_id: 'd-eliminato', position: 0 }]
    const [r] = buildRaccolteTree([collezione({ id: 'c1' })], links, [], [], [])
    expect(r.diari).toEqual([])
  })

  it('ordina le raccolte per position', () => {
    const r = buildRaccolteTree(
      [collezione({ id: 'c2', position: 1 }), collezione({ id: 'c1', position: 0 })], [], [], [], [],
    )
    expect(r.map(x => x.id)).toEqual(['c1', 'c2'])
  })

  it('isPublished riflette solo la presenza di uno share_token', () => {
    const [r] = buildRaccolteTree([collezione({ id: 'c1', share_token: 'x' })], [], [], [], [])
    expect(r.isPublished).toBe(true)
  })
})
