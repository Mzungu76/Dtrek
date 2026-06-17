'use client'
import {
  useEffect, useState, useRef, useCallback, useMemo, type ReactNode,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PianificazioneSidebar from '@/components/PianificazioneSidebar'
import WeatherWidget from '@/components/WeatherWidget'
import RouteThumb from '@/components/RouteThumb'
import { getPlannedById, updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { WikiPage } from '@/lib/wikipedia'
import {
  ArrowLeft, Volume2, Play, Pause, Square,
  RefreshCw, Loader2, Mountain, Clock, Route,
  Leaf, Utensils, ShieldCheck, Compass, MapPin,
  FileDown, ExternalLink, BookOpen, CheckSquare, Square as SquareIcon,
  Check,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  title: string
  body:  string
  icon:  React.ReactNode
  color: string
}

// ── Section metadata ──────────────────────────────────────────────────────────

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

// ── Magazine body ─────────────────────────────────────────────────────────────

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

  const lead = blocks.find(b => b.type === 'lead')
  const rest  = blocks.filter(b => b !== lead)

  return (
    <div>
      {lead && (
        <p className="text-[15px] leading-[1.8] italic text-stone-600 mb-5" style={{ fontFamily: "'Lora', serif" }}>
          {lead.text}
        </p>
      )}
      <div>
        {rest.map((b, i) => {
          if (b.type === 'curiosita') {
            return (
              <div key={i} className="my-4 rounded-xl overflow-hidden">
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 px-4 py-3" style={{ background: color + '12' }}>
                    <p className="text-[9px] font-bold tracking-[2.5px] uppercase mb-1" style={{ color }}>◆ Lo sapevi?</p>
                    <p className="italic text-[13px] leading-relaxed text-stone-600" style={{ fontFamily: "'Lora', serif" }}>{b.text}</p>
                  </div>
                </div>
              </div>
            )
          }
          if (b.type === 'subsection') {
            return <h3 key={i} className="text-[10px] font-bold tracking-[1.5px] uppercase mt-5 mb-2" style={{ color }}>{b.text}</h3>
          }
          return (
            <p key={i} className="text-[14px] leading-7 text-stone-600 mb-3" style={{ fontFamily: "'Lora', serif" }}>
              {b.text}
            </p>
          )
        })}
      </div>
    </div>
  )
}

// ── POI Card ──────────────────────────────────────────────────────────────────

interface PoiPhoto { title: string; thumbnail: string; url: string; description?: string }

function PoiCard({ photo }: { photo: PoiPhoto }) {
  return (
    <a href={photo.url} target="_blank" rel="noopener noreferrer"
      className="flex gap-3 rounded-[12px] overflow-hidden p-3 items-start"
      style={{ background: '#F8FBFE', border: '1px solid #d4e8f5' }}
    >
      <img src={photo.thumbnail} alt={photo.title} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-stone-800 leading-tight line-clamp-1" style={{ fontFamily: "'Lora', serif" }}>
          {photo.title}
        </p>
        {photo.description && (
          <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-2">{photo.description}</p>
        )}
        <span className="flex items-center gap-1 text-[10px] mt-1" style={{ color: '#1C5F8A' }}>
          <ExternalLink className="w-2.5 h-2.5" /> Wikipedia
        </span>
      </div>
    </a>
  )
}

// ── Zaino checklist ───────────────────────────────────────────────────────────

const ZAINO_ITEMS = {
  'Indispensabili': ['Carta 1:25000', 'Bussola', 'Lampada frontale', 'Kit pronto soccorso', 'Fischietto', 'Telefono carico'],
  'Abbigliamento':  ['Giacca impermeabile', 'Cambio secco', 'Calze ricambio', 'Guanti', 'Cappellino/berretto', 'Bastoncini'],
  'Cibo e acqua':   ['Acqua ≥1,5 L', 'Barrette energia', 'Pasto principale', 'Snack emergenza', 'Thermos'],
}

function ZainoChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  function toggle(item: string) {
    setChecked(prev => ({ ...prev, [item]: !prev[item] }))
  }

  return (
    <div className="space-y-4">
      {Object.entries(ZAINO_ITEMS).map(([cat, items]) => (
        <div key={cat} className="rounded-[12px] overflow-hidden" style={{ background: '#F8FBFE' }}>
          <div className="px-4 py-2.5" style={{ background: '#EAF4FB', borderBottom: '1px solid #d4e8f5' }}>
            <p className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: '#1C5F8A' }}>{cat}</p>
          </div>
          <div className="divide-y" style={{ borderColor: '#eef4f9' }}>
            {items.map(item => (
              <button
                key={item}
                onClick={() => toggle(item)}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                style={{ background: checked[item] ? '#EAF4FB' : 'transparent' }}
              >
                {checked[item]
                  ? <CheckSquare className="w-4 h-4 shrink-0" style={{ color: '#1C5F8A' }} />
                  : <SquareIcon  className="w-4 h-4 shrink-0" style={{ color: '#c4c4c4' }} />
                }
                <span
                  className="text-[13px]"
                  style={{ color: checked[item] ? '#8a7f6e' : '#3c3530', textDecoration: checked[item] ? 'line-through' : 'none' }}
                >
                  {item}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── TTS helpers ───────────────────────────────────────────────────────────────

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

// ── Card wrapper helper ───────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-[14px] p-4 mb-3 shadow-[0_2px_12px_rgba(0,0,0,.07)] ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#2983C1' }}>
      {children}
    </p>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function GuidaPage() {
  const params  = useParams()
  const router  = useRouter()
  const hikeId  = decodeURIComponent(params.id as string)

  const [hike,        setHike]       = useState<PlannedHike | null>(null)
  const [guideText,   setGuideText]  = useState<string>('')
  const [sections,    setSections]   = useState<Section[]>([])
  const [loading,     setLoading]    = useState(true)
  const [generating,  setGenerating] = useState(false)
  const [error,       setError]      = useState<string | null>(null)
  const [guideLength, setGuideLength] = useState<GuideLength>('media')
  const [showFullText, setShowFullText] = useState(false)

  // TTS state
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isPaused,     setIsPaused]     = useState(false)
  const [rateIdx,      setRateIdx]      = useState(1)
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [playProgress, setPlayProgress] = useState(0)

  const rateRef     = useRef(RATES[1])
  const chunksRef   = useRef<ChunkEntry[]>([])
  const chunkIdxRef = useRef(0)
  const iosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (hike?.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (pts.length > 1) {
      const step = Math.max(1, Math.ceil(pts.length / 100))
      return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
    }
    return (hike?.routePolyline ?? []) as [number, number][]
  }, [hike])

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

  useEffect(() => {
    chunksRef.current = buildChunks(sections)
  }, [sections])

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (iosTimerRef.current) clearInterval(iosTimerRef.current)
  }, [])

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EAF4FB' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1C5F8A' }} />
      </div>
    )
  }

  if (!hike) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#EAF4FB' }}>
        <p className="text-stone-500 text-lg">Percorso non trovato</p>
        <button onClick={() => router.push('/pianificazione')} style={{ color: '#1C5F8A' }} className="hover:underline">
          ← Torna a Pianificazione
        </button>
      </div>
    )
  }

  const hasGuide   = guideText.trim().length > 50
  const diff       = hike.assessment?.difficulty ?? hike.tags?.[0]
  const hasTrack   = (hike.trackPoints?.length ?? 0) > 1
  const centerPt   = heroPolyline.length > 0 ? heroPolyline[Math.floor(heroPolyline.length / 2)] : null
  const previewText = guideText
    .replace(/^## .+$/gm, '')
    .replace(/^### .+$/gm, '')
    .replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '')
    .trim()

  return (
    <div className="min-h-screen" style={{ background: '#EAF4FB' }}>
      <Navbar />

      <div className="md:flex md:h-[calc(100vh-56px)]">
        <PianificazioneSidebar selected={hikeId} />

        <main className="flex-1 min-w-0 md:overflow-y-auto pb-20 md:pb-0">

          {/* ══ HERO ══ */}
          <div className="relative overflow-hidden h-[180px] md:h-[220px]" style={{ background: 'linear-gradient(160deg, #0B3252 0%, #1C5F8A 100%)' }}>
            {heroPolyline.length > 1 && (
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <RouteThumb polyline={heroPolyline} color="rgba(255,255,255,0.7)" strokeWidth={6} />
              </div>
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.62) 0%, rgba(0,0,0,.15) 55%, transparent 100%)' }} />

            {/* Top-left: back button */}
            <div className="absolute top-3 left-4">
              <button
                onClick={() => router.push('/pianificazione')}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-black/40"
                style={{ background: 'rgba(0,0,0,.30)', color: 'white' }}
              >
                <ArrowLeft className="w-4 h-4" />
                Pianificazione
              </button>
            </div>

            {/* Top-right: badge + segna come fatta */}
            <div className="absolute top-3 right-4 flex items-center gap-1.5">
              <span
                className="text-[9px] font-bold tracking-[2px] uppercase px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(255,255,255,.15)', color: '#AED4EC' }}
              >
                Guida Turistica
              </span>
              <Link
                href={`/transizione/${encodeURIComponent(hikeId)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.25)' }}
              >
                <Check className="w-3 h-3" />
                Segna come fatta
              </Link>
            </div>

            {/* Bottom: title + chips */}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <h1 className="text-[20px] font-bold leading-tight text-white mb-1" style={{ fontFamily: "'Lora', serif" }}>
                {hike.title}
              </h1>
              <div className="flex flex-wrap gap-1.5">
                {diff && (
                  <span className="flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full text-white uppercase"
                    style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                    {diff}
                  </span>
                )}
                {hike.plannedDate && (
                  <span className="flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                    style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                    {format(new Date(hike.plannedDate + 'T12:00'), 'd MMM yyyy', { locale: it })}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                  <Route className="w-3 h-3" /> {(hike.distanceMeters / 1000).toFixed(1)} km
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                  <Mountain className="w-3 h-3" /> {Math.round(hike.elevationGain)} m D+
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                  <Clock className="w-3 h-3" /> {formatDuration(hike.estimatedTimeSeconds)}
                </span>
              </div>
            </div>
          </div>

          {/* ══ CONTENT ══ */}
          <div className="px-3 sm:px-4 pt-4">

            {/* ── SECTION: GUIDA ──────────────────────────────────────── */}
            <Card>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <SectionLabel>Guida</SectionLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-xl overflow-hidden border border-stone-200">
                    {LENGTH_OPTS.map(opt => (
                      <button key={opt.key} onClick={() => setGuideLength(opt.key)}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${guideLength === opt.key ? 'text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
                        style={guideLength === opt.key ? { background: '#1C5F8A' } : {}}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => generate(guideLength)}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:opacity-50"
                    style={{ background: '#1C5F8A' }}>
                    {generating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione…</>
                      : <><BookOpen className="w-3.5 h-3.5" /> {hasGuide ? 'Rigenera' : 'Genera con Giulia'}</>
                    }
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-3 p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              {/* Generating: show streaming text */}
              {generating && (
                <div>
                  {!guideText ? (
                    <div className="flex items-center gap-3 py-6 text-stone-500">
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1C5F8A' }} />
                      <span className="italic text-sm" style={{ fontFamily: "'Lora', serif" }}>Giulia sta scrivendo la guida…</span>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: '#EAF4FB' }}>
                      <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "'Lora', serif" }}>{guideText}</p>
                    </div>
                  )}
                </div>
              )}

              {/* No guide yet, not generating */}
              {!hasGuide && !generating && (
                <div className="rounded-[14px] p-5 flex flex-col items-center gap-3 text-center"
                  style={{ background: '#EAF4FB', border: '2px dashed #1C5F8A' }}>
                  <BookOpen className="w-8 h-8" style={{ color: '#1C5F8A' }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#0D3B5E', fontFamily: "'Lora', serif" }}>
                      Guida da generare
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#8a7f6e' }}>
                      Giulia elaborerà storia, natura, curiosità e consigli pratici per questo percorso.
                    </p>
                  </div>
                </div>
              )}

              {/* Guide exists: truncated preview + read more */}
              {hasGuide && !generating && (
                <div>
                  <div className="relative">
                    <p className="text-[14px] leading-7 text-stone-600 line-clamp-4"
                      style={{ fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
                      {previewText.slice(0, 350)}{previewText.length > 350 ? '…' : ''}
                    </p>
                    <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                      style={{ background: 'linear-gradient(to top, white, transparent)' }} />
                  </div>
                  <button
                    onClick={() => setShowFullText(true)}
                    className="mt-3 text-[12px] font-bold flex items-center gap-1 transition-colors hover:underline"
                    style={{ color: '#1C5F8A' }}>
                    Leggi tutta la guida →
                  </button>
                </div>
              )}
            </Card>

            {/* ── SECTION: MAPPA ──────────────────────────────────────── */}
            <Card>
              <SectionLabel>Mappa</SectionLabel>
              <div className="rounded-[12px] overflow-hidden h-[260px] md:h-[380px]">
                {hasTrack ? (
                  <MapView trackPoints={hike.trackPoints ?? []} height="100%" planned />
                ) : (
                  <div className="h-full flex items-center justify-center" style={{ background: '#f5f5f5' }}>
                    <p className="text-stone-400 text-sm">Nessuna traccia disponibile</p>
                  </div>
                )}
              </div>
            </Card>

            {/* ── SECTION: SCHEDA TECNICA ─────────────────────────────── */}
            <Card>
              <SectionLabel>Scheda Tecnica</SectionLabel>
              <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid #d4e8f5' }}>
                {[
                  ['Distanza',      `${(hike.distanceMeters / 1000).toFixed(1)} km`],
                  ['Dislivello D+', `${Math.round(hike.elevationGain)} m`],
                  ['Dislivello D−', `${Math.round(hike.elevationLoss)} m`],
                  ['Tempo stimato', formatDuration(hike.estimatedTimeSeconds)],
                  ['Difficoltà',    diff?.toUpperCase() ?? '–'],
                  ['Quota max',     `${Math.round(hike.altitudeMax)} m`],
                  ['Quota min',     `${Math.round(hike.altitudeMin)} m`],
                  hike.cachedTrailScore != null ? ['CTS stimato', String(Math.round(hike.cachedTrailScore))] : null,
                ].filter(Boolean).map((row, i, arr) => {
                  const [label, value] = row as [string, string]
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid #f0f5f9' : 'none' }}
                    >
                      <span className="text-[11px] uppercase tracking-[1px] font-semibold" style={{ color: '#8a7f6e' }}>{label}</span>
                      <span className="text-[14px] font-bold" style={{ color: '#0D3B5E', fontFamily: "'DM Mono', monospace" }}>{value}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ── SECTION: PUNTI DI INTERESSE ─────────────────────────── */}
            <Card>
              <SectionLabel>Punti di Interesse</SectionLabel>
              {poiPhotos.length > 0 ? (
                <div className="space-y-2">
                  {poiPhotos.map((p, i) => <PoiCard key={i} photo={p} />)}
                </div>
              ) : (
                <div className="text-center py-10" style={{ color: '#a9a18e' }}>
                  <MapPin className="w-9 h-9 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nessun POI disponibile</p>
                  <p className="text-xs mt-1">I punti di interesse vengono caricati automaticamente</p>
                </div>
              )}
            </Card>

            {/* ── SECTION: METEO ───────────────────────────────────────── */}
            <Card>
              <SectionLabel>Meteo</SectionLabel>
              {centerPt ? (
                <WeatherWidget
                  mode="planned"
                  lat={centerPt[0]}
                  lon={centerPt[1]}
                  date={hike.plannedDate}
                  altitudeMax={hike.altitudeMax}
                  elevationGain={hike.elevationGain}
                />
              ) : (
                <div className="flex flex-col items-center py-10 gap-2 text-center" style={{ color: '#a9a18e' }}>
                  <p className="text-sm">Nessuna traccia disponibile per le previsioni</p>
                </div>
              )}
            </Card>

            {/* ── SECTION: ZAINO ───────────────────────────────────────── */}
            <Card>
              <SectionLabel>🎒 Zaino</SectionLabel>
              <ZainoChecklist />
            </Card>

          </div>
        </main>
      </div>

      {/* ── Full-text drawer: "Leggi tutta la guida" ────────────────── */}
      {showFullText && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 flex-wrap">
            <button onClick={() => setShowFullText(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Chiudi
            </button>
            <h2 className="flex-1 text-sm font-semibold text-stone-700 truncate" style={{ fontFamily: "'Lora', serif" }}>
              {hike.title}
            </h2>

            {/* TTS controls */}
            {hasGuide && (
              <div className="flex items-center gap-1">
                {RATES.map((r, i) => (
                  <button key={r} onClick={() => changeRate(i)}
                    className="text-[10px] px-1.5 py-1 rounded font-mono"
                    style={rateIdx === i ? { background: '#EAF4FB', color: '#1C5F8A', fontWeight: 700 } : { color: '#a9a18e' }}
                  >
                    {r}×
                  </button>
                ))}
                <button onClick={togglePlayPause}
                  className="w-8 h-8 rounded-full flex items-center justify-center ml-1"
                  style={{ background: '#EAF4FB' }}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" style={{ color: '#1C5F8A' }} /> : <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: '#1C5F8A' }} />}
                </button>
                {(isPlaying || isPaused) && (
                  <button onClick={stopVoice} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#f5f5f5' }}>
                    <Square className="w-3 h-3" style={{ color: '#8a7f6e' }} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Voice progress */}
            {(isPlaying || isPaused) && hasGuide && (
              <div className="mb-4 bg-white rounded-xl border px-3 py-2 flex items-center gap-3" style={{ borderColor: '#d4e8f5' }}>
                <Volume2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#1C5F8A' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-stone-600 truncate">
                    {isPlaying && activeSection !== null ? `▶ ${sections[activeSection]?.title ?? '…'}` : '⏸ In pausa'}
                  </p>
                  <div className="mt-1 h-0.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(playProgress * 100)}%`, background: '#1C5F8A' }} />
                  </div>
                </div>
                <button onClick={stopVoice} style={{ color: '#8a7f6e' }}><Square className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Sections */}
            {sections.map((s, i) => (
              <div
                key={i}
                className="bg-white rounded-[14px] overflow-hidden mb-4"
                style={{
                  boxShadow: activeSection === i && (isPlaying || isPaused)
                    ? '0 0 0 2px #1C5F8A, 0 2px 12px rgba(28,95,138,.15)'
                    : '0 2px 10px rgba(0,0,0,.06)',
                }}
              >
                <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: s.color }}>
                  <span className="[&>svg]:w-4 [&>svg]:h-4 text-white opacity-80">{s.icon}</span>
                  <h2 className="text-[12px] font-bold tracking-[1.5px] uppercase text-white">{s.title}</h2>
                </div>
                <div className="px-4 py-4">
                  <MagazineBody body={s.body} color={s.color} />
                </div>
              </div>
            ))}

            {generating && (
              <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-[14px]">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#1C5F8A' }} />
                <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
              </div>
            )}

            {!generating && hasGuide && (
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                <button onClick={() => generate(guideLength)} disabled={generating}
                  className="flex items-center gap-1.5 text-xs" style={{ color: '#8a7f6e' }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Rigenera
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full text-sm font-semibold"
                  style={{ background: '#1C5F8A' }}
                >
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
