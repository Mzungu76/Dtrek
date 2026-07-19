'use client'
import { useState } from 'react'
import { GUIDE_CONTENT } from '@/lib/guideContent'

interface Props {
  section: string
  /** Contesto scuro (es. sovraimpressione su una foto in Bacheca) — schiarisce il pulsante "i" per
   *  restare leggibile; il pannello di spiegazione resta sempre bianco in entrambi i casi. */
  onDark?: boolean
}

/**
 * Bottone "i" che espande la spiegazione DIRETTAMENTE sul posto (non apre più un pannello a tutto
 * schermo — quello, GuideOverlay/TabGuida, è stato rimosso: stesso identico testo, ora in
 * lib/guideContent.tsx). Il chiamante deve aggiungere `flex-wrap` al contenitore flex del titolo
 * perché il blocco espanso (w-full) vada a capo invece di stringersi accanto al testo.
 */
export default function InfoButton({ section, onDark }: Props) {
  const [open, setOpen] = useState(false)
  const entry = GUIDE_CONTENT[section]
  if (!entry) return null

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`w-4 h-4 rounded-full text-[10px] font-bold transition-colors inline-flex items-center justify-center shrink-0 ${
          onDark ? 'bg-white/85 text-stone-700 hover:bg-white' : 'bg-stone-200 text-stone-600 hover:bg-forest-100 hover:text-forest-700'
        }`}
        title={open ? 'Nascondi la spiegazione' : 'Scopri di più'}
        aria-expanded={open}
        aria-label={open ? 'Nascondi la spiegazione' : 'Mostra la spiegazione'}
      >
        {open ? '×' : 'i'}
      </button>
      {open && (
        <div
          className="w-full mt-2 bg-white/97 backdrop-blur-sm border border-stone-200 rounded-xl p-3 text-xs text-stone-600 leading-relaxed whitespace-normal space-y-1.5 shadow-md"
          onClick={e => e.stopPropagation()}
        >
          <p className="font-semibold text-stone-800 flex items-center gap-1.5">
            <span>{entry.icon}</span> {entry.title}
          </p>
          {entry.body}
        </div>
      )}
    </>
  )
}
