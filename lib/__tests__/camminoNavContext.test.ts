import { describe, it, expect } from 'vitest'
import { camminoNavContext } from '../cammini/navContext'
import type { CamminoPlan } from '../cammini/plan'

const plan = {
  tappe: [1, 2, 3].map(o => ({ ordinal: o, name: `T${o}`, fromName: `da${o}`, toName: `a${o}`, lengthM: 1000 * o })),
  days: [{ tappe: [1, 2], lengthM: 3000, date: '2026-05-10' }, { tappe: [3], lengthM: 3000 }],
} as unknown as CamminoPlan

describe('camminoNavContext', () => {
  it('posizione e tappa successiva', () => {
    expect(camminoNavContext(plan, 1)).toEqual({ seq: 1, total: 3, dayIdx: 0, dayCount: 2, date: '2026-05-10', next: { ordinal: 2, name: 'da2 → a2', lengthM: 2000 } })
  })
  it('l\'ultima tappa non ha successiva e senza data non la riporta', () => {
    const c = camminoNavContext(plan, 3)!
    expect(c.next).toBeNull()
    expect(c.date).toBeUndefined()
    expect(c.dayIdx).toBe(1)
  })
  it('null per una tappa fuori dal piano', () => {
    expect(camminoNavContext(plan, 9)).toBeNull()
  })
})
