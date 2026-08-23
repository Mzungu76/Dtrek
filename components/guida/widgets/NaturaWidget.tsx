'use client'
import { useEffect, useRef, useState } from 'react'
import { FloraPanel } from '@/components/FloraPanel'
import { NatureGalleryContent } from '@/components/NatureGallery'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrackPoint } from '@/lib/tcxParser'

interface Props {
  hasGps: boolean
  flora?: FloraResult | null
  floraLoading: boolean
  trackPoints: TrackPoint[]
  /** 1-12 — month to use for the seasonal GBIF query (mese pianificato/di svolgimento). */
  month: number
}

// Quanto prima che la sezione entri davvero nello schermo si può iniziare a caricare — un piccolo
// margine così la mappa/galleria è già pronta (o quasi) quando l'utente ci arriva scrollando,
// invece di uno spinner che parte solo a sezione già visibile.
const OBSERVER_ROOT_MARGIN = '200px'

/** Flora (frase, sempre visibile) + mappa/selettore Flora-Fauna/galleria in linea (prima erano due
 *  link che aprivano un popup a parte, components/NatureGallery.tsx) — stesso trattamento di "I
 *  luoghi da non perdere" per i POI. La galleria non genera nessuna chiamata GBIF/iNaturalist
 *  finché questa sezione non entra davvero nello schermo (IntersectionObserver): chi non scrolla
 *  fin qui non fa scattare nulla, esattamente come col vecchio tap sul popup — solo senza il tap
 *  in mezzo. Una volta montata resta tale anche se si esce dallo schermo (niente smontaggio/
 *  rimontaggio che rifarebbe la richiesta). */
export default function NaturaWidget({ hasGps, flora, floraLoading, trackPoints, month }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible || !hasGps) return
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { rootMargin: OBSERVER_ROOT_MARGIN })
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, hasGps])

  return (
    <div className="space-y-4" ref={sectionRef}>
      {hasGps && <FloraPanel flora={flora ?? null} floraLoading={floraLoading} />}
      {hasGps && visible && (
        <NatureGalleryContent trackPoints={trackPoints} month={month} loadingTrack={false} initialLayer="flora" />
      )}
    </div>
  )
}
