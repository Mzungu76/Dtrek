'use client'
import { useState } from 'react'
import { Mic, Square, Plus, Trash2, NotebookPen } from 'lucide-react'
import type { HikeNote } from '@/lib/blobStore'
import { useSpeechDictation } from '@/lib/useSpeechDictation'

interface Props {
  notes: HikeNote[]
  onChange: (notes: HikeNote[]) => void
}

function getCurrentPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 },
    )
  })
}

export default function HikeNotesRecorder({ notes, onChange }: Props) {
  const [draft, setDraft] = useState('')
  const { recording, supported, toggleRecording } = useSpeechDictation(setDraft)

  const addNote = async () => {
    const text = draft.trim()
    if (!text) return
    const pos = await getCurrentPosition()
    const note: HikeNote = {
      id:        crypto.randomUUID(),
      text,
      timestamp: new Date().toISOString(),
      lat:       pos?.lat,
      lon:       pos?.lon,
    }
    onChange([...notes, note])
    setDraft('')
  }

  const removeNote = (id: string) => onChange(notes.filter(n => n.id !== id))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-4 h-4 text-forest-600" />
        <span className="text-sm font-semibold text-stone-700">Appunti escursione</span>
      </div>

      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={supported ? 'Scrivi o registra un appunto vocale…' : 'Scrivi un appunto…'}
          rows={2}
          className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-forest-300"
        />
        <div className="flex flex-col gap-1.5 shrink-0">
          {supported && (
            <button
              type="button"
              onClick={toggleRecording}
              title={recording ? 'Interrompi registrazione' : 'Registra vocale'}
              className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
                recording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'bg-forest-50 border-forest-200 text-forest-600 hover:bg-forest-100'
              }`}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={addNote}
            disabled={!draft.trim()}
            title="Aggiungi appunto"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-terra-500 text-white disabled:opacity-40 hover:bg-terra-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.slice().reverse().map(note => (
            <li key={note.id} className="flex items-start justify-between gap-2 px-3 py-2 bg-stone-50 rounded-xl border border-stone-100">
              {note.photoUrl && (
                <img src={note.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                {note.text && <p className="text-sm text-stone-700 break-words">{note.text}</p>}
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {new Date(note.timestamp).toLocaleString('it-IT')}
                </p>
              </div>
              <button onClick={() => removeNote(note.id)} title="Elimina appunto"
                className="shrink-0 text-stone-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
