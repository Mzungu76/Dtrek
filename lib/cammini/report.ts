import type { CamminoPlan, CamminoReport, CamminoReportChapter } from './plan'

// Reportage unico del cammino (docs/piano-cammini.md, Fase 6): logica pura sul piano. Nessuna rete.

export function chapterFor(plan: CamminoPlan, ordinal: number): CamminoReportChapter | undefined {
  return plan.report?.chapters.find(c => c.ordinal === ordinal)
}

/** Capitoli scritti, nell'ordine di marcia del piano (non nell'ordine in cui sono stati scritti). */
export function orderedChapters(plan: CamminoPlan): CamminoReportChapter[] {
  const seq = plan.days.flatMap(d => d.tappe)
  return [...(plan.report?.chapters ?? [])].sort((a, b) => seq.indexOf(a.ordinal) - seq.indexOf(b.ordinal))
}

export function emptyReport(now: string): CamminoReport {
  return { chapters: [], updatedAt: now }
}

/** Aggiunge o sostituisce il capitolo di una tappa (uno solo per tappa). */
export function upsertChapter(report: CamminoReport | undefined, chapter: CamminoReportChapter, now: string): CamminoReport {
  const base = report ?? emptyReport(now)
  return { ...base, chapters: [...base.chapters.filter(c => c.ordinal !== chapter.ordinal), chapter], updatedAt: now }
}

export type ReportPart = 'intro' | 'epilogue'

export function setPart(report: CamminoReport | undefined, part: ReportPart, body: string, now: string): CamminoReport {
  return { ...(report ?? emptyReport(now)), [part]: body, updatedAt: now }
}

/** Quanti capitoli ci sono rispetto alle tappe del piano. Il reportage è completo quando ogni tappa ha il suo. */
export function reportProgress(plan: CamminoPlan): { written: number; total: number; complete: boolean } {
  const total = plan.tappe.length
  const written = plan.tappe.filter(t => chapterFor(plan, t.ordinal)).length
  return { written, total, complete: total > 0 && written === total }
}
