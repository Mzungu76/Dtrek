'use client'
import {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPlannedById, updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { WikiPage } from '@/lib/wikipedia'
import {
  ArrowLeft, Volume2, VolumeX, Play, Pause, Square,
  RefreshCw, Loader2, Mountain, Clock, Route,
  Leaf, Utensils, ShieldCheck, Compass, MapPin,
  FileDown, ExternalLink, BookOpen,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  title: string
  body:  string
  icon:  React.ReactNode
  color: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_META: Record<string, { icon: React.ReactNode; color: string }> = {
  'prima di partire': { icon: <Compass    className="w-4 h-4" />, color: '#d97706' },
  'il percorso':      { icon: <Route      className="w-4 h-4" />, color: '#16a34a' },
  'i luoghi':         { icon: <MapPin     className="w-4 h-4" />, color: '#7c3aed' },
  'la natura':        { icon: <Leaf       className="w-4 h-4" />, color: '#0f766e' },
  'sapori':           { icon: <Utensils   className="w-4 h-4" />, color: '#b45309' },
  'consigli':         { icon: <ShieldCheck className="w-4 h-4" />, color: '#0369a1' },
}

function sectionMeta(title: string) {
  const key = title.toLowerCase()
  for (const [k, v] of Object.entries(SECTION_META)) {
    if (key.includes(k)) return v
  }
  return { icon: <BookOpen className="w-4 h-4" />, color: '#78716c' }
}

function parseGuide(text: string): Section[] {
  return text.split(/^## /m).filter(Boolean).map(part => {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    return { title, body, ...sectionMeta(title) }
  })
}

// ── Route SVG (instant hero background fallback) ───────────────────────────────

function RouteSvg({ hike }: { hike: PlannedHike }) {
  const pts = useMemo(() => {
    const raw = ((hike.trackPoints ?? []).filter(p => p.lat && p.lon) as { lat: number; lon: number }[])
      .map(p => [p.lat, p.lon] as [number, number])
    return raw.length > 1 ? raw : (hike.routePolyline ?? []) as [number, number][]
  }, [hike])

  if (pts.length < 2) return null

  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 1200, H = 420
  const pad = 40
  const scLat = (H - 2 * pad) / (maxLat - minLat || 0.001)
  const scLon = (W - 2 * pad) / (maxLon - minLon || 0.001)
  const sc = Math.min(scLat, scLon)
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * sc) / 2
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * sc) / 2
  const px = (lon: number) => offX + (lon - minLon) * sc
  const py = (lat: number) => offY + (maxLat - lat) * sc
  const d = pts.map(([lat, lon], i) => `${i === 0 ? 'M' : 'L'} ${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 w-full h-full opacity-20"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d={d} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(pts[0][1]).toFixed(1)} cy={py(pts[0][0]).toFixed(1)} r="6" fill="#4ade80" />
      <circle cx={px(pts[pts.length-1][1]).toFixed(1)} cy={py(pts[pts.length-1][0]).toFixed(1)} r="6" fill="#f87171" />
    </svg>
  )
}

// ── Magazine section body renderer ────────────────────────────────────────────

function MagazineBody({ body, color }: { body: string; color: string }) {
  interface Block { type: 'lead' | 'para' | 'curiosita' | 'subsection'; text: string }

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = []
    const cRe = /\[curiosita\]([\s\S]*?)\[\/curiosita\]/g
    let last = 0
    let m: RegExpExecArray | null
    let paraCount = 0

    const flushText = (chunk: string) => {
      let buf: string[] = []
      const flush = () => {
        const p = buf.join(' ').trim()
        if (p) {
          out.push({ type: paraCount === 0 ? 'lead' : 'para', text: p })
          paraCount++
          buf = []
        }
      }
      for (const line of chunk.split('\n')) {
        const t = line.trim()
        if (t.startsWith('### ')) { flush(); out.push({ type: 'subsection', text: t.slice(4) }) }
        else if (!t) flush()
        else buf.push(t)
      }
      flush()
    }

    while ((m = cRe.exec(body)) !== null) {
      flushText(body.slice(last, m.index))
      out.push({ type: 'curiosita', text: m[1].trim().replace(/\n/g, ' ') })
      last = m.index + m[0].length
    }
    flushText(body.slice(last))
    return out
  }, [body])

  // First paragraph (lead) stands alone full-width; rest flow in columns
  const lead = blocks.find(b => b.type === 'lead')
  const rest  = blocks.filter(b => b !== lead)

  return (
    <div>
      {lead && (
        <p className="font-display text-[17px] sm:text-[19px] leading-[1.75] italic text-stone-800 mb-6">
          {lead.text}
        </p>
      )}
      <div className="md:columns-2 md:gap-8">
        {rest.map((b, i) => {
          if (b.type === 'curiosita') {
            return (
              <div
                key={i}
                className="my-5 rounded-sm overflow-hidden shadow-sm"
                style={{ columnSpan: 'all' as const, breakInside: 'avoid' }}
              >
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 px-4 py-3" style={{ background: color + '12' }}>
                    <p className="text-[9px] font-bold tracking-[2.5px] uppercase mb-1.5" style={{ color }}>
                      ◆ Lo sapevi?
                    </p>
                    <p className="font-display italic text-[14px] leading-relaxed text-stone-700">
                      {b.text}
                    </p>
                  </div>
                </div>
              </div>
            )
          }
          if (b.type === 'subsection') {
            return (
              <h3
                key={i}
                className="font-sans text-[11px] font-bold tracking-[1.5px] uppercase mt-6 mb-2"
                style={{ color, breakAfter: 'avoid' }}
              >
                {b.text}
              </h3>
            )
          }
          return (
            <p key={i} className="text-[15px] leading-7 text-stone-600 font-light mb-4">
              {b.text}
            </p>
          )
        })}
      </div>
    </div>
  )
}

// ── POI card ──────────────────────────────────────────────────────────────────

interface PoiPhoto {
  title: string
  thumbnail: string
  url: string
  description?: string
}

function PoiCard({ photo, color }: { photo: PoiPhoto; color: string }) {
  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl overflow-hidden border border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-md transition-all bg-white"
    >
      <div className="h-40 overflow-hidden bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbnail}
          alt={photo.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-3">
        <p className="font-display font-semibold text-stone-800 text-[14px] leading-tight line-clamp-1">
          {photo.title}
        </p>
        {photo.description && (
          <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">{photo.description}</p>
        )}
        <span className="flex items-center gap-0.5 text-[10px] mt-1.5" style={{ color }}>
          <ExternalLink className="w-2.5 h-2.5" /> Wikipedia
        </span>
      </div>
    </a>
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
        const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean)
        let buf = ''
        for (const sentence of sentences) {
          if (buf.length + sentence.length > 220 && buf) {
            chunks.push({ text: buf.trim(), sectionIdx })
            buf = sentence
          } else {
            buf += (buf ? ' ' : '') + sentence
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

  const [hike,         setHike]         = useState<PlannedHike | null>(null)
  const [guideText,    setGuideText]    = useState<string>('')
  const [sections,     setSections]     = useState<Section[]>([])
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [guideLength,  setGuideLength]  = useState<GuideLength>('media')
  const [exporting,    setExporting]    = useState(false)
  const [heroPhoto,    setHeroPhoto]    = useState<string | null>(null)
  const [visibleSec,   setVisibleSec]   = useState(0)

  const poiPhotos = useMemo(() => {
    if (!hike?.cachedPoiWiki) return []
    return (hike.cachedPoiWiki as Array<{ poi: PoiItem; wiki: WikiPage }>)
      .filter(w => w.wiki?.thumbnail)
      .map(w => ({
        title:       w.wiki.title,
        thumbnail:   w.wiki.thumbnail!,
        url:         w.wiki.url,
        description: w.wiki.description,
      }))
  }, [hike?.cachedPoiWiki])

  // Voice state
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isPaused,      setIsPaused]      = useState(false)
  const [rateIdx,       setRateIdx]       = useState(1)
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [playProgress,  setPlayProgress]  = useState(0)

  const rateRef     = useRef(RATES[1])
  const chunksRef   = useRef<ChunkEntry[]>([])
  const chunkIdxRef = useRef(0)
  const iosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  // Load hike + guide
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

  // Lazy-load hero photo from Wikimedia Commons
  useEffect(() => {
    if (!hike) return
    const pts = (hike.trackPoints ?? []).filter((p: { lat?: number; lon?: number }) => p.lat && p.lon) as { lat: number; lon: number }[]
    const poly = pts.length > 0 ? pts : (hike.routePolyline ?? []).map((p: [number, number]) => ({ lat: p[0], lon: p[1] }))
    if (!poly.length) return
    const mid = poly[Math.floor(poly.length / 2)]
    import('@/app/lib/guide/fetchRoutePhotos').then(({ fetchRoutePhotos }) =>
      fetchRoutePhotos(mid.lat, mid.lon, 15000, 1)
    ).then(photos => {
      if (photos.length > 0) setHeroPhoto(photos[0].url)
    }).catch(() => {})
  }, [hike])

  // IntersectionObserver: track which section is in view for tab highlighting
  useEffect(() => {
    if (!sections.length) return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = sectionRefs.current.indexOf(e.target as HTMLElement)
            if (idx >= 0) setVisibleSec(idx)
          }
        }
      },
      { threshold: 0.3, rootMargin: '-56px 0px -40% 0px' },
    )
    sectionRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [sections])

  // Rebuild chunks on section change
  useEffect(() => {
    chunksRef.current = buildChunks(sections)
  }, [sections])

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async (length: GuideLength) => {
    setGenerating(true)
    setError(null)
    setGuideText('')
    setSections([])
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

  // ── Voice ─────────────────────────────────────────────────────────────────

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

      const utt   = new SpeechSynthesisUtterance(text)
      utt.lang    = 'it-IT'
      utt.rate    = rateRef.current
      utt.pitch   = 1.0
      const voice = getItalianVoice()
      if (voice) utt.voice = voice
      utt.onend = () => { chunkIdxRef.current++; playNext() }
      utt.onerror = (e) => {
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
    window.speechSynthesis.resume()
    setIsPlaying(true); setIsPaused(false)
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

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (!hike) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#f5f3ef' }}>
        <p className="text-stone-500 text-lg">Percorso non trovato</p>
        <button onClick={() => router.push('/programma')} className="text-amber-600 hover:underline">
          ← Torna alle pianificate
        </button>
      </div>
    )
  }

  const hasGuide   = guideText.trim().length > 50
  const hikeTitle  = hike.title
  const categoryBadge = (hike.tags?.[0] ?? hike.assessment?.difficulty ?? 'Escursione').toUpperCase()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#f5f3ef' }}>

      {/* ── Sticky nav bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b shadow-sm" style={{ borderColor: '#e5e1d8' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/programma/${encodeURIComponent(hikeId)}`)}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline font-medium">Percorso</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-bold tracking-[3px] text-amber-600 uppercase hidden sm:block">DTrek</span>
            <span className="text-stone-300 hidden sm:block">·</span>
            <span className="text-sm font-semibold text-stone-700 truncate font-display">{hikeTitle}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {hasGuide && RATES.map((r, i) => (
              <button key={r} onClick={() => changeRate(i)}
                className={`text-xs px-1.5 py-0.5 rounded font-mono transition-colors ${
                  rateIdx === i ? 'bg-amber-500 text-white' : 'text-stone-400 hover:text-stone-600'
                }`}
              >{r}×</button>
            ))}
            {hasGuide && (
              <>
                <button onClick={togglePlayPause}
                  className={`ml-1 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isPlaying || isPaused
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                {(isPlaying || isPaused) && (
                  <button onClick={stopVoice}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                  ><Square className="w-3 h-3" /></button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ height: 'clamp(280px, 42vw, 480px)' }}>
        {/* Background: photo or gradient */}
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto}
            alt={hikeTitle}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #78350f 0%, #1c4532 50%, #0c1a0f 100%)' }}
          >
            <RouteSvg hike={hike} />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to top, rgba(5,5,5,0.9) 0%, rgba(5,5,5,0.5) 40%, rgba(0,0,0,0.15) 80%, transparent 100%)',
        }} />

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 px-6 sm:px-10 pb-7">
          <span className="inline-block bg-amber-500 text-white text-[8px] font-bold tracking-[2.5px] px-2.5 py-1 rounded-sm mb-3 uppercase">
            {categoryBadge}
          </span>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight mb-1.5 max-w-2xl"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
          >
            {hikeTitle}
          </h1>
          {hike.plannedDate && (
            <p className="text-[13px] italic text-white/70">
              {format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="flex" style={{ background: '#1a1a1a' }}>
        {[
          { icon: <Route    className="w-3.5 h-3.5" />, value: `${(hike.distanceMeters/1000).toFixed(1)} km`,         label: 'Distanza' },
          { icon: <Mountain className="w-3.5 h-3.5" />, value: `+${Math.round(hike.elevationGain)} m`,               label: 'Dislivello' },
          { icon: <Mountain className="w-3.5 h-3.5" />, value: `${Math.round(hike.altitudeMax)} m`,                  label: 'Quota max' },
          { icon: <Clock    className="w-3.5 h-3.5" />, value: formatDuration(hike.estimatedTimeSeconds),            label: 'Durata' },
        ].map(({ icon, value, label }, i, arr) => (
          <div key={label} className="flex-1 flex flex-col items-center justify-center py-4 gap-1"
            style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
          >
            <span className="flex items-center gap-1.5 text-[17px] font-bold text-white leading-none">
              <span className="text-amber-500 hidden sm:block">{icon}</span>
              {value}
            </span>
            <span className="text-[8px] font-semibold tracking-[1.8px] uppercase text-amber-500/80">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        {/* ── No guide yet ────────────────────────────────────────────── */}
        {!hasGuide && !generating && (
          <div className="flex flex-col items-center py-20 gap-8 text-center">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center shadow-inner">
              <BookOpen className="w-9 h-9 text-amber-500" />
            </div>
            <div className="max-w-sm">
              <h2 className="font-display text-2xl font-bold text-stone-800 mb-3">
                Nessuna guida ancora generata
              </h2>
              <p className="text-stone-500 text-[15px] leading-relaxed">
                Giulia elaborerà una guida personalizzata raccontando storia, natura,
                curiosità e consigli pratici per questo percorso.
              </p>
            </div>

            <div className="w-full max-w-xs">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[2px] mb-3">
                Lunghezza della guida
              </p>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_OPTS.map(opt => (
                  <button key={opt.key} onClick={() => setGuideLength(opt.key)}
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

            <button onClick={() => generate(guideLength)}
              className="flex items-center gap-2 px-7 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Genera la guida con Giulia
            </button>
          </div>
        )}

        {/* ── Generating spinner ──────────────────────────────────────── */}
        {generating && sections.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
              <BookOpen className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <p className="font-display font-semibold text-stone-700 text-lg">Giulia sta scrivendo…</p>
              <p className="text-stone-400 text-sm mt-1">ci vorranno circa 20–30 secondi</p>
            </div>
          </div>
        )}

        {/* ── Voice progress bar (when playing) ──────────────────────── */}
        {(isPlaying || isPaused) && hasGuide && (
          <div className="mt-6 bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3" style={{ borderColor: '#e5e1d8' }}>
            <Volume2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-stone-600 truncate">
                {isPlaying && activeSection !== null
                  ? `▶ ${sections[activeSection]?.title ?? '…'}`
                  : '⏸ In pausa'}
              </p>
              <div className="mt-1 h-0.5 bg-amber-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(playProgress * 100)}%` }} />
              </div>
            </div>
            <button onClick={stopVoice}
              className="text-stone-400 hover:text-stone-700 transition-colors"
            ><Square className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── Section tab navigation ──────────────────────────────────── */}
        {sections.length > 0 && (
          <div className="sticky z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-white/95 backdrop-blur-sm border-b overflow-x-auto"
            style={{ top: '56px', borderColor: '#e5e1d8', scrollbarWidth: 'none' }}
          >
            <div className="flex gap-1.5 min-w-max">
              {sections.map((s, i) => (
                <button key={i} onClick={() => scrollToSection(i)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={visibleSec === i
                    ? { background: s.color, color: 'white' }
                    : { background: '#f5f3ef', color: '#78716c' }
                  }
                >
                  <span className="[&>svg]:w-3 [&>svg]:h-3">{s.icon}</span>
                  <span>{s.title.split(' ').slice(0, 3).join(' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Guide sections ──────────────────────────────────────────── */}
        {sections.length > 0 && (
          <div className="mt-6 space-y-0">
            {sections.map((s, i) => {
              const isLuoghi = s.title.toLowerCase().includes('luoghi')
              const isVoiceActive = activeSection === i && (isPlaying || isPaused)

              return (
                <article
                  key={i}
                  ref={el => { sectionRefs.current[i] = el }}
                  className={`scroll-mt-28 bg-white rounded-2xl mb-5 overflow-hidden shadow-sm transition-shadow ${
                    isVoiceActive ? 'ring-2 ring-amber-300 shadow-amber-100 shadow-md' : 'hover:shadow-md'
                  }`}
                >
                  {/* Section header band */}
                  <div
                    className="flex items-center gap-3 px-6 py-3.5"
                    style={{ background: s.color }}
                  >
                    <div className="w-1.5 h-6 rounded-full bg-white/25 shrink-0" />
                    <div className="flex items-center gap-2 text-white">
                      <span className="[&>svg]:w-4 [&>svg]:h-4 opacity-80">{s.icon}</span>
                      <h2 className="text-[11px] font-bold tracking-[2px] uppercase">{s.title}</h2>
                    </div>
                    <div className="flex-1" />
                    <button
                      onClick={() => speakSection(i)}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      title="Ascolta questa sezione"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>

                  {/* Section body */}
                  <div className="px-6 py-6 sm:px-8">
                    <MagazineBody body={s.body} color={s.color} />

                    {/* POI photo grid — only in "I luoghi" section */}
                    {isLuoghi && poiPhotos.length > 0 && (
                      <div className="mt-8 pt-6 border-t" style={{ borderColor: '#e5e1d8' }}>
                        <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-stone-400 mb-4">
                          Luoghi e siti del percorso
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {poiPhotos.map((photo, pi) => (
                            <PoiCard key={pi} photo={photo} color={s.color} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}

            {/* Generating more... */}
            {generating && (
              <div className="flex items-center gap-2 px-6 py-4 bg-white rounded-2xl shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
              </div>
            )}
          </div>
        )}

        {error && hasGuide && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ── Bottom actions ──────────────────────────────────────────── */}
        {hasGuide && !generating && (
          <div className="mt-10 mb-16 pt-6 flex flex-wrap items-center justify-between gap-4" style={{ borderTop: '1px solid #e5e1d8' }}>
            <button
              onClick={() => router.push(`/programma/${encodeURIComponent(hikeId)}`)}
              className="flex items-center gap-1.5 text-stone-400 hover:text-stone-700 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna al percorso
            </button>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Regenerate controls */}
              <div className="flex items-center gap-1 bg-white border rounded-xl p-1" style={{ borderColor: '#e5e1d8' }}>
                {LENGTH_OPTS.map(opt => (
                  <button key={opt.key} onClick={() => setGuideLength(opt.key)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium ${
                      guideLength === opt.key
                        ? 'bg-amber-500 text-white'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>

              <button onClick={() => generate(guideLength)} disabled={generating}
                className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rigenera
              </button>

              {!('speechSynthesis' in (typeof window !== 'undefined' ? window : {})) && (
                <span className="flex items-center gap-1 text-xs text-stone-400">
                  <VolumeX className="w-3.5 h-3.5" /> Voce non supportata
                </span>
              )}

              <button onClick={exportPdf} disabled={exporting}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-sm font-semibold transition-all shadow-sm disabled:opacity-60"
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
