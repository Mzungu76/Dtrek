import { describe, it, expect } from 'vitest'
import { buildSequence, currentTappa } from '../cammini/progress'
import type { CamminoPlan } from '../cammini/plan'

const mk = (dates?: string[]): CamminoPlan => ({
  version: 1, camminoId: 'c', camminoName: 'C', structure: 'cammino', direction: 'forward',
  fromOrdinal: 1, toOrdinal: 4, grouping: { mode: 'max_km', maxKm: 25 },
  days: [{ tappe: [1, 2], lengthM: 1, date: dates?.[0] }, { tappe: [3], lengthM: 1, date: dates?.[1] }, { tappe: [4], lengthM: 1, date: dates?.[2] }],
  tappe: [1, 2, 3, 4].map(o => ({ ordinal: o, name: `T${o}`, fromName: 'a', toName: 'b', lengthM: 1, source: 'official' as const, endsAtAnchor: true, elevationGainM: null, elevationLossM: null })),
})

describe('avanzamento del cammino', () => {
  it('sequenza con giornata e numero progressivo', () => {
    expect(buildSequence(mk()).map(x => [x.ordinal, x.dayIdx, x.seq])).toEqual([[1, 0, 1], [2, 0, 2], [3, 1, 3], [4, 2, 4]])
  })
  it('senza date: la prima tappa non percorsa', () => {
    const r = currentTappa(mk(), new Set([1, 2]), '2026-09-25')
    expect(r?.item.ordinal).toBe(3); expect(r?.isToday).toBe(false)
  })
  it('con le date: la tappa di oggi, la prima non percorsa del giorno', () => {
    const r = currentTappa(mk(['2026-09-24', '2026-09-25', '2026-09-26']), new Set([1]), '2026-09-24')
    expect(r?.item.ordinal).toBe(2); expect(r?.isToday).toBe(true)
  })
  it('a cammino finito: l\'ultima tappa', () => {
    expect(currentTappa(mk(), new Set([1, 2, 3, 4]), '2030-01-01')?.item.ordinal).toBe(4)
  })
})
