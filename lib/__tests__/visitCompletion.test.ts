import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canCompleteWithoutTrack, markMetaVisited } from '../visitCompletion'

const updatePlannedMeta = vi.fn()
vi.mock('../plannedStore', () => ({
  updatePlannedMeta: (...args: unknown[]) => updatePlannedMeta(...args),
}))

beforeEach(() => {
  updatePlannedMeta.mockReset()
  updatePlannedMeta.mockResolvedValue(undefined)
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
    await expect(markMetaVisited({ id: '1', metaType: 'sentiero' })).rejects.toThrow()
    expect(updatePlannedMeta).not.toHaveBeenCalled()
  })

  it('valorizza firstCompletedAt per un borgo_citta non ancora visitato', async () => {
    await markMetaVisited({ id: '1', metaType: 'borgo_citta' })
    expect(updatePlannedMeta).toHaveBeenCalledTimes(1)
    const [id, patch] = updatePlannedMeta.mock.calls[0]
    expect(id).toBe('1')
    expect(typeof patch.firstCompletedAt).toBe('string')
  })

  it('idempotente: non tocca una firstCompletedAt già presente', async () => {
    await markMetaVisited({ id: '1', metaType: 'sito', firstCompletedAt: '2026-01-01T00:00:00.000Z' })
    expect(updatePlannedMeta).not.toHaveBeenCalled()
  })
})
