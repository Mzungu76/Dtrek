// Shared types and helpers for the hike report editor (Blocco 7 piano DTrek).
// `content` (Markdown) remains the source of truth for all existing rendering
// (SectionCard, DiarioReportPage, PDF). `sections` is an optional structured
// layer used by the manual editor; it's converted to/from Markdown on save/load.
//
// This module is imported by the server route app/api/resoconto/route.ts (for
// sectionsToMarkdown), so it must stay free of browser-only I/O — the
// cache-first/queued client access layer lives in lib/sync/hikeReportStore.ts.

export interface HikeReport {
  id: string
  activity_id: string
  title: string
  content: string
  photos: { caption: string; lat?: number; lon?: number; progress: number }[]
  sections?: ReportSection[] | null
  authored_by?: ReportAuthoredBy
  created_at: string
  updated_at: string
}

export interface ReportSection {
  id: string
  title: string
  body: string
  /** Foto principale — ancorata in alto a destra nel testo, come in lettura finale. */
  photoId: string | null
  /** Altre foto della sezione — mostrate a piena larghezza nel testo (una ogni due paragrafi),
   *  stesso trattamento delle sezioni generate automaticamente. Assente/vuoto per i report più
   *  vecchi (retrocompatibile: nessuna foto extra). */
  extraPhotoIds?: string[]
  order: number
}

export type ReportAuthoredBy = 'ai' | 'manual' | 'mixed'

export interface Section { title: string; body: string }

export function parseSections(md: string): Section[] {
  return md.split(/\n(?=## )/)
    .map(part => {
      const nl = part.indexOf('\n')
      if (!part.startsWith('## ') || nl === -1) return null
      return { title: part.slice(3, nl).trim(), body: part.slice(nl + 1).trim() }
    })
    .filter((s): s is Section => s !== null)
}

export function sectionsToMarkdown(sections: ReportSection[]): string {
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map(s => `## ${s.title}\n\n${s.body}`)
    .join('\n\n')
}

export function markdownToSections(content: string): ReportSection[] {
  return parseSections(content).map((s, i) => ({
    id: crypto.randomUUID(),
    title: s.title,
    body: s.body,
    photoId: null,
    order: i,
  }))
}

export const SCAFFOLD_SECTIONS: ReportSection[] = [
  { id: 'sec-percorso',  title: 'Il percorso',     body: '', photoId: null, order: 0 },
  { id: 'sec-cronaca',   title: 'Cronaca',         body: '', photoId: null, order: 1 },
  { id: 'sec-natura',    title: 'Natura e storia', body: '', photoId: null, order: 2 },
  { id: 'sec-sintesi',   title: 'In sintesi',      body: '', photoId: null, order: 3 },
]
