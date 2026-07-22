'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import type { SearchResultCandidate } from '@/app/api/route-search/route'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Pannello di chat con Giulia (ricerca AI di un percorso già documentato altrove, /api/route-search)
 * — estratto da quello che era components/upload/AiRouteSearch.tsx per essere incorporato nello
 * step "Partenza" del wizard "Costruisci un percorso" (components/upload/RouteBuilder.tsx) invece
 * che come schermata a sé stante. Stessa identica logica di chat multi-turno (comprese le eventuali
 * domande di chiarimento di Giulia) — solo dimensionato per stare inline in uno step, e senza vista
 * risultati/conferma propria: i candidati trovati vengono passati al chiamante via `onFound`, che li
 * fonde nella lista unica del wizard invece di mostrarli qui.
 */
export default function GiuliaSearchPanel({ onFound }: { onFound: (candidates: SearchResultCandidate[]) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [needsKey, setNeedsKey] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setOptions([])
    setSending(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/route-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'no_ai_access') setNeedsKey(true)
        setErrorMsg(data.message || 'Ricerca non riuscita, riprova.')
        return
      }
      if (data.kind === 'clarify') {
        setMessages(m => [...m, { role: 'assistant', text: data.question }])
        setOptions(data.options ?? [])
      } else {
        const found = (data.candidates ?? []) as SearchResultCandidate[]
        setMessages(m => [...m, {
          role: 'assistant',
          text: found.length > 0
            ? `Ho trovato ${found.length} percors${found.length === 1 ? 'o' : 'i'}. Dai un'occhiata qui sotto.`
            : 'Non ho trovato percorsi che corrispondono — prova a darmi qualche indicazione in più.',
        }])
        if (found.length > 0) onFound(found)
      }
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 flex flex-col h-[360px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-stone-400 leading-relaxed">
            Es. &quot;Un sentiero ad anello nei Monti Cimini, zona Soriano, circa 10 km&quot;, oppure
            solo il nome di un parco o di una regione — ti farò qualche domanda se serve.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-terra-500 text-white rounded-br-md' : 'bg-stone-100 text-stone-800 rounded-bl-md'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-stone-100 text-stone-500 px-3.5 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2 text-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sto cercando…
            </div>
          </div>
        )}
        {options.length > 0 && !sending && (
          <div className="flex flex-wrap gap-2 pl-1">
            {options.map(o => (
              <button key={o} onClick={() => send(o)}
                className="px-3.5 py-2 rounded-full text-xs font-medium border border-stone-300 text-stone-700 bg-white hover:border-terra-400 transition-colors">
                {o}
              </button>
            ))}
          </div>
        )}
        {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}
        {needsKey && (
          <p className="text-xs text-stone-500">
            Aggiungi la tua chiave API Claude in <a href="/profilo/ai" className="text-terra-600 underline">Profilo → AI</a> per usare la ricerca.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-stone-150">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input) }}
          placeholder="Descrivi il percorso che cerchi…"
          disabled={sending}
          className="flex-1 border-none outline-none text-sm bg-stone-50 rounded-full px-4 py-2.5 text-stone-800 placeholder:text-stone-400"
        />
        <button onClick={() => send(input)} disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-full bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
