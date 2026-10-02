import { describe, it, expect } from 'vitest'
import { chapterFor, orderedChapters, upsertChapter, setPart, reportProgress } from '../cammini/report'
import type { CamminoPlan } from '../cammini/plan'

const basePlan = (): CamminoPlan => ({
  version: 1, camminoId: 'c', camminoName: 'C', structure: 'cammino', direction: 'reverse',
  fromOrdinal: 1, toOrdinal: 3, grouping: { mode: 'one_per_day' },
  // verso inverso: l'ordine di marcia è 3, 2, 1
  days: [{ tappe: [3], lengthM: 1 }, { tappe: [2], lengthM: 1 }, { tappe: [1], lengthM: 1 }],
  tappe: [3, 2, 1].map(o => ({ ordinal: o, name: `T${o}`, fromName: 'a', toName: 'b', lengthM: 1, source: 'official' as const, endsAtAnchor: true, elevationGainM: null, elevationLossM: null })),
})
const ch = (ordinal: number) => ({ ordinal, activityId: `act${ordinal}`, body: `b${ordinal}`, generatedAt: 't' })

describe('reportage del cammino', () => {
  it('i capitoli seguono l\'ordine di marcia del piano, non quello di scrittura', () => {
    let r = upsertChapter(undefined, ch(1), 'n1')
    r = upsertChapter(r, ch(3), 'n2')
    const plan = { ...basePlan(), report: r }
    expect(orderedChapters(plan).map(c => c.ordinal)).toEqual([3, 1])
  })
  it('riscrivere una tappa sostituisce il capitolo, non lo duplica', () => {
    let r = upsertChapter(undefined, ch(2), 'n1')
    r = upsertChapter(r, { ...ch(2), body: 'nuovo' }, 'n2')
    expect(r.chapters).toHaveLength(1)
    expect(r.chapters[0].body).toBe('nuovo')
    expect(r.updatedAt).toBe('n2')
  })
  it('intro e conclusione si impostano senza toccare i capitoli', () => {
    let r = upsertChapter(undefined, ch(1), 'n1')
    r = setPart(r, 'intro', 'intro', 'n2')
    r = setPart(r, 'epilogue', 'fine', 'n3')
    expect(r.chapters).toHaveLength(1)
    expect(r.intro).toBe('intro'); expect(r.epilogue).toBe('fine')
  })
  it('il reportage è completo solo con un capitolo per ogni tappa', () => {
    let plan: CamminoPlan = { ...basePlan(), report: upsertChapter(undefined, ch(1), 'n') }
    expect(reportProgress(plan)).toEqual({ written: 1, total: 3, complete: false })
    plan = { ...plan, report: upsertChapter(upsertChapter(plan.report, ch(2), 'n'), ch(3), 'n') }
    expect(reportProgress(plan).complete).toBe(true)
    expect(chapterFor(plan, 2)?.activityId).toBe('act2')
  })
})
