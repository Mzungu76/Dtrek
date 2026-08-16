'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, X, MessageCircleWarning } from 'lucide-react'
import { useSpeechDictation } from '@/lib/useSpeechDictation'
import { speak } from '@/lib/navigation/speech'

interface Props {
  hikeTitle: string
  nearestPoiName?: string
  nearestPoiDistanceM?: number
  distanceRemainingM?: number
  /** Il riconoscimento vocale del browser richiede quasi sempre connessione dati — vedi
   *  decisione aperta in docs/navigator-orizzonti-roadmap.md, Fase 10: questa feature è
   *  dichiarata esplicitamente solo-online, non degrada silenziosamente offline. */
  isOnline: boolean
}

/**
 * Fase 10 di docs/navigator-orizzonti-roadmap.md — "Giulia in cammino". Push-to-talk:
 * un tap avvia la dettatura (lib/useSpeechDictation.ts, già usata da FieldNoteSheet.tsx per le
 * note di campo), un secondo tap la ferma e invia la domanda trascritta a
 * app/api/guide/live-qa. La risposta viene letta ad alta voce (lib/navigation/speech.ts, coda
 * con priorità della Fase 6) oltre che mostrata a schermo, per chi preferisce non guardare il
 * telefono mentre cammina.
 *
 * Componente puramente additivo: riceve solo dati già calcolati altrove (titolo, POI più
 * vicino, distanza rimanente) e non tocca in nessun modo NavigationEngine/lo stato di
 * navigazione — rispetta il vincolo "read-only rispetto alla navigazione" della Fase 10.
 */
export default function GiuliaLiveQa({ hikeTitle, nearestPoiName, nearestPoiDistanceM, distanceRemainingM, isOnline }: Props) {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { recording, supported, toggleRecording } = useSpeechDictation(setTranscript)
  const transcriptRef = useRef('')
  transcriptRef.current = transcript
  const wasRecordingRef = useRef(false)

  const askGiulia = async (question: string) => {
    setAsking(true)
    setAnswer('')
    setError(null)
    let full = ''
    try {
      const res = await fetch('/api/guide/live-qa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, hikeTitle, nearestPoiName, nearestPoiDistanceM, distanceRemainingM }),
      })
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null)
        setError((d?.message as string) ?? 'Giulia non è disponibile al momento')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line) as { type: string; text?: string; message?: string }
          if (evt.type === 'delta' && evt.text) { full += evt.text; setAnswer((a) => a + evt.text) }
          else if (evt.type === 'error') setError(evt.message ?? 'Errore')
        }
      }
    } catch {
      setError('Impossibile contattare Giulia — controlla la connessione')
    } finally {
      setAsking(false)
      if (full.trim()) speak(full.trim(), { priority: 'normal' })
    }
  }

  // Appena la dettatura si ferma (secondo tap, o timeout del riconoscimento vocale), invia la
  // domanda accumulata — non c'è un tap "invia" separato, il push-to-talk è l'intera interazione.
  useEffect(() => {
    if (wasRecordingRef.current && !recording) {
      const q = transcriptRef.current.trim()
      if (q) askGiulia(q)
    }
    wasRecordingRef.current = recording
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  const handleTap = () => {
    if (!isOnline || !supported) return
    if (!open) { setOpen(true); setTranscript(''); setAnswer(''); setError(null) }
    toggleRecording()
  }

  if (!supported) return null

  return (
    <>
      <button
        onClick={handleTap}
        disabled={!isOnline}
        title={isOnline ? 'Chiedi a Giulia' : 'Richiede connessione'}
        className={`fixed z-30 right-3 bottom-28 w-12 h-12 rounded-full shadow-xl flex items-center justify-center border-2 border-white/70 active:scale-95 transition-transform disabled:opacity-40 ${
          recording ? 'bg-red-600' : 'bg-forest-600'
        }`}
      >
        {recording ? <Square className="w-4 h-4 text-white" /> : <Mic className="w-5 h-5 text-white" />}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-44 z-30 max-w-sm mx-auto rounded-2xl bg-white shadow-2xl border border-stone-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-forest-700 uppercase tracking-wide">Giulia in cammino</p>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700" aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </div>

          {recording && <p className="text-sm text-stone-500 italic">Ti ascolto…</p>}
          {!recording && transcript && <p className="text-sm text-stone-700 mb-2">&ldquo;{transcript}&rdquo;</p>}

          {asking && (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Giulia sta rispondendo…
            </div>
          )}
          {answer && <p className="text-sm text-stone-800 leading-relaxed">{answer}</p>}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <MessageCircleWarning className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>
      )}
    </>
  )
}
