import type { CamminoPlan, CamminoPlanTappa } from './plan'

// Avanzamento di un cammino sul piano (docs/piano-cammini.md, Fase 5): la sequenza di marcia e quale tappa
// è "quella di adesso". Logica pura.

export interface SeqItem { ordinal: number; dayIdx: number; tappa: CamminoPlanTappa; seq: number }

/** Tappe nell'ordine di marcia, con la giornata e il numero progressivo (1…N). */
export function buildSequence(plan: CamminoPlan): SeqItem[] {
  const by = new Map(plan.tappe.map(t => [t.ordinal, t]))
  const out: SeqItem[] = []
  plan.days.forEach((day, dayIdx) => {
    for (const ordinal of day.tappe) {
      const tappa = by.get(ordinal)
      if (tappa) out.push({ ordinal, dayIdx, tappa, seq: out.length + 1 })
    }
  })
  return out
}

/**
 * La tappa su cui aprire la guida: quella di oggi se il piano ha le date e oggi ne cade una; altrimenti la
 * prima non ancora percorsa; a cammino finito l'ultima. `isToday` dice se è davvero quella di oggi.
 */
export function currentTappa(plan: CamminoPlan, done: ReadonlySet<number>, todayIso: string): { item: SeqItem; isToday: boolean } | null {
  const seq = buildSequence(plan)
  if (seq.length === 0) return null
  const todayDay = plan.days.findIndex(d => d.date === todayIso)
  if (todayDay >= 0) {
    const inDay = seq.filter(x => x.dayIdx === todayDay)
    const firstTodo = inDay.find(x => !done.has(x.ordinal)) ?? inDay[0]
    if (firstTodo) return { item: firstTodo, isToday: true }
  }
  const next = seq.find(x => !done.has(x.ordinal)) ?? seq[seq.length - 1]
  return { item: next, isToday: false }
}
