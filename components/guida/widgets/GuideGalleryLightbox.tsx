'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import SafeImg from '@/components/ui/SafeImg'

export interface GuideGalleryItem {
  imageUrl: string
  title: string
  /** Pagina Wikipedia/fonte da cui viene l'immagine — mostrata come link secondario, mai come unica
   *  via d'accesso alla foto (verifica utente: prima il tap sulla miniatura apriva subito quella
   *  pagina esterna invece di ingrandire la foto qui, come già fa la galleria dei Reportage). */
  sourceUrl: string
  sourceLabel: string
}

/**
 * Lightbox per la galleria fotografica della Guida (Wikipedia/fonti citate) — stessa UX di
 * app/resoconto/[id]/PhotoLightbox.tsx (frecce, tastiera, swipe), non lo stesso componente perché
 * lì le foto sono RoutePhoto (caricate dall'utente, con id/thumbUrl), qui sono hotlinkate da
 * un'URL esterna con una diversa forma dei dati.
 */
export default function GuideGalleryLightbox({ items, index, onNavigate, onClose }: {
  items: GuideGalleryItem[]; index: number; onNavigate: (index: number) => void; onClose: () => void
}) {
  const item = items[index]
  const hasPrev = index > 0
  const hasNext = index < items.length - 1
  const touchStartX = useRef<number | null>(null)

  const goPrev = useCallback(() => { if (hasPrev) onNavigate(index - 1) }, [hasPrev, index, onNavigate])
  const goNext = useCallback(() => { if (hasNext) onNavigate(index + 1) }, [hasNext, index, onNavigate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, onClose])

  if (!item) return null

  // Portal su document.body — verifica utente: le foto si aprivano "storte", il riquadro
  // schiacciato in una fascia più bassa dello schermo e le frecce finite sotto la foto invece che
  // ai lati. Causa: la Guida è montata dentro RouteHub.tsx's pannello "stage" (RoutePage), che ha
  // sempre un transform attivo (`transform: translateY(...)`, anche a 0px una volta aperto —
  // l'animazione di apertura della scheda) — QUALUNQUE transform su un antenato, anche a valore
  // nullo, diventa il nuovo contenitore per ogni discendente `position: fixed` invece della vera
  // finestra (stesso principio per SiteGuideOverlay.tsx, altro antenato `fixed` nel caso di una
  // Guida di Sito annidata) — da cui il riquadro schiacciato nell'altezza di quel pannello. Un
  // portal sposta il nodo DOM reale fuori da quella gerarchia, così il fixed torna relativo alla
  // vera finestra a prescindere da quanti antenati transformati ci siano nel mezzo.
  return createPortal(
    <div
      className="fixed inset-0 z-[95] bg-black/90 flex items-center justify-center p-4 print:hidden"
      onClick={onClose}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchStartX.current == null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        touchStartX.current = null
        if (dx > 50) goPrev()
        else if (dx < -50) goNext()
      }}
    >
      <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={onClose} aria-label="Chiudi">
        <X className="w-6 h-6" />
      </button>

      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); goPrev() }}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
          aria-label="Foto precedente"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); goNext() }}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
          aria-label="Foto successiva"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto hotlinkata dalla fonte, mai copiata sui nostri server */}
        <SafeImg key={item.imageUrl} src={item.imageUrl} alt={item.title} className="w-full max-h-[75vh] min-h-[160px] object-contain rounded-2xl shadow-2xl" />
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="font-body text-sm italic text-white/70 min-w-0 truncate">{item.sourceLabel}</p>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              Fonte <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-xs text-white/40">{index + 1} / {items.length}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
