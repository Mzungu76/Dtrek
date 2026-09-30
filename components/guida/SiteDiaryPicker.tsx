'use client'

import { BookOpen, X } from 'lucide-react'
import type { DiaryPrompt } from '@/lib/useSiteCheckIn'

/** Scelta del Diario per la visita a un Sito — mostrata da lib/useSiteCheckIn.ts solo quando la
 *  Meta non ha ancora un Diario e l'utente ne ha più d'uno (stesso "In quale Diario?" di
 *  components/upload/ActivityUploader.tsx). */
export default function SiteDiaryPicker({ prompt, onChoose, onCancel }: {
  prompt: DiaryPrompt | null
  onChoose: (diaryId: string) => void
  onCancel: () => void
}) {
  if (!prompt) return null
  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <BookOpen className="w-4 h-4 text-forest-600" /> In quale Diario?
          </p>
          <button onClick={onCancel} aria-label="Annulla" className="p-1 text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-2">
          {prompt.choices.map(d => (
            <button
              key={d.id}
              onClick={() => onChoose(d.id)}
              className="text-left rounded-xl border border-stone-200 px-3 py-2.5 text-[13.5px] font-medium text-stone-800 hover:bg-forest-50 hover:border-forest-300"
            >
              {d.title}{d.isDefault ? ' · predefinito' : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
