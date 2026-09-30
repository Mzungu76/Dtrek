'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, X, MessageCircleWarning, Send, WifiOff } from 'lucide-react'
import { useSpeechDictation } from '@/lib/useSpeechDictation'
import { speak } from '@/lib/navigation/speech'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

interface Props {
  hikeTitle: string
  nearestPoiName?: string
  nearestPoiDistanceM?: number
  distanceRemainingM?: number
  /** Giulia in cammino chiama un'API (app/api/guide/live-qa) — a differenza della dettatura in
   *  sé (che su alcuni dispositivi funziona anche offline), la RISPOSTA richiede sempre
   *  connessione. Dichiarato esplicitamente in UI (messaggio + icona, vedi sotto) invece di
   *  lasciare che l'utente scopra il problema solo dopo aver già parlato o scritto una domanda. */
  isOnline: boolean
  /** Nasconde il pulsante flottante: in navigazione su percorso Giulia si apre da Strumenti. */
  hideFab?: boolean
  /** Ogni incremento apre il pannello (e avvia la dettatura come il tocco sul pulsante). */
  openSignal?: number
}

/**
 * Fase 10 di docs/navigator-orizzonti-roadmap.md — "Giulia in cammino". Push-to-talk quando la
 * dettatura è disponibile (lib/useSpeechDictation.ts — Web Speech API sul web, plugin nativo
 * @capacitor-community/speech-recognition sull'app Android, dove la prima semplicemente non
 * esiste), con un campo di testo sempre presente come alternativa: prima l'intera funzione era
 * silenziosamente inutilizzabile ogni volta che `supported` era false (component che si
 * smontava del tutto, `if (!supported) return null`), nessun modo di chiedere qualcosa senza
 * voce. La risposta viene letta ad alta voce (lib/navigation/speech.ts, coda con priorità della
 * Fase 6) oltre che mostrata a schermo, per chi preferisce non guardare il telefono mentre
 * cammina.
 *
 * Componente puramente additivo: riceve solo dati già calcolati altrove (titolo, POI più
 * vicino, distanza rimanente) e non tocca in nessun modo NavigationEngine/lo stato di
 * navigazione — rispetta il vincolo "read-only rispetto alla navigazione" della Fase 10.
 */
export default function GiuliaLiveQa({ hikeTitle, nearestPoiName, nearestPoiDistanceM, distanceRemainingM, isOnline, hideFab, openSignal }: Props) {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useModalBackHandler(open, () => setOpen(false))

  const { recording, supported, toggleRecording } = useSpeechDictation(setTranscript)
  const transcriptRef = useRef('')
  transcriptRef.current = transcript
  const wasRecordingRef = useRef(false)

  const askGiulia = async (question: string) => {
    setLastQuestion(question)
    setTranscript('')
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

  const handleOpen = () => {
    setOpen(true)
    setTranscript('')
    setLastQuestion('')
    setAnswer('')
    setError(null)
  }

  // Il tap sul pulsante apre sempre il pannello (anche offline o senza dettatura disponibile —
  // deve poter mostrare PERCHÉ non si può procedere, non limitarsi a non fare nulla), ma avvia
  // la registrazione solo quando ha senso farlo: online (la domanda va comunque spedita a
  // un'API) e con dettatura disponibile (altrimenti l'unica via è il campo di testo qui sotto).
  const handleFabTap = () => {
    if (!open) handleOpen()
    if (isOnline && supported) toggleRecording()
  }

  const lastSignalRef = useRef(openSignal ?? 0)
  useEffect(() => {
    if (openSignal == null || openSignal === lastSignalRef.current) return
    lastSignalRef.current = openSignal
    handleFabTap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  const handleSendText = () => {
    const q = transcript.trim()
    if (!q || !isOnline || asking) return
    askGiulia(q)
  }

  return (
    <>
      {!hideFab && <button
        onClick={handleFabTap}
        title={isOnline ? 'Chiedi a Giulia' : 'Giulia richiede connessione a Internet'}
        className={`fixed z-30 right-3 bottom-28 w-12 h-12 rounded-full shadow-xl flex items-center justify-center border-2 border-white/70 active:scale-95 transition-transform ${
          !isOnline ? 'bg-stone-400' : recording ? 'bg-red-600' : 'bg-forest-600'
        }`}
      >
        {!isOnline ? <WifiOff className="w-5 h-5 text-white" /> : recording ? <Square className="w-4 h-4 text-white" /> : <Mic className="w-5 h-5 text-white" />}
      </button>}

      {open && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+13rem)] z-30 max-w-sm mx-auto rounded-2xl bg-white shadow-2xl border border-stone-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-forest-700 uppercase tracking-wide">Giulia in cammino</p>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700" aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!isOnline ? (
            // Segnalato subito, prima di offrire qualunque input — rispondere richiede
            // comunque una chiamata di rete (app/api/guide/live-qa), quindi far scrivere o
            // dettare una domanda che non potrà mai essere inviata sarebbe solo fuorviante.
            <div className="flex items-start gap-2 text-sm text-stone-600">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              Giulia richiede una connessione a Internet per rispondere — riprova quando torni online.
            </div>
          ) : (
            <>
              {recording && <p className="text-sm text-stone-500 italic">Ti ascolto…</p>}
              {!recording && lastQuestion && <p className="text-sm text-stone-700 mb-2">&ldquo;{lastQuestion}&rdquo;</p>}

              {asking && (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Giulia sta rispondendo…
                </div>
              )}
              {answer && <p className="text-sm text-stone-800 leading-relaxed mb-2">{answer}</p>}
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 mb-2">
                  <MessageCircleWarning className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {/* Sempre disponibile, non solo quando la dettatura manca — prima l'unica
                  interazione possibile era la voce, senza alcuna alternativa se il
                  riconoscimento vocale non era supportato (l'intero componente spariva, vedi
                  il commento in cima al file) o semplicemente per chi preferisce scrivere. */}
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendText() }}
                  disabled={recording}
                  placeholder="Scrivi una domanda…"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-300 disabled:bg-stone-50"
                />
                {supported && (
                  <button
                    type="button"
                    onClick={toggleRecording}
                    title={recording ? 'Interrompi dettatura' : 'Detta la domanda'}
                    className={`flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 transition-colors ${
                      recording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'bg-forest-50 border-forest-200 text-forest-600 hover:bg-forest-100'
                    }`}
                  >
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendText}
                  disabled={!transcript.trim() || asking || recording}
                  title="Invia"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-forest-600 text-white shrink-0 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
