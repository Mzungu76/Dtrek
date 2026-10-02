import { describe, it, expect } from 'vitest'
import { cleanTappaReport, composeCamminoMarkdown, groupCamminoActivities, hiddenTappaActivityIds } from '../cammini/diaryEntries'
import type { CamminoPlan } from '../cammini/plan'

const plan = {
  camminoName: 'Cammino di prova',
  days: [{ tappe: [1] }, { tappe: [2] }],
  tappe: [{ ordinal: 1, fromName: 'A', toName: 'B' }, { ordinal: 2, fromName: 'B', toName: 'C' }],
  report: { intro: 'Intro', chapters: [{ ordinal: 2, activityId: 'a2', body: 'Due', generatedAt: '' }, { ordinal: 1, activityId: 'a1', body: 'Uno', generatedAt: '' }], epilogue: 'Fine', updatedAt: '' },
} as unknown as CamminoPlan

describe('diaryEntries', () => {
  it('compone intro, capitoli in ordine di marcia e conclusione', () => {
    const md = composeCamminoMarkdown(plan)
    expect(md.indexOf('Intro')).toBeLessThan(md.indexOf('## Tappa 1 · A → B'))
    expect(md.indexOf('## Tappa 1')).toBeLessThan(md.indexOf('## Tappa 2 · B → C'))
    expect(md.endsWith('## Conclusione\n\nFine')).toBe(true)
  })
  it('raggruppa le tappe per cammino e nasconde tutte tranne la prima percorsa', () => {
    const groups = groupCamminoActivities(
      [{ id: 'h', title: 'T', cammino_plan: plan }],
      [
        { id: 'x2', linked_planned_id: 'h', tappa_index: 2, start_time: '2026-09-21T08:00:00Z' },
        { id: 'x1', linked_planned_id: 'h', tappa_index: 1, start_time: '2026-09-20T08:00:00Z' },
        { id: 'solo', linked_planned_id: 'h', tappa_index: null, start_time: '2026-09-01T08:00:00Z' },
      ],
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].repActivityId).toBe('x1')
    expect(groups[0].tappaActivityIds).toEqual(['x1', 'x2'])
    expect(Array.from(hiddenTappaActivityIds(groups))).toEqual(['x2'])
  })
  it('toglie le sezioni vuote dal testo di una tappa e lo mette sotto il suo capitolo', () => {
    expect(cleanTappaReport('## Il cammino\n\nTest\n\n## Cronaca\n\n\n\n## In sintesi\n\n')).toBe('Test')
    const md = composeCamminoMarkdown(plan, { 1: 'Mio testo' })
    expect(md.indexOf('Uno')).toBeLessThan(md.indexOf('Mio testo'))
    expect(md.indexOf('Mio testo')).toBeLessThan(md.indexOf('## Tappa 2'))
  })
})
