'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Share2, Loader2, ChevronDown } from 'lucide-react'

export interface ExportMenuAction {
  id: string
  label: string
  icon: ReactNode
  run: () => void | Promise<void>
}

interface ExportMenuProps {
  actions: ExportMenuAction[]
  label?: string
  /** Classi del bottone che apre il menu — lo stile resta a chi lo usa (hero scuro, toolbar chiara, ecc). */
  className?: string
  align?: 'left' | 'right'
}

/**
 * Menu unico di esportazione/condivisione, al posto delle azioni sparse
 * (PDF/Excel/Word/GPX/link pubblico) ripetute su più schermate. Non
 * introduce nuovi motori di export: ogni azione richiama quelli già
 * esistenti (utils/pdfExport.ts, lib/pdfPaginate.ts, utils/exportExcel.ts,
 * ecc.) tramite la callback `run`. Piano di ristrutturazione, Parte 2.2.
 */
export default function ExportMenu({ actions, label = 'Esporta', className, align = 'right' }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function run(action: ExportMenuAction) {
    if (busyId) return
    setBusyId(action.id)
    try {
      await action.run()
    } finally {
      setBusyId(null)
      setOpen(false)
    }
  }

  if (actions.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={className ?? 'flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors'}
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 w-56 bg-white rounded-xl border border-stone-200 shadow-lg z-50 py-1 overflow-hidden`}>
          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => run(a)}
              disabled={busyId !== null}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              {busyId === a.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <span className="shrink-0">{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
