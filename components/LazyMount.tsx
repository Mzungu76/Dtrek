'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Rimanda il montaggio dei figli finché non stanno per entrare nel viewport, poi li monta una
 * volta per tutte (non li smonta più uscendo dal viewport: per una mappa Leaflet lo smontaggio
 * e rimontaggio ripetuti sarebbero più costosi del vantaggio).
 *
 * Pensato per contenuti pesanti ripetuti molte volte in una pagina lunga — nel Diario, una mappa
 * Leaflet per ogni escursione narrata. Senza, tutte le istanze si montavano insieme al primo
 * render, anche quelle a migliaia di pixel fuori schermo: con 50 resoconti erano 50 mappe vive
 * contemporaneamente, ognuna con il proprio `tileLayer` che scarica tile da `/api/tile` — centinaia
 * di richieste simultanee al solo apertura della pagina.
 */
export function LazyMount({
  children, placeholder, rootMargin = '600px', height,
}: {
  children: ReactNode
  placeholder?: ReactNode
  rootMargin?: string
  /** Se il contenitore non ha già un'altezza propria (es. da CSS esterno), quella da riservare
   *  per il placeholder — evita che la pagina "salti" quando il contenuto reale si monta. */
  height?: number | string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible || !ref.current) return
    const el = ref.current
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [visible, rootMargin])

  return (
    <div ref={ref} style={{ height: height ?? '100%' }}>
      {visible ? children : placeholder}
    </div>
  )
}
