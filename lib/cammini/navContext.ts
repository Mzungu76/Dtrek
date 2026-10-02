import { buildSequence } from './progress'
import type { CamminoPlan } from './plan'

// Contesto del cammino per il Navigator (docs/piano-cammini.md, Fase C): dove si è nel piano e qual è la tappa dopo.

export interface CamminoNavContext {
  seq: number
  total: number
  dayIdx: number
  dayCount: number
  date?: string
  next: { ordinal: number; name: string; lengthM: number } | null
}

export function camminoNavContext(plan: CamminoPlan, ordinal: number): CamminoNavContext | null {
  const seq = buildSequence(plan)
  const i = seq.findIndex(x => x.ordinal === ordinal)
  if (i < 0) return null
  const cur = seq[i], nxt = seq[i + 1]
  return {
    seq: cur.seq,
    total: seq.length,
    dayIdx: cur.dayIdx,
    dayCount: plan.days.length,
    ...(plan.days[cur.dayIdx]?.date ? { date: plan.days[cur.dayIdx].date } : {}),
    next: nxt ? { ordinal: nxt.ordinal, name: `${nxt.tappa.fromName ?? 'Partenza'} → ${nxt.tappa.toName ?? 'Arrivo'}`, lengthM: nxt.tappa.lengthM } : null,
  }
}
