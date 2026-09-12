'use client'
import { useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'

// Selettore "sposta qui" — l'alternativa raggiungibile (non solo trascinabile) per spostare un
// Diario in un'altra Raccolta o un Reportage in un altro Diario: stesso principio già in uso in
// app/resoconto/ResocontoHub.tsx (DiaryFilterOverlay/ManageReportageOverlay) per il caso gemello,
// qui generalizzato per servire entrambi i livelli senza duplicare il pannello.
export interface MovePickerOption {
  id: string
  title: string
}

interface MovePickerProps {
  title: string
  options: MovePickerOption[]
  excludeId?: string
  onSelect: (targetId: string) => Promise<void>
  onClose: () => void
}

export default function MovePicker({ title, options, excludeId, onSelect, onClose }: MovePickerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = options.filter(o => o.id !== excludeId)

  async function pick(id: string) {
    setBusyId(id); setError(null)
    try {
      await onSelect(id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-[24px] shadow-2xl max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
          <h2 className="font-display text-base font-bold text-stone-800">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto py-1">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-400 font-lora italic">Non c&apos;è nessun altro posto dove spostarlo.</p>
          ) : list.map(o => (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              disabled={busyId !== null}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b border-stone-50 disabled:opacity-60"
            >
              <span className="text-sm font-medium text-stone-700 truncate">{o.title}</span>
              {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin text-forest-600 shrink-0" /> : <Check className="w-4 h-4 text-transparent shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
