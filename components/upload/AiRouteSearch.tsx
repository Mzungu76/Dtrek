'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Sparkles, Send, Loader2, MapPin, TrendingUp, CheckCircle,
  ExternalLink, AlertTriangle, Check, X as XIcon,
} from 'lucide-react'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { triggerBackgroundScores } from '@/lib/cl/triggerBackgroundScores'
import { defaultPendingExpiresAt } from './sharedHelpers'
import type { SearchResultCandidate } from '@/app/api/route-search/route'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

type View = 'chat' | 'results' | 'confirm'

interface ResolvedTrack {
  trackPoints: PlannedHike['trackPoints']
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

function verdictStyle(v: string) {
  if (v === 'adatto') return { badge: 'bg-forest-50 text-forest-700 border-forest-200', Icon: Check, label: 'Adatto a te' }
  if (v === 'sconsigliato') return { badge: 'bg-red-50 text-red-700 border-red-200', Icon: XIcon, label: 'Sconsigliato per te' }
  return { badge: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertTriangle, label: 'Da valutare' }
}

export default function AiRouteSearch({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [view, setView] = useState<View>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [candidates, setCandidates] = useState<SearchResultCandidate[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [needsKey, setNeedsKey] = useState(false)

  const [selected, setSelected] = useState<SearchResultCandidate | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolvedTrack | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

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
        setCandidates(found)
        setMessages(m => [...m, {
          role: 'assistant',
          text: found.length > 0
            ? `Ho trovato ${found.length} percors${found.length === 1 ? 'o' : 'i'}. Dai un'occhiata qui sotto.`
            : 'Non ho trovato percorsi che corrispondono — prova a darmi qualche indicazione in più.',
        }])
        if (found.length > 0) setView('results')
      }
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSending(false)
    }
  }

  async function chooseCandidate(c: SearchResultCandidate) {
    setSelected(c)
    setTitle(c.name)
    setDate('')
    setResolved(null)
    setView('confirm')
    if (c.hasGpsTrack && (c.osmId != null || c.gpxUrl)) {
      setResolving(true)
      try {
        const res = await fetch('/api/route-search/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ osmId: c.osmId, gpxUrl: c.gpxUrl }),
        })
        const data = await res.json()
        if (data.ok) setResolved(data)
      } catch {}
      setResolving(false)
    }
  }

  async function handleImport() {
    if (!selected) return
    setSaving(true)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const distanceMeters = resolved?.distanceMeters || (selected.distanceKm ? selected.distanceKm * 1000 : 0)
      const elevationGain = resolved?.elevationGain ?? (selected.elevationGainM ?? 0)

      const hike: PlannedHike = {
        id: 'aisearch_' + Date.now().toString(36),
        title: title.trim() || selected.name,
        plannedDate: date || undefined,
        userNotes: selected.description,
        createdAt: new Date().toISOString(),
        distanceMeters,
        elevationGain,
        elevationLoss: resolved?.elevationLoss ?? 0,
        altitudeMax: resolved?.altitudeMax ?? 0,
        altitudeMin: resolved?.altitudeMin ?? 0,
        estimatedTimeSeconds: resolved?.estimatedTimeSeconds || Math.round((distanceMeters / 1000 / 4) * 3600),
        osmId: selected.osmId ?? undefined,
        trackPoints: resolved?.trackPoints?.length ? resolved.trackPoints : undefined,
        routePolyline: resolved?.trackPoints?.length ? downsamplePolyline(resolved.trackPoints) : undefined,
        pendingExpiresAt,
      }

      if (hike.trackPoints?.length) {
        const gps = hike.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        if (gps.length >= 2) {
          try {
            const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
            const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
            if (pois?.length) {
              hike.cachedPois = pois
              const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
              if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
            }
          } catch {}
        }
      }

      await savePlanned(hike)
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})
      triggerBackgroundScores(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  if (view === 'chat') return (
    <div className="bg-white rounded-2xl border border-stone-200 flex flex-col h-[520px]">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-150">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:text-stone-700 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-terra-500 text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-800">Cerca con l&apos;AI</p>
          <p className="text-xs text-stone-400">Racconta cosa stai cercando</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-stone-400 leading-relaxed">
            Es. &quot;Un sentiero ad anello nei Monti Cimini, zona Soriano, circa 10 km&quot;, oppure solo il nome di un parco o di una regione — ti farò qualche domanda se serve.
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
          placeholder="Scrivi cosa stai cercando…"
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

  // ── Results ───────────────────────────────────────────────────────────────

  if (view === 'results') return (
    <div className="space-y-3">
      <button onClick={() => setView('chat')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Torna alla ricerca
      </button>
      {candidates.map((c, i) => {
        const vs = verdictStyle(c.comfortVerdict)
        return (
          <div key={i} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className={`h-1 ${c.hasGpsTrack ? 'bg-forest-500' : 'bg-stone-300'}`} />
            <div className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display text-base font-semibold text-stone-800">{c.name}</h4>
                  <p className="text-xs text-stone-400 mt-0.5">{c.zone}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide
                  ${c.hasGpsTrack ? 'bg-forest-50 text-forest-700' : 'bg-stone-100 text-stone-500'}`}>
                  <MapPin className="w-3 h-3" /> {c.hasGpsTrack ? 'Traccia GPS trovata' : 'Nessuna traccia GPS'}
                </span>
              </div>

              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold text-stone-800">{c.distanceKm != null ? `${c.hasGpsTrack ? '' : '~'}${c.distanceKm.toFixed(1)} km` : '—'}</span>
                  <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
                </div>
                <div>
                  <span className="font-semibold text-stone-800 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{c.elevationGainM != null ? `${c.hasGpsTrack ? '' : '~'}${Math.round(c.elevationGainM)} m` : '—'}</span>
                  <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello</p>
                </div>
                <div>
                  <span className="font-semibold text-stone-800 capitalize">{c.difficulty}</span>
                  <p className="text-[10px] uppercase tracking-wide text-stone-400">Difficoltà</p>
                </div>
              </div>

              <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${vs.badge}`}>
                <vs.Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{vs.label}</p>
                  {c.comfortNote && <p className="mt-0.5 opacity-90">{c.comfortNote}</p>}
                </div>
              </div>

              <p className="text-sm text-stone-600 leading-relaxed">{c.description}</p>

              <div className="flex items-center justify-between pt-1">
                {c.sourceUrl ? (
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
                    <ExternalLink className="w-3 h-3" /> Fonte
                  </a>
                ) : <span />}
                <button onClick={() => chooseCandidate(c)}
                  className="px-4 py-2 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors">
                  Importa
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── Confirm ───────────────────────────────────────────────────────────────

  if (view === 'confirm' && selected) {
    const vs = verdictStyle(selected.comfortVerdict)
    const distanceKm = resolved?.distanceMeters ? resolved.distanceMeters / 1000 : selected.distanceKm
    const elevGain = resolved?.elevationGain ?? selected.elevationGainM
    const estimated = !resolved?.hasElevation

    return (
      <div className="space-y-4">
        <button onClick={() => setView('results')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Torna ai risultati
        </button>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Data <span className="font-normal text-stone-400">(opzionale)</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>

          {resolving ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Recupero traccia e quota reali…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Distanza', val: distanceKm != null ? `${estimated ? '~' : ''}${distanceKm.toFixed(1)} km` : '—' },
                { label: 'Dislivello +', val: elevGain != null ? `${estimated ? '~' : ''}${Math.round(elevGain)} m` : '—' },
                { label: 'Quota max', val: resolved?.altitudeMax ? `${Math.round(resolved.altitudeMax)} m` : '—' },
                { label: 'Difficoltà', val: selected.difficulty },
              ].map(s => (
                <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
                  <p className="text-[10px] text-stone-400">{s.label}</p>
                  <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                </div>
              ))}
            </div>
          )}

          <div className={`flex items-start gap-2 px-3.5 py-3 rounded-xl border text-sm ${vs.badge}`}>
            <vs.Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{vs.label}</p>
              {selected.comfortNote && <p className="mt-0.5 text-xs opacity-90">{selected.comfortNote}</p>}
            </div>
          </div>

          <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-800">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              {resolved?.trackPoints?.length
                ? 'Come un import GPX: mappa, profilo altimetrico e punti di interesse verranno elaborati automaticamente dopo l\'import.'
                : 'Percorso senza traccia GPS reale: la guida verrà comunque generata, ma senza mappa né profilo altimetrico — come un import manuale.'}
            </p>
          </div>
        </div>

        {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

        <button onClick={handleImport} disabled={saving || resolving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
          Importa e apri la guida
        </button>
      </div>
    )
  }

  return null
}
