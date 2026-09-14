import { describe, expect, it } from 'vitest'
import { planPublishBatch, type MarkedCollectionRow } from '../planPublishBatch'

function riga(overrides: Partial<MarkedCollectionRow> & { id: string }): MarkedCollectionRow {
  return { share_token: null, marked_for_publish: true, ...overrides }
}

describe('planPublishBatch', () => {
  it('nessuna riga marcata → niente da pubblicare e niente già online', () => {
    const plan = planPublishBatch([riga({ id: 'c1', marked_for_publish: false })])
    expect(plan.toPublish).toEqual([])
    expect(plan.alreadyPublished).toEqual([])
  })

  it('una raccolta marcata senza token va pubblicata', () => {
    const plan = planPublishBatch([riga({ id: 'c1' })])
    expect(plan.toPublish).toEqual(['c1'])
    expect(plan.alreadyPublished).toEqual([])
  })

  it('una raccolta marcata già con token conta come già online, non da ripubblicare', () => {
    const plan = planPublishBatch([riga({ id: 'c1', share_token: 'tok' })])
    expect(plan.toPublish).toEqual([])
    expect(plan.alreadyPublished).toEqual(['c1'])
  })

  it('una raccolta NON marcata con token non compare in nessuna delle due liste', () => {
    const plan = planPublishBatch([riga({ id: 'c1', marked_for_publish: false, share_token: 'tok' })])
    expect(plan.toPublish).toEqual([])
    expect(plan.alreadyPublished).toEqual([])
  })

  it('separa correttamente un mix di raccolte marcate/non marcate, con/senza token', () => {
    const rows: MarkedCollectionRow[] = [
      riga({ id: 'da-pubblicare-1' }),
      riga({ id: 'gia-online-1', share_token: 'tok-1' }),
      riga({ id: 'non-marcata', marked_for_publish: false }),
      riga({ id: 'da-pubblicare-2' }),
      riga({ id: 'gia-online-2', share_token: 'tok-2' }),
    ]
    const plan = planPublishBatch(rows)
    expect(plan.toPublish.sort()).toEqual(['da-pubblicare-1', 'da-pubblicare-2'])
    expect(plan.alreadyPublished.sort()).toEqual(['gia-online-1', 'gia-online-2'])
  })
})
