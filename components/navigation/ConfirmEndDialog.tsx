'use client'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Central modal (not a toast/one-tap action) — ending navigation is
 * consequential enough during a real hike that it must require a
 * deliberate second action, not something that can happen by an
 * accidental tap on the close button or a stray back-gesture.
 */
export default function ConfirmEndDialog({ onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Terminare la navigazione?</h2>
        <p className="text-sm text-slate-600 mb-6">
          Il tracciamento GPS, gli avvisi fuori-percorso e i punti di interesse si fermeranno. Potrai riaprire questa escursione in seguito, ma la sessione attuale verrà conclusa.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600"
          >
            Termina escursione
          </button>
        </div>
      </div>
    </div>
  )
}
