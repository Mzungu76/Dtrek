'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TornFrame, tornVariant } from '@/components/TornFrame'
import { TACCUINO_PAPER } from '@/lib/taccuinoTokens'

/** Ritardo fra un foglio e il successivo — stesso valore usato nel mockup approvato. */
const STAGGER_S = 0.22
/** Deve combaciare con la durata di `.paper-hinge` in app/globals.css. */
const HINGE_DURATION_S = 0.68

interface Props {
  /** Seme per il taglio/nastro del foglio 0 (tornVariant) — stesso principio di TornFrame
   *  altrove: mai casuale, così la stessa card si "straccia" sempre allo stesso modo. */
  id: string
  open: boolean
  /** Contenuto sempre visibile — il foglio 0, invariato: bottone/intestazione con lo stesso
   *  bordo strappato e nastro di sempre (TornFrame). */
  header: ReactNode
  /** Fogli aggiuntivi, rivelati in sequenza quando `open` — di norma uno solo (il blocco che
   *  oggi appare/scompare con un conditional render). Reggerebbe una catena più lunga (le
   *  cerniere sono annidate correttamente, non sorelle — l'unico modo per cui le rotazioni si
   *  compongono fisicamente), ma lo spazio riservato sotto (vedi `ResizeObserver` sotto) oggi
   *  misura solo il PRIMO foglio: va bene per ogni chiamante attuale (tutti a un foglio solo),
   *  da estendere se in futuro servisse davvero una catena di più fogli. */
  sheets: ReactNode[]
  className?: string
}

function buildChain(sheets: ReactNode[], i: number, open: boolean, measureRef: React.RefObject<HTMLDivElement>): ReactNode {
  if (i >= sheets.length) return null
  const delay = (open ? i : sheets.length - 1 - i) * STAGGER_S
  return (
    <div className="paper-hinge" style={{ transitionDelay: `${delay}s` }}>
      <div className="paper-hinge-face paper-hinge-face-back" />
      <div className="paper-hinge-face">
        <div className="paper-crease-line" />
        <div ref={i === 0 ? measureRef : undefined} style={{ background: TACCUINO_PAPER.light }}>{sheets[i]}</div>
      </div>
      {buildChain(sheets, i + 1, open, measureRef)}
    </div>
  )
}

/**
 * Card espandibile "a fisarmonica di carta" — sostituisce il vecchio `{open && <div>...}` con
 * un foglio che si apre fisicamente (rotateX su una cerniera), non un accordion CSS. Mai
 * height/max-height/scaleY sul CONTENUTO: solo rotazione (vedi .paper-hinge in globals.css).
 *
 * Il contenitore stesso, però, deve riservare spazio per i fogli aperti (sono `position:
 * absolute`, non spingono da soli il resto della pagina) — un margine che scatta ISTANTANEO
 * (mai animato, e misurato dal vero contenuto via `ResizeObserver`, non un valore a caso) appena
 * si apre, e resta finché il foglio non ha finito di richiudersi, cronometrato con un timeout
 * pari alla durata reale della cerniera: la spaziatura della pagina cambia di scatto (come farebbe
 * un `<details>` nativo), il movimento vero — quello che l'utente deve percepire — resta tutto e
 * solo nella rotazione del foglio.
 */
export function PaperAccordion({ id, open, header, sheets, className }: Props) {
  const [reserving, setReserving] = useState(open)
  const [reservedHeight, setReservedHeight] = useState(0)
  const measureRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!measureRef.current) return
    const ro = new ResizeObserver(([entry]) => setReservedHeight(entry.target.scrollHeight))
    ro.observe(measureRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current)
      setReserving(true)
      return
    }
    const totalMs = Math.round((STAGGER_S * (sheets.length - 1) + HINGE_DURATION_S) * 1000)
    closeTimer.current = setTimeout(() => setReserving(false), totalMs)
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheets.length])

  return (
    <div
      className={`paper-accordion ${open ? 'open' : ''} ${className ?? ''}`}
      style={{ marginBottom: reserving ? reservedHeight : 0 }}
    >
      <TornFrame size="card" variant={tornVariant(id)}>{header}</TornFrame>
      {buildChain(sheets, 0, open, measureRef)}
    </div>
  )
}
