'use client'

import { useCallback, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { RoutePhoto } from '@/lib/activityPhotos'

/** Lightbox con navigazione tra tutte le foto (frecce, tastiera, swipe) invece di una sola foto
 *  senza uscita — vedi components/resoconto/ReportReader.tsx, che tiene solo l'indice corrente
 *  in stato e passa qui l'intero array di foto. */
export function PhotoLightbox({ photos, index, onNavigate, onClose }: {
  photos: RoutePhoto[]; index: number; onNavigate: (index: number) => void; onClose: () => void
}) {
  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1
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

  if (!photo) return null

  return (
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
        <img src={photo.url} alt={photo.caption} className="w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl" />
        <div className="flex items-center justify-between gap-3 mt-3">
          {photo.caption && <p className="font-body text-sm italic text-white/70 min-w-0 truncate">{photo.caption}</p>}
          <p className="text-xs text-white/40 shrink-0 ml-auto">{index + 1} / {photos.length}</p>
        </div>
      </div>
    </div>
  )
}
