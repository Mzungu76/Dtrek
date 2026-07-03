'use client'
import { useRef, useState } from 'react'
import { X, Camera, Mic, Square, Check, Loader2, NotebookPen } from 'lucide-react'
import { useSpeechDictation } from '@/lib/useSpeechDictation'
import { uploadFieldNotePhoto } from '@/lib/fieldNotePhotos'
import type { HikeNote } from '@/lib/blobStore'

interface Props {
  hikeId: string
  position: { lat: number; lon: number } | null
  onSave: (note: HikeNote) => void
  onClose: () => void
}

/**
 * Geolocated field note taken during a live hike — a photo of something the hiker finds
 * interesting and wants to remember, a written note, a voice-dictated note, or any
 * combination. Not a report to anyone: purely personal documentation, saved into the hike's
 * own notes (same HikeNote list shown later on the planning/activity page).
 */
export default function FieldNoteSheet({ hikeId, position, onSave, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { recording, supported: speechSupported, toggleRecording } = useSpeechDictation(setText)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => setDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const canSave = !!dataUrl || !!text.trim()

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const id = crypto.randomUUID()
    try {
      let photo: { url: string; storagePath: string } | null = null
      if (dataUrl) photo = await uploadFieldNotePhoto(hikeId, id, dataUrl)
      onSave({
        id,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        lat: position?.lat,
        lon: position?.lon,
        photoUrl: photo?.url,
        photoStoragePath: photo?.storagePath,
      })
      onClose()
    } catch {
      setError('Salvataggio non riuscito. Riprova.')
    } finally {
      setSaving(false)
    }
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
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-terra-500 text-white font-semibold text-sm disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salva nota
        </button>
      </div>
    </div>
  )
}
