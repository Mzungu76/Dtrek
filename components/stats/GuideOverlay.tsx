'use client'
import { X } from 'lucide-react'
import TabGuida from './TabGuida'

interface Props {
  anchor: string | null
  onClose: () => void
}

/**
 * Il tab "Guida" (355 righe di documentazione statica) non è più un tab
 * alla pari degli altri: le icone "i" sparse per Statistiche aprono
 * questo overlay, scorrendo direttamente al termine richiesto, senza
 * far perdere lo stato del tab attivo sottostante. TabGuida resta
 * l'unica fonte del contenuto (nessuna duplicazione). Piano di
 * ristrutturazione, Parte 2.6.
 */
export default function GuideOverlay({ anchor, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-stone-50 w-full h-full sm:h-[85vh] sm:max-w-2xl sm:rounded-2xl shadow-2xl overflow-y-auto relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="fixed sm:sticky top-3 right-3 sm:float-right sm:mr-3 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-800 transition-colors"
          aria-label="Chiudi guida"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-4 sm:p-6 pt-14 sm:pt-4">
          <TabGuida initialAnchor={anchor} />
        </div>
      </div>
    </div>
  )
}
