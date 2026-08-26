'use client'
// Guscio "libro" del Diario — porta nell'app reale l'estetica validata nel mockup HTML (Modello B,
// artifact 2e1f7d0a-5d69-4e17-9c8b-038aa651e13b): pergamena calda, non lo sfondo scuro immersivo
// di GuidaHub/ResocontoHub. Vedi /root/.claude/plans/logical-munching-kahan.md, Fase 2.
//
// Adattamento deliberato rispetto al mockup: lì "sfogliare" era uno swipe/tap su un simulatore di
// schermo (stato JS locale, bottone "chiudi" per uscire dal simulatore). Qui ogni pagina è una URL
// vera (Fase 3) — niente overlay da "chiudere": frecce e pillole sono link reali (<Link>), che
// funzionano con tasto Indietro, condivisione diretta di una sezione e SEO, e restano visibili
// (non zone invisibili ai bordi) per restare utilizzabili anche con mouse/tastiera su desktop.
//
// Palette/font: FONT/TERRA/FOREST da lib/designTokens.ts (fonte unica già usata dal resto
// dell'app); i toni caldi di pergamena/inchiostro sotto sono invece nuovi e locali a questo
// albero di componenti — non esiste (ancora) un token app-wide per "pergamena", e non ce n'è
// bisogno finché resta l'unico posto che lo usa.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { FONT, TERRA } from '@/lib/designTokens'

const PAPER_BG = '#fbf6e8'
const PAPER_HAIRLINE = '#e4d9bd'
const INK_MUTED = '#a9915f'
const INK_FOOTER = '#b5a677'
const PILL_BG = '#f1e9d2'
const PILL_TEXT = '#6b6142'

export interface BookPageSection {
  key: string
  label: string
  href: string
  icon?: ReactNode
}

interface BookPageProps {
  /** Titolo del Diario — link di "torna all'indice" del Percorso/Diario. */
  diarioTitle: string
  indexHref: string
  /** Etichetta della sezione corrente, mostrata a destra della running head (es. "Percorso",
   *  "Dati e sicurezza", "Cronaca"). */
  sectionLabel: string
  prevHref?: string
  nextHref?: string
  /** Striscia di pillole di navigazione tra le sezioni sorelle (Guida/Reportage) — assente sulle
   *  pagine di indice/riepilogo, dove non ha senso. */
  sections?: BookPageSection[]
  currentSectionKey?: string
  /** Es. "3 di 9" — numero di pagina stile libro, non un contatore tecnico. */
  pageLabel?: string
  children: ReactNode
}

export default function BookPage({
  diarioTitle, indexHref, sectionLabel, prevHref, nextHref, sections, currentSectionKey, pageLabel, children,
}: BookPageProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: PAPER_BG }}>
      <div
        className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-5 pb-3 border-b sticky top-0 z-10"
        style={{ borderColor: PAPER_HAIRLINE, background: PAPER_BG }}
      >
        <Link
          href={indexHref}
          className="flex items-center gap-1.5 shrink-0 min-w-0 hover:opacity-70 transition-opacity"
          style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: INK_MUTED }}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{diarioTitle}</span>
        </Link>
        <span
          className="shrink-0"
          style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: INK_MUTED }}
        >
          {sectionLabel}
        </span>
      </div>

      {sections && sections.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-5 sm:px-8 pt-3 pb-1" style={{ background: PAPER_BG }}>
          {sections.map(s => {
            const on = s.key === currentSectionKey
            return (
              <Link
                key={s.key}
                href={s.href}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors"
                style={on ? { background: TERRA[600], color: '#fff' } : { background: PILL_BG, color: PILL_TEXT }}
              >
                {s.icon}{s.label}
              </Link>
            )
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 px-5 sm:px-8 py-5" style={{ fontFamily: FONT.body }}>
        {children}
      </div>

      <div className="flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-t" style={{ borderColor: PAPER_HAIRLINE }}>
        {prevHref ? (
          <Link
            href={prevHref}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:opacity-70 transition-opacity"
            style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11.5, color: INK_MUTED, background: PILL_BG }}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Indietro
          </Link>
        ) : <span />}
        {pageLabel && (
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: INK_FOOTER }}>{pageLabel}</span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:opacity-70 transition-opacity"
            style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11.5, color: INK_MUTED, background: PILL_BG }}
          >
            Avanti <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : <span />}
      </div>
    </div>
  )
}
