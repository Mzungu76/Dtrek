import { describe, it, expect } from 'vitest'
import { pickOrdinals } from '../cammini/offlineBulk'
import type { CamminoPlan } from '../cammini/plan'

const plan = {
  tappe: [1, 2, 3, 4].map(o => ({ ordinal: o, name: `T${o}`, fromName: 'a', toName: 'b', lengthM: 1000 })),
  days: [{ tappe: [1, 2], lengthM: 2000 }, { tappe: [3], lengthM: 1000 }, { tappe: [4], lengthM: 1000 }],
} as unknown as CamminoPlan

describe('pickOrdinals', () => {
  it('prende le prossime N non percorse in ordine di marcia', () => {
    expect(pickOrdinals(plan, new Set([1]), { kind: 'next', count: 2 })).toEqual([2, 3])
  })
  it('tutte le restanti', () => {
    expect(pickOrdinals(plan, new Set([1, 2]), { kind: 'all' })).toEqual([3, 4])
  })
  it('niente se è tutto fatto o il conteggio è 0', () => {
    expect(pickOrdinals(plan, new Set([1, 2, 3, 4]), { kind: 'all' })).toEqual([])
    expect(pickOrdinals(plan, new Set(), { kind: 'next', count: 0 })).toEqual([])
  })
})
