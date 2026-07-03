'use client'
import { useRef, useState } from 'react'
import { X, Camera, Send, Loader2, CheckCircle2 } from 'lucide-react'
import { submitCivicReport } from '@/lib/civicReports'

interface Props {
  position: { lat: number; lon: number } | null
  plannedHikeId?: string
  onClose: () => void
}

/**
 * "Sentinella civica" — a user-initiated photo+GPS reporting flow (unusual morphological
 * patterns, fallen trees, damaged trail sections...), not automatic detection. Modal rather
 * than a bottom sheet like PoiCalloutSheet/RiddleSheet: this one is a deliberate action the
 * hiker opts into, not a passive notification, so it can afford to be more form-like.
 */
export default function CivicReportSheet({ position, plannedHikeId, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => setDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!dataUrl || !position) return
    setSubmitting(true)
    setError(null)
    try {
      await submitCivicReport({ dataUrl, lat: position.lat, lon: position.lon, note, plannedHikeId })
      setDone(true)
    } catch {
      setError('Invio non riuscito. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#fdfcfa] rounded-t-2xl shadow-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-stone-800">Segnala</h3>
          <button onClick={onClose} className="p-1.5 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" aria-label="Chiudi">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-forest-600">
            <CheckCircle2 size={32} />
            <p className="text-sm font-semibold">Segnalazione inviata, grazie!</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-stone-500 mb-3">
              Foto e posizione GPS per segnalare qualcosa di insolito lungo il percorso
              (frana, albero caduto, sentiero danneggiato…).
            </p>

            {!position && <p className="text-xs text-red-500 mb-2">Posizione GPS non disponibile al momento.</p>}

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-stone-200 rounded-xl h-32 flex items-center justify-center mb-3 cursor-pointer overflow-hidden"
            >
              {dataUrl ? <img src={dataUrl} alt="" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-stone-400" />}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            />

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descrivi brevemente cosa hai visto (opzionale)"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-forest-300"
            />

            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={!dataUrl || !position || submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-terra-500 text-white font-semibold text-sm disabled:opacity-40"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia segnalazione
            </button>
          </>
        )}
      </div>
    </div>
  )
}
