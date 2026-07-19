'use client'
import { useState } from 'react'
import { GUIDE_CONTENT } from '@/lib/guideContent'
import { GuideThemeContext } from '@/lib/guideTheme'

const PANEL_BASE = 'rounded-xl p-3 text-xs leading-relaxed whitespace-normal space-y-1.5'
const PANEL_LIGHT = 'bg-white/97 backdrop-blur-sm border border-stone-200 text-stone-600 shadow-md'
const PANEL_DARK = 'bg-black/35 backdrop-blur-md border border-white/15 text-white/85 shadow-lg max-h-56 overflow-y-auto overscroll-contain'

interface ToggleProps {
  section: string
  open: boolean
  onToggle: () => void
  onDark?: boolean
}

/** Il bottoncino "i"/"×" da solo — usato quando il pannello va mostrato altrove (es. Bacheca, dove
 *  deve comparire sotto il grafico invece che accanto al titolo). Lo stato open è del chiamante. */
export function InfoToggleButton({ section, open, onToggle, onDark }: ToggleProps) {
  if (!GUIDE_CONTENT[section]) return null
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      className={`w-4 h-4 rounded-full text-[10px] font-bold transition-colors inline-flex items-center justify-center shrink-0 ${
        onDark ? 'bg-white/85 text-stone-700 hover:bg-white' : 'bg-stone-200 text-stone-600 hover:bg-forest-100 hover:text-forest-700'
      }`}
      title={open ? 'Nascondi la spiegazione' : 'Scopri di più'}
      aria-expanded={open}
      aria-label={open ? 'Nascondi la spiegazione' : 'Mostra la spiegazione'}
    >
      {open ? '×' : 'i'}
    </button>
  )
}

interface PanelProps {
  section: string
  open: boolean
  onDark?: boolean
  className?: string
}

/** Il testo di spiegazione da solo, scorrevole verticalmente entro un'altezza massima quando
 *  onDark (sovraimpressione su foto a schermo fisso in Bacheca, dove non c'è scroll di pagina a
 *  fare da valvola di sfogo per contenuti lunghi). */
export function InfoPanel({ section, open, onDark, className = '' }: PanelProps) {
  const entry = GUIDE_CONTENT[section]
  if (!entry || !open) return null
  return (
    <GuideThemeContext.Provider value={onDark ? 'dark' : 'light'}>
      <div
        className={`${PANEL_BASE} ${onDark ? PANEL_DARK : PANEL_LIGHT} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        <p className={`font-semibold flex items-center gap-1.5 ${onDark ? 'text-white' : 'text-stone-800'}`}>
          <span>{entry.icon}</span> {entry.title}
        </p>
        {entry.body}
      </div>
    </GuideThemeContext.Provider>
  )
}

interface Props {
  section: string
  /** Contesto scuro (es. sovraimpressione su una foto in Bacheca) — schiarisce il pulsante "i" e
   *  ridisegna il pannello senza sfondo bianco quando espanso. */
  onDark?: boolean
}

/**
 * Bottone "i" che espande la spiegazione DIRETTAMENTE sul posto (non apre più un pannello a tutto
 * schermo — quello, GuideOverlay/TabGuida, è stato rimosso: stesso identico testo, ora in
 * lib/guideContent.tsx). Bottone e pannello restano adiacenti: usato ovunque tranne in Bacheca, dove
 * InfoToggleButton e InfoPanel sono montati separatamente perché il testo deve comparire sotto il
 * grafico invece che accanto al titolo.
 */
export default function InfoButton({ section, onDark }: Props) {
  const [open, setOpen] = useState(false)
  if (!GUIDE_CONTENT[section]) return null

  return (
    <>
      <InfoToggleButton section={section} open={open} onToggle={() => setOpen(o => !o)} onDark={onDark} />
      <InfoPanel section={section} open={open} onDark={onDark} className="w-full mt-2" />
    </>
  )
}
