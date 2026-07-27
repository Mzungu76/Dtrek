'use client'
import { useState } from 'react'

export const SAFETY_DISCLAIMER_TEXT =
  'Punteggio stimato, non una garanzia. Condizioni meteo, forma del giorno e imprevisti non sono ' +
  'prevedibili. La decisione finale e la responsabilità restano sempre tue.'

/**
 * Richiamo al disclaimer di Sicurezza, in due varianti:
 * - "popup": asterisco discreto che apre una piccola nuvoletta al tap — per le copertine delle
 *   schede in Guida, dove il testo per esteso non ci sta.
 * - "inline": testo per esteso, sempre visibile — per la sezione punteggi della scheda aperta
 *   ("Dati e sicurezza"), dove lo spazio c'è e nasconderlo dietro un tap sarebbe solo un ostacolo.
 */
export default function SafetyDisclaimer({ variant, dark }: { variant: 'popup' | 'inline'; dark?: boolean }) {
  const [open, setOpen] = useState(false)

  if (variant === 'inline') {
    return (
      <p className={`text-[11px] leading-snug ${dark ? 'text-white/55' : 'text-stone-400'}`}>
        {SAFETY_DISCLAIMER_TEXT}
      </p>
    )
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        aria-label="Nota sull'affidabilità del punteggio"
        className={`text-sm font-bold leading-none ${dark ? 'text-white/60 hover:text-white/90' : 'text-stone-400 hover:text-stone-700'}`}
      >
        *
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false) }} />
          <div
            className="absolute z-50 top-full right-0 mt-1.5 w-56 p-2.5 rounded-xl bg-stone-900/95 backdrop-blur-md text-white text-[11px] leading-snug shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {SAFETY_DISCLAIMER_TEXT}
          </div>
        </>
      )}
    </span>
  )
}
