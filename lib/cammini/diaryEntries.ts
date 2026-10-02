import type { CamminoPlan } from './plan'
import { orderedChapters } from './report'

// Il cammino nei Diari e nel sito pubblico (docs/piano-cammini.md, Fase 7): UNA sola voce per cammino, con le
// tappe come capitoli. Le attività delle tappe non compaiono mai come voci a sé. Logica pura: nessuna rete.

export interface CamminoActivityRow { id: string; linked_planned_id: string | null; tappa_index: number | null; start_time: string }
export interface CamminoPlannedRow { id: string; title: string; cammino_plan: CamminoPlan | null }

export interface CamminoGroup {
  hikeId: string
  name: string
  /** L'attività della prima tappa percorsa: dà il suo posto (e la sua data) alla voce unica del cammino. */
  repActivityId: string
  /** Tutte le attività delle tappe percorse, rappresentante compresa. */
  tappaActivityIds: string[]
  startTime: string
  /** Testo del reportage composto: introduzione, un capitolo per tappa, conclusione. Vuoto se non ancora scritto. */
  content: string
}

/** Il reportage del cammino come un unico testo: i capitoli diventano sezioni `## Tappa N · da → a`. */
export function composeCamminoMarkdown(plan: CamminoPlan): string {
  const byOrdinal = new Map(plan.tappe.map(t => [t.ordinal, t]))
  const seq = plan.days.flatMap(d => d.tappe)
  const parts: string[] = []
  if (plan.report?.intro?.trim()) parts.push(plan.report.intro.trim())
  for (const c of orderedChapters(plan)) {
    if (!c.body?.trim()) continue
    const t = byOrdinal.get(c.ordinal)
    const n = seq.indexOf(c.ordinal) + 1
    parts.push(`## Tappa ${n > 0 ? n : c.ordinal} · ${t?.fromName ?? 'Partenza'} → ${t?.toName ?? 'Arrivo'}\n\n${c.body.trim()}`)
  }
  if (plan.report?.epilogue?.trim()) parts.push(`## Conclusione\n\n${plan.report.epilogue.trim()}`)
  return parts.join('\n\n')
}

/** Raggruppa le attività-tappa per cammino. Le attività senza tappa, o di una Meta senza piano, restano fuori. */
export function groupCamminoActivities(planned: CamminoPlannedRow[], activities: CamminoActivityRow[]): CamminoGroup[] {
  const plans = new Map(planned.filter(p => p.cammino_plan).map(p => [p.id, p]))
  const byHike = new Map<string, CamminoActivityRow[]>()
  for (const a of activities) {
    if (a.tappa_index == null || !a.linked_planned_id || !plans.has(a.linked_planned_id)) continue
    byHike.set(a.linked_planned_id, [...(byHike.get(a.linked_planned_id) ?? []), a])
  }
  const out: CamminoGroup[] = []
  byHike.forEach((acts, hikeId) => {
    const sorted = [...acts].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const p = plans.get(hikeId)!
    out.push({
      hikeId,
      name: p.cammino_plan!.camminoName || p.title,
      repActivityId: sorted[0].id,
      tappaActivityIds: sorted.map(a => a.id),
      startTime: sorted[0].start_time,
      content: composeCamminoMarkdown(p.cammino_plan!),
    })
  })
  return out
}

/** Id delle attività-tappa che non devono comparire come voci: tutte tranne la rappresentante di ogni cammino. */
export function hiddenTappaActivityIds(groups: CamminoGroup[]): Set<string> {
  const hidden = new Set<string>()
  for (const g of groups) for (const id of g.tappaActivityIds) if (id !== g.repActivityId) hidden.add(id)
  return hidden
}
