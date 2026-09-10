import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canCompleteWithoutTrack, markMetaVisited } from '../visitCompletion'

const saveActivityWithEnrichment = vi.fn()
vi.mock('../activitySave', () => ({
  saveActivityWithEnrichment: (...args: unknown[]) => saveActivityWithEnrichment(...args),
}))

beforeEach(() => {
  saveActivityWithEnrichment.mockReset()
  saveActivityWithEnrichment.mockResolvedValue(undefined)
})

describe('canCompleteWithoutTrack', () => {
  it('un sentiero non si completa mai senza traccia', () => {
    expect(canCompleteWithoutTrack('sentiero')).toBe(false)
  })

  it('assente → trattato come sentiero (default di colonna), mai completabile senza traccia', () => {
    expect(canCompleteWithoutTrack(undefined)).toBe(false)
  })

  it('borgo_citta e sito si completano senza traccia', () => {
    expect(canCompleteWithoutTrack('borgo_citta')).toBe(true)
    expect(canCompleteWithoutTrack('sito')).toBe(true)
  })
})

describe('markMetaVisited', () => {
  it('rifiuta un sentiero — nessuno shortcut rispetto a un\'attività reale', async () => {
    await expect(markMetaVisited({ id: '1', title: 'Test', metaType: 'sentiero' })).rejects.toThrow()
    expect(saveActivityWithEnrichment).not.toHaveBeenCalled()
  })

  it('crea un\'Attività senza traccia, collegata alla Meta, per un borgo_citta non ancora visitato', async () => {
    await markMetaVisited({ id: '1', title: 'Calcata', metaType: 'borgo_citta' })
    expect(saveActivityWithEnrichment).toHaveBeenCalledTimes(1)
    const [activity, opts] = saveActivityWithEnrichment.mock.calls[0]
    expect(activity.distanceMeters).toBe(0)
    expect(activity.trackPoints).toEqual([])
    expect(opts.linkedPlannedId).toBe('1')
    expect(opts.title).toBe('Calcata')
    expect(opts.metaType).toBe('borgo_citta')
  })

  it('porta il siteType per un sito', async () => {
    await markMetaVisited({ id: '1', title: 'Colosseo', metaType: 'sito', siteType: 'sito_archeologico' })
    const [, opts] = saveActivityWithEnrichment.mock.calls[0]
    expect(opts.siteType).toBe('sito_archeologico')
  })

  it('idempotente: non crea una seconda Attività se firstCompletedAt è già presente', async () => {
    await markMetaVisited({ id: '1', title: 'Test', metaType: 'sito', firstCompletedAt: '2026-01-01T00:00:00.000Z' })
    expect(saveActivityWithEnrichment).not.toHaveBeenCalled()
  })
})
