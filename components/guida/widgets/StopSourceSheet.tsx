'use client'

import { useEffect } from 'react'
import { X, ExternalLink } from 'lucide-react'

export interface StopSourceSheetData {
  name: string
  description?: string
  thumbnail?: string
  url?: string
  sourceLabel: string
}

/**
 * Pagina di lettura in-app per una tappa — verifica utente: prima "Fonte" apriva subito Wikipedia
 * in un'altra scheda del browser, ora resta un tap "dentro l'app" a leggibilità piena (stesso
 * testo esteso già in stop.description, solo senza il ritaglio della timeline compatta). Il link
 * esterno vero resta disponibile, ma solo come azione esplicita e secondaria in fondo — mai la
 * destinazione di default del tap, stesso principio già applicato in GuideGalleryLightbox. */
export default function StopSourceSheet({ data, onClose }: { data: StopSourceSheetData; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg sm:rounded-2xl bg-white max-h-[85vh] flex flex-col overflow-hidden rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        {data.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- foto hotlinkata dalla fonte, mai copiata sui nostri server
          <img src={data.thumbnail} alt="" className="w-full h-40 object-cover shrink-0" />
        )}
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <h3 className="font-display text-lg font-semibold text-stone-800 leading-tight">{data.name}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 shrink-0" aria-label="Chiudi">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2">
          <p className="text-[14px] text-stone-600 leading-relaxed whitespace-pre-line">{data.description}</p>
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-stone-400 hover:text-stone-600 transition-colors"
            >
              Apri {data.sourceLabel} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
