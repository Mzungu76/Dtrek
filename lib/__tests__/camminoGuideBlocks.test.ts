import { describe, it, expect } from 'vitest'
import { camminoMetricsBlock, camminoTappeBlock, planTotals } from '../cammini/guideBlocks'
import type { CamminoPlan } from '../cammini/plan'

const plan: CamminoPlan = {
  version: 1, camminoId: 'cammino/x', camminoName: 'Cammino X', structure: 'cammino', direction: 'forward',
  fromOrdinal: 1, toOrdinal: 3, grouping: { mode: 'max_km', maxKm: 25 }, startDate: '2026-05-01',
  days: [{ tappe: [1, 2], lengthM: 24_000 }, { tappe: [3], lengthM: 18_000 }],
  tappe: [
    { ordinal: 1, name: 'A', fromName: 'Aa', toName: 'Bb', lengthM: 12_000, source: 'official', endsAtAnchor: true, elevationGainM: 340, elevationLossM: 100 },
    { ordinal: 2, name: 'B', fromName: 'Bb', toName: 'Cc', lengthM: 12_000, source: 'official', endsAtAnchor: true, elevationGainM: null, elevationLossM: null },
    { ordinal: 3, name: 'C', fromName: 'Cc', toName: null, lengthM: 18_000, source: 'computed', endsAtAnchor: false, elevationGainM: null, elevationLossM: null },
  ],
}

describe('cammino guide blocks', () => {
  it('totali dal piano', () => {
    expect(planTotals(plan)).toMatchObject({ lengthM: 42_000, tappe: 3, days: 2 })
  })
  it('metriche senza dislivello inventato', () => {
    const b = camminoMetricsBlock(plan)
    expect(b).toContain('42.0 km')
    expect(b).not.toMatch(/DISLIVELLO POSITIVO/)
  })
  it('tappe numerate nell\'ordine di marcia con giornata e dislivello solo se noto', () => {
    const b = camminoTappeBlock(plan).split('\n')
    expect(b[0]).toContain('TAPPA 1 (giornata 1): Aa → Bb, 12.0 km, dislivello +340 m')
    expect(b[1]).not.toContain('dislivello')
    expect(b[2]).toContain('TAPPA 3 (giornata 2)')
    expect(b[2]).toContain('aperta campagna')
  })
})
