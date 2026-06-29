'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Plus, Trash2, NotebookPen } from 'lucide-react'
import type { HikeNote } from '@/lib/blobStore'

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

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
  const [draft, setDraft]         = useState('')
  const [recording, setRecording] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop()
      setRecording(false)
      return
    }
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    const recognition = new SR()
    recognition.lang = 'it-IT'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setDraft(text)
    }
    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }

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
              <div className="min-w-0">
                <p className="text-sm text-stone-700 break-words">{note.text}</p>
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
