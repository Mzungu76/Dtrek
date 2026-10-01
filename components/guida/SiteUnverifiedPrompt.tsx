'use client'

import { MapPinOff, X } from 'lucide-react'
import type { UnverifiedPrompt } from '@/lib/useSiteCheckIn'

function distanceLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`
}

function messageFor(p: UnverifiedPrompt): string {
  switch (p.outcome) {
    case 'out_of_range':
      return `Dalla tua posizione risulti a circa ${distanceLabel(p.distanceM ?? 0)} da questo sito: non posso confermare che tu ci sia stato.`
    case 'low_accuracy':
      return 'Il segnale GPS è troppo impreciso per dire dove ti trovi: non posso confermare che tu sia al sito.'
    case 'approximate':
      return 'Per questo sito conosco solo la zona (il centro del Comune), non il punto esatto: non posso verificare la tua presenza.'
    default:
      return 'Non riesco a leggere la tua posizione: non posso confermare che tu sia al sito.'
  }
}

/** Il check-in di un Sito non ha provato la presenza: prima di registrare la visita come "non
 *  verificata" (e di crearne il Reportage) lo si dice e si chiede conferma — mai un salvataggio
 *  silenzioso che sembri andato a buon fine. */
export default function SiteUnverifiedPrompt({ prompt, onAccept, onCancel }: {
  prompt: UnverifiedPrompt | null
  onAccept: () => void
  onCancel: () => void
}) {
  if (!prompt) return null
  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <MapPinOff className="w-4 h-4 text-amber-600" /> Visita non verificabile
          </p>
          <button onClick={onCancel} aria-label="Annulla" className="p-1 text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[13px] leading-relaxed text-stone-600 mb-4">{messageFor(prompt)}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-50">
            Annulla
          </button>
          <button onClick={onAccept} className="flex-1 rounded-xl bg-amber-600 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-700">
            Registra come non verificata
          </button>
        </div>
      </div>
    </div>
  )
}
