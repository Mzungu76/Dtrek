'use client'
import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Foglio a comparsa dal basso — pattern condiviso da Diario ("Filtra e
 * ordina"), Escursione ("Altro") ed Esplora (filtri), al posto dei
 * controlli sempre visibili o dei popover annidati di oggi.
 */
export default function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-[26px] shadow-2xl px-6 pt-3 pb-8 animate-in slide-in-from-bottom-4 duration-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}
      >
        <div className="w-9 h-1 bg-stone-200 rounded-full mx-auto mb-4" />
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-forest-900">{title}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
