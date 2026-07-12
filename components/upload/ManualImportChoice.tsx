'use client'
import { useState } from 'react'
import { Sparkles, PencilLine, ChevronRight } from 'lucide-react'
import ManualPlanUploader from './ManualPlanUploader'
import AiRouteSearch from './AiRouteSearch'

type Mode = 'choice' | 'ai' | 'manual'

/**
 * Schermata di scelta davanti al tab "Manuale" — affianca la ricerca guidata dall'AI (nuova) al
 * form esistente (invariato, ManualPlanUploader), senza sostituirlo. Vedi mockup approvato
 * dall'utente prima dell'implementazione.
 */
export default function ManualImportChoice() {
  const [mode, setMode] = useState<Mode>('choice')

  if (mode === 'manual') return <ManualPlanUploader />
  if (mode === 'ai') return <AiRouteSearch onBack={() => setMode('choice')} />

  return (
    <div className="space-y-3">
      <button
        onClick={() => setMode('ai')}
        className="w-full text-left rounded-2xl border border-terra-200 bg-gradient-to-br from-terra-50 to-white p-5 flex flex-col gap-2 hover:border-terra-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-terra-500 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-display text-base font-semibold text-stone-800">Cerca con l&apos;AI</h3>
        </div>
        <p className="text-sm text-stone-500">
          Descrivi una zona, un parco, un nome anche parziale — Giulia cerca il percorso giusto e prova a trovarne la traccia reale.
        </p>
        <span className="mt-1 inline-flex items-center gap-1 self-start px-3.5 py-1.5 rounded-full bg-terra-500 text-white text-xs font-semibold uppercase tracking-wide">
          Inizia la ricerca <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>

      <button
        onClick={() => setMode('manual')}
        className="w-full text-left rounded-2xl border border-stone-200 bg-white p-5 flex flex-col gap-2 hover:border-stone-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
            <PencilLine className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-display text-base font-semibold text-stone-800">Inserisci a mano</h3>
        </div>
        <p className="text-sm text-stone-500">
          Hai già tutti i dati? Compila tu nome, distanza e dislivello — nessun cambiamento rispetto a oggi.
        </p>
        <span className="mt-1 inline-flex items-center gap-1 self-start px-3.5 py-1.5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold uppercase tracking-wide">
          Apri il modulo <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>
    </div>
  )
}
