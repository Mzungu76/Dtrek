'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Camera, Mic, Square, Check, NotebookPen } from 'lucide-react'
import { useSpeechDictation } from '@/lib/useSpeechDictation'
import type { HikeNote } from '@/lib/blobStore'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

interface Props {
  position: { lat: number; lon: number } | null
  onSave: (note: HikeNote) => void
  onClose: () => void
  /** True when opened from the "Foto" quick action — jumps straight to the camera picker instead of the blank note form. */
  autoOpenCamera?: boolean
}

/**
 * Geolocated field note taken during a live hike — a photo of something the hiker finds
 * interesting and wants to remember, a written note, a voice-dictated note, or any
 * combination. Not a report to anyone: purely personal documentation, saved into the hike's
 * own notes (same HikeNote list shown later on the planning/activity page).
 *
 * Salvare non aspetta più il caricamento della foto: "Salva nota" scrive subito il riferimento
 * locale (la data URL appena scattata) e chiude il foglio all'istante — prima invece restava
 * aperto con uno spinner per tutta la durata dell'upload verso Supabase Storage, anche con
 * connessione perfetta, perché la nota non veniva considerata "salvata" finché quella chiamata
 * di rete non finiva. Il caricamento vero avviene poi in background: il chiamante
 * (ActiveNavigationView.tsx/app/navigatore/traccia/page.tsx) lancia
 * lib/offline/retryFieldNotePhotos.ts subito dopo aver ricevuto la nota (oltre che al prossimo
 * evento 'online' se in quel momento non c'è linea) — stessa infrastruttura già usata per il
 * retry, solo innescata anche appena la nota viene salvata, non solo alla riconnessione.
 */
export default function FieldNoteSheet({ position, onSave, onClose, autoOpenCamera }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { recording, supported: speechSupported, toggleRecording } = useSpeechDictation(setText)
  // Il salvataggio è sincrono da quando non aspetta più l'upload della foto (vedi il commento
  // sopra) — senza questo guard, un doppio tocco rapido prima che React smonti il foglio poteva
  // far scattare handleSave due volte e duplicare la nota.
  const savedRef = useRef(false)

  useModalBackHandler(true, onClose)

  useEffect(() => {
    if (autoOpenCamera) fileRef.current?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => setDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const canSave = !!dataUrl || !!text.trim()

  function handleSave() {
    if (!canSave || savedRef.current) return
    savedRef.current = true
    onSave({
      id: crypto.randomUUID(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
      lat: position?.lat,
      lon: position?.lon,
      photoUrl: dataUrl ?? undefined,
      photoPending: dataUrl ? true : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#fdfcfa] rounded-t-2xl shadow-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-stone-800 flex items-center gap-1.5">
            <NotebookPen className="w-4 h-4 text-terra-600" /> Nota sul campo
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" aria-label="Chiudi">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-stone-500 mb-3">
          Fotografa, scrivi o detta un appunto su qualcosa che ti interessa lungo il percorso — resta nel tuo diario di questa escursione.
        </p>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-stone-200 rounded-xl h-28 flex items-center justify-center mb-3 cursor-pointer overflow-hidden"
        >
          {dataUrl ? <img src={dataUrl} alt="" className="w-full h-full object-cover" /> : (
            <span className="flex flex-col items-center gap-1 text-stone-400">
              <Camera className="w-6 h-6" />
              <span className="text-xs">Aggiungi una foto (opzionale)</span>
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        <div className="flex items-start gap-2 mb-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={speechSupported ? 'Scrivi o detta un appunto (opzionale)…' : 'Scrivi un appunto (opzionale)…'}
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-forest-300"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleRecording}
              title={recording ? 'Interrompi dettatura' : 'Detta un appunto vocale'}
              className={`flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 transition-colors ${
                recording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'bg-forest-50 border-forest-200 text-forest-600 hover:bg-forest-100'
              }`}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>

        {!position && <p className="text-xs text-amber-600 mb-2">Posizione GPS non disponibile al momento — la nota verrà salvata senza coordinate.</p>}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-terra-500 text-white font-semibold text-sm disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          Salva nota
        </button>
      </div>
    </div>
  )
}
