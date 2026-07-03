'use client'
import { useState } from 'react'
import { X, HelpCircle } from 'lucide-react'

interface Props {
  question: string
  answer: string
  onClose: () => void
}

/**
 * Non-blocking bottom sheet for a trail riddle ("caccia al tesoro calibrata"), triggered by
 * the same proximity mechanism as POI callouts (see ActiveNavigationView.tsx). Question shown
 * first, tap to reveal the answer — same simple, non-demanding interaction as PoiCalloutSheet.
 */
export default function RiddleSheet({ question, answer, onClose }: Props) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-3 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md rounded-t-2xl bg-[#fdfcfa] shadow-2xl border border-stone-200 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="p-2 rounded-full bg-terra-50 text-terra-600 flex-shrink-0">
            <HelpCircle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-terra-600 uppercase tracking-wide font-body mb-1">Indovinello</div>
            <p className="text-sm text-stone-800 font-body">{question}</p>
            {revealed ? (
              <p className="text-sm text-forest-700 font-body font-semibold mt-2">{answer}</p>
            ) : (
              <button
                onClick={() => setRevealed(true)}
                className="mt-2 text-xs font-semibold text-terra-600 underline underline-offset-2"
              >
                Svela la risposta
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex-shrink-0" aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
