'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPlannedById, updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, BookOpen, Volume2, VolumeX, Play, Pause, Square,
  RefreshCw, Loader2, MapPin, Mountain, Clock, Route,
  Leaf, Utensils, ShieldCheck, Compass, Info,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  title: string
  body:  string
  icon:  React.ReactNode
  color: string
}

// ── Parse guide text into sections ────────────────────────────────────────────

const SECTION_META: Record<string, { icon: React.ReactNode; color: string }> = {
  'prima di partire': { icon: <Compass className="w-5 h-5" />, color: '#d97706' },
  'il percorso':      { icon: <Route    className="w-5 h-5" />, color: '#16a34a' },
  'i luoghi':         { icon: <MapPin   className="w-5 h-5" />, color: '#7c3aed' },
  'la natura':        { icon: <Leaf     className="w-5 h-5" />, color: '#0f766e' },
  'sapori':           { icon: <Utensils className="w-5 h-5" />, color: '#b45309' },
  'consigli':         { icon: <ShieldCheck className="w-5 h-5" />, color: '#0369a1' },
}

function sectionMeta(title: string) {
  const key = title.toLowerCase()
  for (const [k, v] of Object.entries(SECTION_META)) {
    if (key.includes(k)) return v
  }
  return { icon: <Info className="w-5 h-5" />, color: '#78716c' }
}

function parseGuide(text: string): Section[] {
  const parts = text.split(/^## /m).filter(Boolean)
  return parts.map(part => {
    const nl = part.indexOf('\n')
    const title = nl === -1 ? part.trim() : part.slice(0, nl).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    const { icon, color } = sectionMeta(title)
    return { title, body, icon, color }
  })
}

// ── Web Speech helpers ────────────────────────────────────────────────────────

function getItalianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang === 'it-IT' && v.localService) ??
    voices.find(v => v.lang === 'it-IT') ??
    voices.find(v => v.lang.startsWith('it')) ??
    null
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const RATES = [0.8, 1, 1.2, 1.5]

export default function GuidaPage() {
  const { id }  = useParams() as { id: string }
  const hikeId  = decodeURIComponent(id)
  const router  = useRouter()

  const [hike,      setHike]      = useState<PlannedHike | null>(null)
  const [guideText, setGuideText] = useState<string>('')
  const [sections,  setSections]  = useState<Section[]>([])
  const [loading,   setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Voice state
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isPaused,     setIsPaused]     = useState(false)
  const [rateIdx,      setRateIdx]      = useState(1)           // default 1×
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [charOffset,   setCharOffset]   = useState(0)           // char index in full text
  const utterRef   = useRef<SpeechSynthesisUtterance | null>(null)
  const fullText   = useRef<string>('')        // full plain text for TTS
  const sectionOffsets = useRef<number[]>([]) // char start of each section in fullText

  // Load hike metadata + cached guide from DB
  useEffect(() => {
    getPlannedById(hikeId).then(h => {
      setHike(h)
      if (h?.cachedGuide) {
        setGuideText(h.cachedGuide)
        setSections(parseGuide(h.cachedGuide))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [hikeId])

  // Keep fullText ref and sectionOffsets in sync
  useEffect(() => {
    if (!sections.length) { fullText.current = guideText; return }
    const parts: string[] = []
    const offsets: number[] = []
    let pos = 0
    sections.forEach(s => {
      offsets.push(pos)
      const block = `${s.title}\n${s.body}\n\n`
      parts.push(block)
      pos += block.length
    })
    fullText.current = parts.join('')
    sectionOffsets.current = offsets
  }, [sections, guideText])

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setGuideText('')
    setSections([])
    stopVoice()

    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Errore sconosciuto' }))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setGuideText(acc)
        setSections(parseGuide(acc))
      }

      // Save to DB (fire-and-forget, non-blocking)
      updatePlannedMeta(hikeId, { cachedGuide: acc }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la generazione')
    } finally {
      setGenerating(false)
    }
  }, [hikeId])

  // ── Voice controls ────────────────────────────────────────────────────────

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setIsPlaying(false)
    setIsPaused(false)
    setActiveSection(null)
    setCharOffset(0)
  }

  function speak(text: string, startSection = 0) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    // Build text starting from a given section
    const sectionsFromStart = sections.slice(startSection)
    const speakText = sectionsFromStart
      .map(s => `${s.title}.\n${s.body}`)
      .join('\n\n')
      || text

    const utt = new SpeechSynthesisUtterance(speakText)
    utt.lang  = 'it-IT'
    utt.rate  = RATES[rateIdx]
    utt.pitch = 1.0

    const voice = getItalianVoice()
    if (voice) utt.voice = voice

    // Track character position to highlight current section
    const baseOffset = sectionOffsets.current[startSection] ?? 0
    utt.onboundary = (ev) => {
      if (ev.name !== 'word') return
      const absoluteChar = baseOffset + ev.charIndex
      setCharOffset(absoluteChar)
      // Find which section we're in
      const idx = sectionOffsets.current.findLastIndex(off => off <= absoluteChar)
      if (idx >= 0) setActiveSection(idx)
    }

    utt.onend  = () => { setIsPlaying(false); setIsPaused(false); setActiveSection(null) }
    utt.onerror = () => { setIsPlaying(false); setIsPaused(false) }

    utterRef.current = utt
    window.speechSynthesis.speak(utt)
    setIsPlaying(true)
    setIsPaused(false)
    setActiveSection(startSection)
  }

  function togglePlayPause() {
    if (!('speechSynthesis' in window)) return

    if (!isPlaying && !isPaused) {
      speak(fullText.current, 0)
      return
    }
    if (isPlaying) {
      window.speechSynthesis.pause()
      setIsPlaying(false)
      setIsPaused(true)
      return
    }
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPlaying(true)
      setIsPaused(false)
    }
  }

  function changeRate(idx: number) {
    setRateIdx(idx)
    // If currently speaking, restart from current section
    if ((isPlaying || isPaused) && activeSection !== null) {
      window.speechSynthesis.cancel()
      setTimeout(() => speak(fullText.current, activeSection), 80)
    }
  }

  function speakSection(idx: number) {
    speak(fullText.current, idx)
  }

  // Cleanup on unmount
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (!hike) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-amber-50">
        <p className="text-stone-500 text-lg">Percorso non trovato</p>
        <button onClick={() => router.push('/programma')} className="text-sky-600 hover:underline">
          ← Torna alle pianificate
        </button>
      </div>
    )
  }

  const hasGuide = guideText.trim().length > 50

  return (
    <div className="min-h-screen bg-amber-50">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-amber-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-13 flex items-center justify-between gap-3 py-2.5">
          <button
            onClick={() => router.push(`/programma/${encodeURIComponent(hikeId)}`)}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Percorso</span>
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-stone-800 truncate">{hike.title}</span>
          </div>

          {/* Voice quick controls */}
          {hasGuide && (
            <div className="flex items-center gap-1 shrink-0">
              {RATES.map((r, i) => (
                <button
                  key={r}
                  onClick={() => changeRate(i)}
                  className={`text-xs px-1.5 py-0.5 rounded font-mono transition-colors ${
                    rateIdx === i
                      ? 'bg-amber-500 text-white'
                      : 'text-stone-400 hover:text-stone-700'
                  }`}
                >
                  {r}×
                </button>
              ))}
              <button
                onClick={togglePlayPause}
                disabled={!hasGuide}
                className={`ml-1 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isPlaying || isPaused
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              {(isPlaying || isPaused) && (
                <button
                  onClick={stopVoice}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                >
                  <Square className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-widest">
              Guida Escursionistica
            </span>
          </div>
          <h1 className="text-3xl font-bold text-stone-900 leading-tight mb-4">
            {hike.title}
          </h1>

          {/* Stats pills */}
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { icon: <Route className="w-3.5 h-3.5" />,    val: `${(hike.distanceMeters/1000).toFixed(1)} km` },
              { icon: <Mountain className="w-3.5 h-3.5" />, val: `${Math.round(hike.elevationGain)} m D+` },
              { icon: <Mountain className="w-3.5 h-3.5" />, val: `${Math.round(hike.altitudeMax)} m slm` },
              { icon: <Clock className="w-3.5 h-3.5" />,    val: formatDuration(hike.estimatedTimeSeconds) },
            ].map(({ icon, val }) => (
              <span key={val} className="flex items-center gap-1.5 bg-white border border-amber-100 text-stone-600 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">
                <span className="text-amber-500">{icon}</span>
                {val}
              </span>
            ))}
            {hike.plannedDate && (
              <span className="flex items-center gap-1.5 bg-amber-500 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                {format(new Date(hike.plannedDate + 'T12:00'), "d MMM yyyy", { locale: it })}
              </span>
            )}
          </div>
        </div>

        {/* ── No guide yet ──────────────────────────────────────────────────── */}
        {!hasGuide && !generating && (
          <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
              <BookOpen className="w-9 h-9 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-800 mb-2">
                Nessuna guida ancora generata
              </h2>
              <p className="text-stone-500 text-sm max-w-sm mx-auto">
                Giulia elaborerà una guida personalizzata raccontando storia, natura,
                curiosità e consigli pratici per questo percorso.
              </p>
            </div>
            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                {error}
              </p>
            )}
            <button
              onClick={generate}
              className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-2xl shadow-md hover:shadow-lg transition-all text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Genera la guida con Giulia
            </button>
          </div>
        )}

        {/* ── Generating stream ──────────────────────────────────────────────── */}
        {generating && sections.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
              <BookOpen className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <p className="text-stone-700 font-semibold">Giulia sta scrivendo…</p>
              <p className="text-stone-400 text-sm mt-1">ci vorranno circa 20-30 secondi</p>
            </div>
          </div>
        )}

        {/* ── Voice player bar ───────────────────────────────────────────────── */}
        {hasGuide && !generating && (
          <div className="mb-8 bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Volume2 className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-stone-700">
                  {isPlaying && activeSection !== null
                    ? `Ascoltando: ${sections[activeSection]?.title ?? '…'}`
                    : isPaused
                      ? 'In pausa'
                      : 'Guida vocale — voce italiana'}
                </p>
                {isPlaying && (
                  <div className="mt-1.5 h-1 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{
                        width: fullText.current.length > 0
                          ? `${Math.min(100, (charOffset / fullText.current.length) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {RATES.map((r, i) => (
                  <button
                    key={r}
                    onClick={() => changeRate(i)}
                    className={`text-xs px-2 py-1 rounded-lg font-mono transition-colors ${
                      rateIdx === i
                        ? 'bg-amber-500 text-white font-bold'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    {r}×
                  </button>
                ))}
              </div>

              <button
                onClick={togglePlayPause}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all shadow-sm ${
                  isPlaying || isPaused
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                {isPlaying
                  ? <Pause className="w-4 h-4" />
                  : <Play className="w-4 h-4 ml-0.5" />
                }
              </button>

              {(isPlaying || isPaused) && (
                <button
                  onClick={stopVoice}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}

              {!('speechSynthesis' in (typeof window !== 'undefined' ? window : {})) && (
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <VolumeX className="w-3.5 h-3.5" /> Non supportato
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Guide sections ─────────────────────────────────────────────────── */}
        {sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((s, i) => (
              <div
                key={i}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-300 ${
                  activeSection === i
                    ? 'border-amber-300 shadow-amber-100 shadow-md ring-1 ring-amber-200'
                    : 'border-amber-50 hover:border-amber-100'
                }`}
              >
                {/* Section header */}
                <div
                  className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer select-none"
                  style={{ borderBottom: `2px solid ${s.color}18` }}
                  onClick={() => speakSection(i)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: s.color + '18', color: s.color }}
                    >
                      {s.icon}
                    </span>
                    <h2 className="font-bold text-stone-800 text-base">{s.title}</h2>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); speakSection(i) }}
                    className="p-1.5 rounded-full hover:bg-amber-50 text-stone-300 hover:text-amber-500 transition-colors shrink-0"
                    title="Ascolta questa sezione"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Section body */}
                <div className="px-5 py-4">
                  {s.body.split('\n').filter(Boolean).map((para, pi) => (
                    <p
                      key={pi}
                      className={`text-stone-700 leading-relaxed text-[15px] ${pi > 0 ? 'mt-3' : ''} ${
                        activeSection === i ? 'text-stone-800' : ''
                      }`}
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {/* Streaming pulse at end */}
            {generating && (
              <div className="flex items-center gap-2 px-5 py-4 bg-white rounded-2xl border border-amber-100">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
              </div>
            )}
          </div>
        )}

        {/* ── Error + retry ──────────────────────────────────────────────────── */}
        {error && hasGuide && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ── Bottom actions ─────────────────────────────────────────────────── */}
        {hasGuide && !generating && (
          <div className="mt-10 pt-6 border-t border-amber-100 flex items-center justify-between">
            <button
              onClick={() => router.push(`/programma/${encodeURIComponent(hikeId)}`)}
              className="flex items-center gap-1.5 text-stone-400 hover:text-stone-700 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna al percorso
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rigenera la guida
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
