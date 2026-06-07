'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPlannedById, updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { WikiPage } from '@/lib/wikipedia'
import {
  ArrowLeft, BookOpen, Volume2, VolumeX, Play, Pause, Square,
  RefreshCw, Loader2, MapPin, Mountain, Clock, Route,
  Leaf, Utensils, ShieldCheck, Compass, Info, FileDown, ExternalLink,
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
  'prima di partire': { icon: <Compass    className="w-5 h-5" />, color: '#d97706' },
  'il percorso':      { icon: <Route      className="w-5 h-5" />, color: '#16a34a' },
  'i luoghi':         { icon: <MapPin     className="w-5 h-5" />, color: '#7c3aed' },
  'la natura':        { icon: <Leaf       className="w-5 h-5" />, color: '#0f766e' },
  'sapori':           { icon: <Utensils   className="w-5 h-5" />, color: '#b45309' },
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

// ── Body renderer: handles ### subsections and [curiosita] callouts ────────────

function renderBodyLines(body: string, color: string): React.ReactNode {
  const lines = body.split('\n').filter(Boolean)
  let paraCount = 0
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="font-bold text-sm mt-5 mb-2 first:mt-0" style={{ color }}>
              {line.slice(4)}
            </h3>
          )
        }
        const cm = line.match(/^\[curiosita\](.*?)\[\/curiosita\]$/)
        if (cm) {
          return (
            <div
              key={i}
              className="my-4 rounded-xl p-4"
              style={{ backgroundColor: color + '14', borderLeft: `3px solid ${color}` }}
            >
              <p className="text-[11px] font-bold italic mb-1.5" style={{ color }}>Curiosità</p>
              <p className="text-stone-600 text-[14px] leading-relaxed italic">{cm[1].trim()}</p>
            </div>
          )
        }
        const isFirst = paraCount === 0
        paraCount++
        return (
          <p key={i} className={`text-stone-700 leading-relaxed text-[15px] ${isFirst ? '' : 'mt-3'}`}>
            {line}
          </p>
        )
      })}
    </>
  )
}

// ── Chunk-based TTS ───────────────────────────────────────────────────────────

interface ChunkEntry { text: string; sectionIdx: number }

function buildChunks(sections: Section[]): ChunkEntry[] {
  const chunks: ChunkEntry[] = []
  sections.forEach((s, sectionIdx) => {
    const lines = [`${s.title}.`, ...s.body.split(/\n+/).filter(l => l.trim().length > 3)]
    for (const line of lines) {
      if (line.length <= 220) {
        chunks.push({ text: line, sectionIdx })
      } else {
        // Split long lines at sentence boundaries
        const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean)
        let buf = ''
        for (const s of sentences) {
          if (buf.length + s.length > 220 && buf) {
            chunks.push({ text: buf.trim(), sectionIdx })
            buf = s
          } else {
            buf += (buf ? ' ' : '') + s
          }
        }
        if (buf.trim()) chunks.push({ text: buf.trim(), sectionIdx })
      }
    }
  })
  return chunks.filter(c => c.text.trim().length > 0)
}

function getItalianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang === 'it-IT' && v.localService) ??
    voices.find(v => v.lang === 'it-IT') ??
    voices.find(v => v.lang.startsWith('it')) ??
    null
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RATES = [0.8, 1, 1.2, 1.5]

type GuideLength = 'breve' | 'media' | 'lunga'

const LENGTH_OPTS: { key: GuideLength; label: string; desc: string }[] = [
  { key: 'breve', label: 'Breve',  desc: '~5 min' },
  { key: 'media', label: 'Media',  desc: '~15 min' },
  { key: 'lunga', label: 'Lunga',  desc: '~30 min' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GuidaPage() {
  const { id }  = useParams() as { id: string }
  const hikeId  = decodeURIComponent(id)
  const router  = useRouter()

  const [hike,        setHike]        = useState<PlannedHike | null>(null)
  const [guideText,   setGuideText]   = useState<string>('')
  const [sections,    setSections]    = useState<Section[]>([])
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [guideLength, setGuideLength] = useState<GuideLength>('media')
  const [exporting,   setExporting]   = useState(false)

  // Photos from Wikipedia thumbnails of nearby POIs
  const poiPhotos = useMemo(() => {
    if (!hike?.cachedPoiWiki) return []
    return (hike.cachedPoiWiki as Array<{ poi: unknown; wiki: WikiPage }>)
      .filter(w => w.wiki?.thumbnail)
      .map(w => ({ title: w.wiki.title, thumbnail: w.wiki.thumbnail!, url: w.wiki.url, description: w.wiki.description }))
  }, [hike?.cachedPoiWiki])

  // Voice state (UI)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isPaused,      setIsPaused]      = useState(false)
  const [rateIdx,       setRateIdx]       = useState(1)
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [playProgress,  setPlayProgress]  = useState(0)

  // Stable refs — never stale in closures
  const rateRef     = useRef(RATES[1])
  const chunksRef   = useRef<ChunkEntry[]>([])
  const chunkIdxRef = useRef(0)
  const iosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load hike + cached guide from DB
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

  // Rebuild chunks whenever sections change
  useEffect(() => {
    chunksRef.current = buildChunks(sections)
  }, [sections])

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async (length: GuideLength) => {
    setGenerating(true)
    setError(null)
    setGuideText('')
    setSections([])
    // Stop voice inline to avoid circular dep
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
    setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
    chunkIdxRef.current = 0

    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId, length }),
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

      updatePlannedMeta(hikeId, { cachedGuide: acc }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la generazione')
    } finally {
      setGenerating(false)
    }
  }, [hikeId])

  // ── Voice controls ────────────────────────────────────────────────────────

  function clearIosTimer() {
    if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
  }

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    clearIosTimer()
    setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
    chunkIdxRef.current = 0
  }

  function startFrom(startChunk: number) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    clearIosTimer()
    chunkIdxRef.current = startChunk

    const chunks = chunksRef.current
    if (!chunks.length) return

    // iOS: system pauses speech after ~14s of inactivity — kick it awake
    iosTimerRef.current = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 14000)

    function playNext() {
      const idx = chunkIdxRef.current
      if (idx >= chunks.length) {
        clearIosTimer()
        setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(1)
        return
      }
      const { text, sectionIdx } = chunks[idx]
      setActiveSection(sectionIdx)
      setPlayProgress(idx / Math.max(chunks.length - 1, 1))

      const utt = new SpeechSynthesisUtterance(text)
      utt.lang  = 'it-IT'
      utt.rate  = rateRef.current
      utt.pitch = 1.0
      const voice = getItalianVoice()
      if (voice) utt.voice = voice

      utt.onend = () => { chunkIdxRef.current++; playNext() }
      utt.onerror = (e) => {
        // 'interrupted'/'canceled' = we called cancel() intentionally — don't reset UI
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          clearIosTimer(); setIsPlaying(false); setIsPaused(false)
        }
      }
      window.speechSynthesis.speak(utt)
    }

    playNext()
    setIsPlaying(true); setIsPaused(false)
  }

  function togglePlayPause() {
    if (!('speechSynthesis' in window)) return
    if (!isPlaying && !isPaused) { startFrom(0); return }
    if (isPlaying) {
      window.speechSynthesis.pause()
      setIsPlaying(false); setIsPaused(true)
      return
    }
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPlaying(true); setIsPaused(false)
    }
  }

  function changeRate(idx: number) {
    rateRef.current = RATES[idx]
    setRateIdx(idx)
    if (isPlaying || isPaused) {
      const resumeAt = chunkIdxRef.current
      window.speechSynthesis.cancel()
      clearIosTimer()
      setTimeout(() => startFrom(resumeAt), 80)
    }
  }

  function speakSection(idx: number) {
    const startChunk = chunksRef.current.findIndex(c => c.sectionIdx === idx)
    if (startChunk >= 0) startFrom(startChunk)
  }

  // Cleanup on unmount
  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    clearIosTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── PDF export ────────────────────────────────────────────────────────────

  async function exportPdf() {
    if (!hike || !guideText) return
    setExporting(true)
    try {
      const { exportGuidePdf } = await import('@/utils/pdfExport')
      await exportGuidePdf(hike, guideText)
    } finally {
      setExporting(false)
    }
  }

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
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { icon: <Route    className="w-3.5 h-3.5" />, val: `${(hike.distanceMeters/1000).toFixed(1)} km` },
              { icon: <Mountain className="w-3.5 h-3.5" />, val: `${Math.round(hike.elevationGain)} m D+` },
              { icon: <Mountain className="w-3.5 h-3.5" />, val: `${Math.round(hike.altitudeMax)} m slm` },
              { icon: <Clock    className="w-3.5 h-3.5" />, val: formatDuration(hike.estimatedTimeSeconds) },
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

        {/* ── No guide yet: length selector + generate ──────────────────────── */}
        {!hasGuide && !generating && (
          <div className="flex flex-col items-center justify-center py-14 gap-8 text-center">
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

            {/* Length selector */}
            <div className="w-full max-w-xs">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
                Lunghezza della guida
              </p>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setGuideLength(opt.key)}
                    className={`flex flex-col items-center gap-0.5 py-3 px-2 rounded-xl border-2 transition-all ${
                      guideLength === opt.key
                        ? 'border-amber-500 bg-amber-50 text-amber-800'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-amber-200'
                    }`}
                  >
                    <span className="font-bold text-sm">{opt.label}</span>
                    <span className="text-xs opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-2 max-w-sm">
                {error}
              </p>
            )}
            <button
              onClick={() => generate(guideLength)}
              className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-2xl shadow-md hover:shadow-lg transition-all text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Genera la guida con Giulia
            </button>
          </div>
        )}

        {/* ── Generating: initial spinner ────────────────────────────────────── */}
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
                <p className="text-xs font-semibold text-stone-700 truncate">
                  {isPlaying && activeSection !== null
                    ? `Ascoltando: ${sections[activeSection]?.title ?? '…'}`
                    : isPaused ? 'In pausa'
                    : 'Guida vocale — voce italiana'}
                </p>
                {(isPlaying || isPaused) && (
                  <div className="mt-1.5 h-1 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(playProgress * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {RATES.map((r, i) => (
                  <button key={r} onClick={() => changeRate(i)}
                    className={`text-xs px-2 py-1 rounded-lg font-mono transition-colors ${
                      rateIdx === i ? 'bg-amber-500 text-white font-bold' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >{r}×</button>
                ))}
              </div>

              <button onClick={togglePlayPause}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isPlaying || isPaused
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              {(isPlaying || isPaused) && (
                <button onClick={stopVoice}
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
            {sections.map((s, i) => {
              const isLuoghi = s.title.toLowerCase().includes('luoghi')
              return (
                <div
                  key={i}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-300 ${
                    activeSection === i
                      ? 'border-amber-300 shadow-amber-100 shadow-md ring-1 ring-amber-200'
                      : 'border-stone-100 hover:border-amber-100'
                  }`}
                >
                  {/* Section header with number badge */}
                  <div
                    className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none"
                    style={{ borderBottom: `2px solid ${s.color}22` }}
                    onClick={() => speakSection(i)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Numbered square badge */}
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 tracking-tight"
                        style={{ backgroundColor: s.color }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span style={{ color: s.color }}>{s.icon}</span>
                        <h2 className="font-bold text-stone-800 text-base">{s.title}</h2>
                      </div>
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
                  <div className={`px-5 py-4 ${activeSection === i ? 'bg-amber-50/30' : ''}`}>
                    {renderBodyLines(s.body, s.color)}

                    {/* Inline photos for "I luoghi da non perdere" */}
                    {isLuoghi && poiPhotos.length > 0 && (
                      <div className="mt-5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
                          Foto dei luoghi
                        </p>
                        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                          {poiPhotos.map((photo, pi) => (
                            <a
                              key={pi}
                              href={photo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-none snap-start w-44 rounded-xl overflow-hidden group shadow-sm border border-stone-100 hover:shadow-md transition-shadow"
                            >
                              <div className="h-28 overflow-hidden bg-stone-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photo.thumbnail}
                                  alt={photo.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                              <div className="px-2.5 py-2 bg-white">
                                <p className="text-xs font-semibold text-stone-800 leading-tight line-clamp-1">{photo.title}</p>
                                {photo.description && (
                                  <p className="text-[10px] text-stone-400 mt-0.5 leading-tight line-clamp-1">{photo.description}</p>
                                )}
                                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 mt-1">
                                  <ExternalLink className="w-2.5 h-2.5" /> Wikipedia
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {generating && (
              <div className="flex items-center gap-2 px-5 py-4 bg-white rounded-2xl border border-amber-100">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
              </div>
            )}
          </div>
        )}

        {error && hasGuide && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ── Bottom actions ─────────────────────────────────────────────────── */}
        {hasGuide && !generating && (
          <div className="mt-10 pt-6 border-t border-amber-100 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => router.push(`/programma/${encodeURIComponent(hikeId)}`)}
              className="flex items-center gap-1.5 text-stone-400 hover:text-stone-700 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna al percorso
            </button>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Compact length selector for regeneration */}
              <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-xl p-1">
                {LENGTH_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setGuideLength(opt.key)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium ${
                      guideLength === opt.key
                        ? 'bg-amber-500 text-white'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => generate(guideLength)}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rigenera
              </button>

              <button
                onClick={exportPdf}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
              >
                {exporting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileDown className="w-3.5 h-3.5" />
                }
                Esporta PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
