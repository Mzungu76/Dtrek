'use client'
import { useState, useRef, useEffect, type FormEvent } from 'react'
import { MessageCircleQuestion, Send, Loader2, Link2 } from 'lucide-react'

interface QASource { url: string; title: string }

interface QAEntry {
  question: string
  status?: string
  answer?: string
  pertinent?: boolean
  sources?: QASource[]
  error?: string
}

const MAX_QUESTION_LENGTH = 300

/** Copia minima dei dati del percorso già disponibili qui in locale (hike è cache-first, vedi
 *  lib/plannedStore.ts) — mandata al server solo come fallback per quando la sua lettura Supabase
 *  fresca fallisse (blackout), non sostituisce mai quella lettura quando riesce. */
export interface GuideQAHikeFallback {
  title?: string
  distanceMeters?: number
  elevationGain?: number
  estimatedTimeSeconds?: number
  assessment?: unknown
  cachedPois?: unknown
  cachedPoiWiki?: unknown
  cachedGuide?: string
}

/** Domande e risposte sul percorso — l'utente chiede qualcosa di specifico sulla guida appena
 *  letta e Giulia risponde in modo sintetico, solo se la domanda è pertinente al percorso.
 *  La risposta arriva in streaming (NDJSON, vedi app/api/guide/qa/route.ts) con aggiornamenti sullo
 *  stato ("sto verificando online…") così l'attesa non è mai un semplice spinner muto.
 *  Ogni domanda/risposta è persistita lato server (tabella guide_questions) e ricaricata qui al
 *  primo render, così la cronologia sopravvive alla chiusura della guida. */
export default function GuideQA({ hikeId, hikeFallback }: { hikeId: string; hikeFallback?: GuideQAHikeFallback }) {
  const [question, setQuestion] = useState('')
  const [entries,  setEntries]  = useState<QAEntry[]>([])
  const [asking,   setAsking]   = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingHistory(true)
    fetch(`/api/guide/qa?hikeId=${encodeURIComponent(hikeId)}`)
      .then(res => res.ok ? res.json() : { entries: [] })
      .then(json => { if (!cancelled) setEntries(json.entries ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingHistory(false) })
    return () => { cancelled = true }
  }, [hikeId])

  function patchEntry(idx: number, patch: Partial<QAEntry>) {
    setEntries(prev => prev.map((entry, i) => i === idx ? { ...entry, ...patch } : entry))
  }

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
        body: JSON.stringify({ hikeId, question: q, hikeFallback }),
      })

      if (!res.ok || !res.body) {
        let message = `HTTP ${res.status}`
        try { const j = await res.json(); message = j.message ?? j.error ?? message } catch {}
        throw new Error(message)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line)
          if (evt.type === 'status') patchEntry(idx, { status: evt.text })
          else if (evt.type === 'delta') setEntries(prev => prev.map((entry, i) => i === idx
            ? { ...entry, status: undefined, answer: (entry.answer ?? '') + evt.text }
            : entry))
          else if (evt.type === 'done') patchEntry(idx, { pertinent: evt.pertinent, sources: evt.sources, status: undefined })
          else if (evt.type === 'error') throw new Error(evt.message)
        }
      }
    } catch (err) {
      patchEntry(idx, { error: err instanceof Error ? err.message : 'Errore durante la richiesta', status: undefined })
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

        {loadingHistory && entries.length === 0 && (
          <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic mb-4">
            <Loader2 className="w-3 h-3 animate-spin" /> Carico le domande già poste su questo percorso…
          </p>
        )}

        {entries.length > 0 && (
          <div className="space-y-4 mb-4">
            {entries.map((entry, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[14px] font-semibold text-stone-700">{entry.question}</p>
                {entry.error && (
                  <p className="text-[13px] text-red-500">{entry.error}</p>
                )}
                {!entry.error && entry.status && (
                  <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic">
                    <Loader2 className="w-3 h-3 animate-spin" /> {entry.status}
                  </p>
                )}
                {!entry.error && !entry.status && entry.answer === undefined && (
                  <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic">
                    <Loader2 className="w-3 h-3 animate-spin" /> Giulia sta pensando…
                  </p>
                )}
                {entry.answer !== undefined && (
                  <p className={`text-[14px] leading-relaxed ${entry.pertinent === false ? 'italic text-stone-400' : 'text-stone-600'}`}>
                    {entry.answer}
                  </p>
                )}
                {entry.sources && entry.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {entry.sources.map((s, si) => (
                      <a
                        key={si}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[10px] text-stone-500"
                        title={s.url}
                      >
                        <Link2 className="w-2.5 h-2.5 shrink-0 text-stone-400" />
                        <span className="truncate">{s.title}</span>
                      </a>
                    ))}
                  </div>
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
