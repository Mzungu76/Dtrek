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
//
// Fase 17 — menù inferiore. L'utente ha segnalato che i modi per spostarsi tra le pagine del
// libro erano troppi e incoerenti: il titolo in testata faceva doppio uso (a volte un link, a
// volte apriva il drawer dei Diari solo sul Sommario), la pillola "Strumenti" viveva in mezzo
// alle sezioni della Guida, prev/next stavano in un footer a sé. Consolidati in un'unica barra
// fissa in fondo (Indietro / Indice / Strumenti / Avanti), sempre nello stesso posto su ogni
// pagina del libro — la testata in cima ora è solo informativa (titolo del Diario, sezione,
// numero di pagina), non più cliccabile. La striscia di pillole per saltare tra le sezioni della
// Guida resta invariata: è un indice dei contenuti della pagina, non navigazione dell'app.
//
// Fase 18 — il bottone "Indice" torna a essere un semplice `<Link>` a `indexHref`, sempre: il
// Sommario (unico chiamante di `onIndexClick`, Fase 11) apriva lì un drawer laterale per cambiare
// Diario senza lasciare la pagina — ma con lo scaffale stesso ridisegnato in stile taccuino
// (griglia, ricerca), quel drawer duplicava una destinazione che ora vale la pena raggiungere
// per intero. Il Sommario passa `indexLabel="Diari"` (etichetta diversa, stessa meccanica di
// sempre) invece di intercettare il click.
//
// Fase 20 — prop `theme` opzionale ("pergamena", default, invariato per i chiamanti esistenti, o
// "taccuino"): il guscio resta lo stesso componente/markup, cambiano solo i toni. Alternativa
// scartata: duplicare BookPage per il Sommario in stile taccuino avrebbe biforcato la struttura
// (barra inferiore, spacer, sticky header) che invece deve restare identica su ogni pagina del
// libro — qui cambia solo la palette, non il comportamento.
//
// Fase 21 — la Fase 20 cambiava solo i colori: verificata a schermo contro il mockup
// (`taccuino-canvas/SommarioTaccuino.dc.html`, non nel repo), il risultato non gli assomigliava
// affatto ("sembra che hai cambiato semplicemente il font del titolo"). Il tema "taccuino" ora
// monta anche `TaccuinoPaperTexture`/`TaccuinoSpineShadow` (texture di carta + piega disegnata a
// mano) al posto del flat `BookSpineShadow` — la parte del mockup che dava davvero l'identità
// "taccuino", non solo la palette.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, BookMarked, Wrench } from 'lucide-react'
import { FONT, TERRA } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TaccuinoPaperTexture, TaccuinoSpineShadow } from '@/lib/taccuinoTokens'
import BookSpineShadow from './BookSpineShadow'

const THEMES = {
  pergamena: {
    paperBg: '#fbf6e8', hairline: '#e4d9bd', inkMuted: '#a9915f', inkFooter: '#b5a677',
    pillBg: '#f1e9d2', pillText: '#6b6142',
  },
  taccuino: {
    // Fase 31 — `hairline` con opacità (non il colore pieno di `cardBorder`): la specifica chiede
    // separatori "marrone/beige molto tenue, opacità 0.4-0.6", non una linea piena come un bordo
    // di card. `80` = ~50% alpha in notazione hex a 8 cifre.
    paperBg: TACCUINO_PAPER.base, hairline: `${TACCUINO_PAPER.cardBorder}80`, inkMuted: TACCUINO_INK.handMuted,
    inkFooter: TACCUINO_INK.handMuted, pillBg: TACCUINO_PAPER.card, pillText: TACCUINO_INK.hand,
  },
} as const

/** Altezza riservata dalla barra inferiore fissa — le pagine applicano questo spazio prima della
 *  barra vera e propria per non lasciarci sotto l'ultima riga di contenuto. Stesso principio di
 *  MOBILE_TOPBAR_SPACER in components/Navbar.tsx, qui in fondo invece che in cima. */
const BOTTOM_BAR_SPACER = 'calc(env(safe-area-inset-bottom, 0px) + 68px)'

export interface BookPageSection {
  key: string
  label: string
  href: string
  icon?: ReactNode
}

interface BookPageProps {
  /** Titolo del Diario — sola visualizzazione, non più un link (Fase 17: "torna all'indice" vive
   *  ora nel bottone "Indice" della barra inferiore, un solo posto invece di due). */
  diarioTitle: string
  /** Destinazione del bottone "Indice"/"Diari" nella barra inferiore. */
  indexHref: string
  /** Etichetta di quel bottone — "Indice" (default, torna al Sommario del Diario corrente) o
   *  "Diari" (solo il Sommario stesso, dove porta invece allo scaffale — Fase 18). */
  indexLabel?: string
  /** Se presente, la barra inferiore mostra anche "Strumenti" — solo le pagine di Guida (dove
   *  esiste components/libro/PercorsoToolsDrawer.tsx) lo passano. */
  onToolsClick?: () => void
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
  /** Palette del guscio — "pergamena" (default, invariata) o "taccuino" (Fase 20). Il markup e il
   *  comportamento restano identici, cambiano solo i toni. */
  theme?: keyof typeof THEMES
  /** Lato della piega/rilegatura (Fase 21/35) — "left" di default. Guida e Resoconto la alternano
   *  pagina per pagina (pari→sinistra, dispari→destra) per simulare le pagine recto/verso di un
   *  libro vero; il Sommario non passa questo prop e resta sempre a sinistra, come richiesto
   *  esplicitamente (l'elenco Percorsi non è "una pagina" in una sequenza sfogliabile). */
  spineSide?: 'left' | 'right'
  children: ReactNode
}

export default function BookPage({
  diarioTitle, indexHref, indexLabel = 'Indice', onToolsClick, sectionLabel, prevHref, nextHref,
  sections, currentSectionKey, pageLabel, theme = 'pergamena', spineSide = 'left', children,
}: BookPageProps) {
  const t = THEMES[theme]
  const pathname = usePathname()
  const navButtonStyle = {
    fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.04em', fontSize: 9.5, color: t.inkMuted,
  }
  return (
    <div className="min-h-screen flex flex-col" style={{ background: t.paperBg }}>
      {theme === 'taccuino' ? (
        <>
          <TaccuinoPaperTexture />
          <TaccuinoSpineShadow side={spineSide} />
        </>
      ) : (
        <BookSpineShadow variant="light" side={spineSide} />
      )}
      <div
        className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-5 pb-3 border-b sticky top-0 z-10"
        style={{ borderColor: t.hairline, background: t.paperBg }}
      >
        <span
          className="flex items-center gap-1.5 shrink-0 min-w-0"
          style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: t.inkMuted }}
        >
          <BookMarked className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{diarioTitle}</span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className="block"
            style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: t.inkMuted }}
          >
            {sectionLabel}
          </span>
          {pageLabel && (
            <span className="block" style={{ fontFamily: FONT.mono, fontSize: 9, color: t.inkFooter }}>{pageLabel}</span>
          )}
        </span>
      </div>

      {sections && sections.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-5 sm:px-8 pt-3 pb-1" style={{ background: t.paperBg }}>
          {sections.map(s => {
            const on = s.key === currentSectionKey
            return (
              <Link
                key={s.key}
                href={s.href}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors"
                style={on ? { background: TERRA[600], color: '#fff' } : { background: t.pillBg, color: t.pillText }}
              >
                {s.icon}{s.label}
              </Link>
            )
          })}
        </div>
      )}

      {/* "Effetto pagina girata": rigioca un'animazione di ingresso (rotazione 3D con un piccolo
          rimbalzo che si assesta, più un'ombra che si muove in sincrono, vedi `.book-page-turn`
          in app/globals.css) a ogni cambio di pagina del libro, richiesto esplicitamente per
          "sembrare di sfogliare un taccuino" — poi reso più marcato/memorabile ispirandosi a
          turn.js su richiesta esplicita successiva. `key={pathname}` forza React a rimontare
          questo `<div>` a ogni navigazione: senza next/prev/sezioni cambiano solo i `props` di
          BookPage (stesso componente, stessa posizione nell'albero — Next.js App Router non
          rimonta da solo il componente pagina per un cambio di parametro dinamico), quindi senza
          una key esplicita l'animazione non ripartirebbe mai dopo il primo mount. Il verso della
          rotazione e dell'ombra segue `spineSide` (cardine/ombra dalla parte della piega, coerente
          con lo sfogliare fisico); l'angolo che si "srotola" (`.curl-left`/`.curl-right`, stesso
          file CSS) va invece nell'angolo inferiore OPPOSTO alla piega — richiesto esplicitamente
          per rinforzare la sensazione che la pagina si adagi fisicamente sul libro. */}
      <div
        key={pathname}
        className={`flex-1 min-h-0 px-5 sm:px-8 py-5 book-page-turn ${spineSide === 'left' ? 'curl-right' : 'curl-left'}`}
        style={{
          fontFamily: FONT.body,
          transformOrigin: spineSide === 'left' ? 'left center' : 'right center',
          '--page-turn-deg': spineSide === 'left' ? '-11deg' : '11deg',
          '--page-turn-shadow-dir': spineSide === 'left' ? 'right' : 'left',
        } as CSSProperties}
      >
        {children}
      </div>

      <div style={{ height: BOTTOM_BAR_SPACER }} />

      <div
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around"
        style={{
          background: t.pillBg, borderTop: `1px solid ${t.hairline}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          // Fase 31 — solo il taccuino: "una fascia di carta sovrapposta alla pagina", un'ombra
          // morbida verso l'alto invece del confine piatto di prima (la pergamena resta invariata).
          boxShadow: theme === 'taccuino' ? '0 -3px 10px rgba(41,35,30,0.06)' : undefined,
        }}
      >
        {prevHref ? (
          <Link href={prevHref} className="flex flex-col items-center justify-center gap-1 px-5 py-2.5" style={navButtonStyle}>
            <ChevronLeft className="w-[18px] h-[18px]" />
            Indietro
          </Link>
        ) : (
          <span className="flex flex-col items-center justify-center gap-1 px-5 py-2.5 opacity-30" style={navButtonStyle}>
            <ChevronLeft className="w-[18px] h-[18px]" />
            Indietro
          </span>
        )}

        <Link href={indexHref} className="flex flex-col items-center justify-center gap-1 px-5 py-2.5" style={navButtonStyle}>
          <BookMarked className="w-[18px] h-[18px]" />
          {indexLabel}
        </Link>

        {onToolsClick && (
          <button type="button" onClick={onToolsClick} className="flex flex-col items-center justify-center gap-1 px-5 py-2.5" style={{ ...navButtonStyle, color: TERRA[600] }}>
            <Wrench className="w-[18px] h-[18px]" />
            Strumenti
          </button>
        )}

        {nextHref ? (
          <Link href={nextHref} className="flex flex-col items-center justify-center gap-1 px-5 py-2.5" style={navButtonStyle}>
            <ChevronRight className="w-[18px] h-[18px]" />
            Avanti
          </Link>
        ) : (
          <span className="flex flex-col items-center justify-center gap-1 px-5 py-2.5 opacity-30" style={navButtonStyle}>
            <ChevronRight className="w-[18px] h-[18px]" />
            Avanti
          </span>
        )}
      </div>
    </div>
  )
}
