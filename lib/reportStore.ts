// Shared types and helpers for the hike report editor (Blocco 7 piano DTrek).
// `content` (Markdown) remains the source of truth for all existing rendering
// (SectionCard, DiarioReportPage, PDF). `sections` is an optional structured
// layer used by the manual editor; it's converted to/from Markdown on save/load.
//
// This module is imported by the server route app/api/resoconto/route.ts (for
// sectionsToMarkdown), so it must stay free of browser-only I/O — the
// cache-first/queued client access layer lives in lib/sync/hikeReportStore.ts.

import type { MetaType, SiteType } from './metaTypes'
import { reportProfileFor } from './reportProfiles'

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

// ── Scheletro per tipologia ──────────────────────────────────────────────────────────────────
//
// Il Reportage "scritto a mano" parte da un elenco di sezioni vuote. Prima era sempre quello di un
// percorso (Il percorso / Cronaca / Natura e storia / In sintesi) anche per un Borgo/Città o un Sito,
// dove "Il percorso" e "Natura e storia" non hanno senso: ora le sezioni sono quelle stesse del
// profilo usato dalla generazione AI (lib/reportProfiles.ts), così scrivere a mano e generare
// producono lo stesso schema. "Cronaca" resta in seconda posizione, come nel Reportage generato.

function scaffold(titles: string[]): ReportSection[] {
  return titles.map((title, i) => ({ id: `sec-${i}`, title, body: '', photoId: null, order: i }))
}

export function scaffoldSectionsFor(metaType?: MetaType, siteType?: SiteType): ReportSection[] {
  if (!metaType || metaType === 'sentiero') return SCAFFOLD_SECTIONS
  const p = reportProfileFor(metaType, siteType)
  const titles = [p.sectionTitle, 'Cronaca', p.section2Title]
  if (p.saporiTitle) titles.push(p.saporiTitle)
  titles.push(p.section3Title)
  return scaffold(titles)
}

/** Suggerimento nel campo di testo di ogni sezione — la prima frase dell'istruzione del profilo, che
 *  è già scritta come "di cosa parlare". Solo per Borgo/Città e Sito: i titoli di un Sentiero hanno
 *  i loro suggerimenti in components SectionEditor. */
export function sectionHintsFor(metaType?: MetaType, siteType?: SiteType): Record<string, string> {
  if (!metaType || metaType === 'sentiero') return {}
  const p = reportProfileFor(metaType, siteType)
  const firstSentence = (brief: string) => {
    const one = brief.replace(/\s+/g, ' ').trim()
    const cut = one.search(/[.:](\s|$)/)
    return (cut > 20 ? one.slice(0, cut + 1) : one)
  }
  const hints: Record<string, string> = {
    [p.sectionTitle]: firstSentence(p.sectionBrief),
    'Cronaca': 'Racconta la tua visita, momento per momento: cosa hai visto, cosa ti ha colpito…',
    [p.section2Title]: firstSentence(p.section2Brief),
    [p.section3Title]: 'Una valutazione complessiva, consigli pratici per chi ci andrà dopo, le tue impressioni finali…',
  }
  if (p.saporiTitle && p.saporiBrief) hints[p.saporiTitle] = firstSentence(p.saporiBrief)
  return hints
}

/** Un elenco di sezioni ancora tutte vuote e con i titoli dello scheletro da percorso: salvato
 *  prima che lo scheletro dipendesse dalla tipologia. Per un Borgo/Città o un Sito si può sostituire
 *  senza perdere nulla (non c'è testo), invece di riproporre "Il percorso" / "Natura e storia". */
export function isUntouchedSentieroScaffold(sections: ReportSection[]): boolean {
  if (sections.length !== SCAFFOLD_SECTIONS.length) return false
  return sections.every((s, i) => s.title === SCAFFOLD_SECTIONS[i].title && !s.body.trim() && !s.photoId)
}
