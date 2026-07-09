'use client'
import { useState, useRef, type FormEvent } from 'react'
import { MessageCircleQuestion, Send, Loader2 } from 'lucide-react'

interface QAEntry {
  question: string
  answer?: string
  pertinent?: boolean
  error?: string
}

const MAX_QUESTION_LENGTH = 300

/** Domande e risposte sul percorso — l'utente chiede qualcosa di specifico sulla guida appena
 *  letta e Giulia risponde in modo sintetico, solo se la domanda è pertinente al percorso.
 *  Cronologia tenuta solo in sessione (non persistita): domande diverse ad ogni lettura. */
export default function GuideQA({ hikeId }: { hikeId: string }) {
  const [question, setQuestion] = useState('')
  const [entries,  setEntries]  = useState<QAEntry[]>([])
  const [asking,   setAsking]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || asking) return

    setAsking(true)
    setQuestion('')
    const idx = entries.length
    setEntries(prev => [...prev, { question: q }])

    try {
      const res = await fetch('/api/guide/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId, question: q }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`)
      setEntries(prev => prev.map((entry, i) => i === idx
        ? { ...entry, answer: json.answer, pertinent: json.pertinent }
        : entry))
    } catch (err) {
      setEntries(prev => prev.map((entry, i) => i === idx
        ? { ...entry, error: err instanceof Error ? err.message : 'Errore durante la richiesta' }
        : entry))
    } finally {
      setAsking(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3" style={{ background: '#813619' }}>
        <div className="w-1.5 h-6 rounded-full bg-white/25 shrink-0" />
        <div className="flex items-center gap-2 text-white">
          <MessageCircleQuestion className="w-4 h-4 opacity-80" />
          <h2 className="font-display text-[12px] font-bold tracking-[2px] uppercase">Chiedi a Giulia</h2>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        <p className="text-[13px] text-stone-500 mb-4">
          Hai un dubbio su questo percorso? Chiedi pure — Giulia risponde solo a domande pertinenti a questa escursione.
        </p>

        {entries.length > 0 && (
          <div className="space-y-4 mb-4">
            {entries.map((entry, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[14px] font-semibold text-stone-700">{entry.question}</p>
                {entry.error && (
                  <p className="text-[13px] text-red-500">{entry.error}</p>
                )}
                {!entry.error && entry.answer === undefined && (
                  <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic">
                    <Loader2 className="w-3 h-3 animate-spin" /> Giulia sta pensando…
                  </p>
                )}
                {entry.answer !== undefined && (
                  <p className={`text-[14px] leading-relaxed ${entry.pertinent === false ? 'italic text-stone-400' : 'text-stone-600'}`}>
                    {entry.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, MAX_QUESTION_LENGTH))}
            placeholder="Es. dove trovo l'acqua lungo il percorso?"
            disabled={asking}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-full border border-stone-200 text-[14px] text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-terra-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white transition-colors"
          >
            {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  )
}
