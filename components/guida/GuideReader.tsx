'use client'
import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import Image from 'next/image'
import { updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { WikiPage } from '@/lib/wikipedia'
import {
  Volume2, VolumeX, Play, Pause, Square,
  RefreshCw, Loader2, Mountain, Clock, Route,
  Leaf, Utensils, ShieldCheck, Compass, MapPin,
  FileDown, ExternalLink, BookOpen, BarChart2, KeyRound, Sparkles,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'
import PhotoMosaic from '@/components/PhotoMosaic'
import { extractRiddles } from '@/lib/riddles'
import { extractEpochPois } from '@/lib/epochPois'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices } from '@/lib/guideNotices'
import { AlertTriangle } from 'lucide-react'
import GuideQA from './widgets/GuideQA'
import { GUIDE_SECTIONS, sectionDefForTitle, type GuideSectionKey } from '@/lib/guideSections'
import WeatherWidget from '@/components/WeatherWidget'
import RouteMapSection from '@/components/RouteMapSection'
import ScoresWidget from './widgets/ScoresWidget'
import SafetyWidget from './widgets/SafetyWidget'
import PoiListWidget from './widgets/PoiListWidget'
import NaturaWidget from './widgets/NaturaWidget'
import type { CLProps, CtsProps, ShadeWaterProps } from '@/components/ScoreRing'
import type { SafetyScore } from '@/lib/safetyScore'
import type { HikeAssessment } from '@/lib/hikeAssessment'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { CLSignals, Sentinel2Data } from '@/lib/cl/types'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisplaySection {
  key: GuideSectionKey | `legacy-${number}`
  guideKey: GuideSectionKey | null
  title: string
  body?: string
  icon: ReactNode
  color: string
}

export interface ScoresBundle {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
  shadeWater: ShadeWaterProps
  showAspectToggle: boolean
  showGradientToggle: boolean
  showAspect: boolean
  showGradient: boolean
  onToggleAspect: () => void
  onToggleGradient: () => void
}

export interface SafetyDetailsBundle {
  assessment?: HikeAssessment
  hasGps: boolean
  notMatched: boolean
  osmId?: number
  polyline?: [number, number][]
  plannedId: string
  signals?: CLSignals
  markers: ClassifiedDifficultyMarker[]
  highlightedMarkerIndex?: number | null
}

export interface PoiListBundle {
  pois: PoiItem[]
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  hasGps: boolean
  centerLat?: number
  centerLon?: number
  onWikiLoaded: (pages: WikiPage[]) => void
}

export interface NaturaBundle {
  hasGps: boolean
  data: Sentinel2Data | null
  loading: boolean
  flora?: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

interface Props {
  hike: PlannedHike
  /** Mirrors what's persisted (cachedGuide/cachedRiddles/cachedEpochPois/guideTier) back into the
   *  caller's own hike state, so the rest of the app (map riddles, epoch POIs) sees a freshly
   *  generated guide without waiting for a refetch. */
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  /** Proroga/archivia banner for a "pending" hike — rendered above everything else. */
  topBanner?: ReactNode
  /** True once every enrichment source (POI/Wikipedia, scores, sicurezza, natura) has settled (or
   *  a safety timeout fired) — gates the automatic Breve generation. */
  enrichmentReady: boolean
  /** null while the pre-flight check is in flight, then whether this account can call Claude at all. */
  hasAiAccess: boolean | null
  /** Set by the caller (e.g. tapping the Trail Score badge) to scroll to a specific section once. */
  scrollToSectionKey?: GuideSectionKey | null
  onScrollToSectionConsumed?: () => void
  /** POI currently highlighted on the stage map (or tapped inside this guide) — kept in the
   *  parent so the persistent stage map behind the sheet can reflect it too. */
  highlightedPoiId?: number | null
  onPoiTap?: (poiId: number) => void
  weather?: { lat: number; lon: number; mode: 'planned' | 'forecast' }
  /** Opens the fullscreen 3D map view for the route — forwarded to the "Il percorso" map section. */
  onOpenMap3D?: () => void
  /** Pendenza/esposizione overlay state — forwarded to the "Il percorso" map section (the toggle
   *  buttons themselves live in ScoresWidget, part of the "Dati e sicurezza" section below). */
  showGradient?: boolean
  showAspect?: boolean
  dtmProfile?: TrailDtmProfile
  scores?: ScoresBundle
  safetyDetails?: SafetyDetailsBundle
  poiList?: PoiListBundle
  natura?: NaturaBundle
}

// ── Section styling (fixed skeleton) ────────────────────────────────────────────

// Colori presi dalla palette terra/forest/stone dell'app (tailwind.config.ts), non più tonalità
// ad-hoc estranee al resto dell'interfaccia.
const SECTION_STYLE: Record<GuideSectionKey, { icon: ReactNode; color: string }> = {
  prima_di_partire: { icon: <Compass     className="w-4 h-4" />, color: '#c05a17' }, // terra-600
  il_percorso:      { icon: <Route       className="w-4 h-4" />, color: '#277134' }, // forest-600
  dati_sicurezza:   { icon: <BarChart2   className="w-4 h-4" />, color: '#73695c' }, // stone-700
  luoghi:           { icon: <MapPin      className="w-4 h-4" />, color: '#813619' }, // terra-800
  natura:           { icon: <Leaf        className="w-4 h-4" />, color: '#378d44' }, // forest-500
  sapori:           { icon: <Utensils    className="w-4 h-4" />, color: '#d97220' }, // terra-500
  consigli:         { icon: <ShieldCheck className="w-4 h-4" />, color: '#5e564c' }, // stone-800
}
const LEGACY_STYLE = { icon: <BookOpen className="w-4 h-4" />, color: '#978e7a' }

function slugifyHeading(text: string): string {
  return 'poi-heading-' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface ParsedSection { key: GuideSectionKey | null; title: string; body: string }

function parseGuide(text: string): ParsedSection[] {
  return text.split(/^## /m).filter(Boolean).map(part => {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    return { key: sectionDefForTitle(title)?.key ?? null, title, body }
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

function MagazineBody({ body, color, sectionPhoto }: { body: string; color: string; sectionPhoto?: string }) {
  interface Block { type: 'lead' | 'para' | 'curiosita' | 'avviso' | 'subsection'; text: string }

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = []
    // [curiosita] e [avviso] sono blocchi delimitati su una riga dedicata (stessa convenzione di
    // [sottotitolo]/[indovinello]/[epoca], vedi app/api/guide/route.ts) — [avviso] segnala una
    // criticità reale e specifica trovata dalla ricerca web di Giulia sullo stato del percorso.
    const blockRe = /\[(curiosita|avviso)\]([\s\S]*?)\[\/\1\]/g
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

    while ((m = blockRe.exec(body)) !== null) {
      flushText(body.slice(last, m.index))
      out.push({ type: m[1] as 'curiosita' | 'avviso', text: m[2].trim().replace(/\n/g, ' ') })
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
        <p className="text-[17px] sm:text-[19px] leading-[1.75] italic text-stone-700 mb-6">
          {lead.text}
        </p>
      )}
      <div className="md:columns-2 md:gap-8 print-columns-2">
        {sectionPhoto && (
          <div className="float-right ml-5 mb-4 w-[42%] sm:w-[38%]" style={{ columnSpan: 'none' as const }}>
            <div className="relative w-full h-40 rounded-sm shadow-sm overflow-hidden">
              <Image src={sectionPhoto} alt="" fill sizes="(max-width: 640px) 42vw, 38vw" className="object-cover" />
            </div>
            <p className="text-[9px] italic text-stone-400 mt-1">© Wikimedia Commons</p>
          </div>
        )}
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
                    <p className="italic text-[14px] leading-relaxed text-stone-700">
                      {b.text}
                    </p>
                  </div>
                </div>
              </div>
            )
          }
          if (b.type === 'avviso') {
            return (
              <div
                key={i}
                className="my-5 rounded-sm overflow-hidden shadow-sm border border-amber-200"
                style={{ columnSpan: 'all' as const, breakInside: 'avoid' }}
              >
                <div className="flex">
                  <div className="w-1 flex-shrink-0 bg-amber-500" />
                  <div className="flex-1 px-4 py-3 bg-amber-50">
                    <p className="text-[9px] font-bold tracking-[2.5px] uppercase mb-1.5 text-amber-700">
                      ⚠ Stato del percorso
                    </p>
                    <p className="text-[14px] leading-relaxed text-amber-900">
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
                id={slugifyHeading(b.text)}
                className="font-display text-[11px] font-bold tracking-[1.5px] uppercase mt-6 mb-2 scroll-mt-24"
                style={{ color, breakAfter: 'avoid' }}
              >
                {b.text}
              </h3>
            )
          }
          return (
            <p key={i} className="text-[15px] leading-7 text-stone-600 mb-4">
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
      <div className="relative h-40 overflow-hidden bg-stone-100">
        <Image
          src={photo.thumbnail}
          alt={photo.title}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-3">
        <p className="font-display font-semibold text-stone-800 text-[16px] leading-tight line-clamp-1 tracking-wide">
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

function buildChunks(sections: DisplaySection[]): ChunkEntry[] {
  const chunks: ChunkEntry[] = []
  sections.forEach((s, sectionIdx) => {
    if (!s.body) return
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

type GuideTier = 'breve' | 'approfondita'

/**
 * Magazine-style tourist guide reader. The Breve tier is generated automatically (no user
 * action) once `enrichmentReady` — every widget (mappa, profilo altimetrico, punteggi, POI,
 * natura) is always rendered regardless of whether the AI wrote text for that section, so no
 * data ever becomes unreachable just because the user hasn't pressed "Approfondisci" yet.
 */
export default function GuideReader({
  hike, onHikeUpdate, topBanner, enrichmentReady, hasAiAccess,
  scrollToSectionKey, onScrollToSectionConsumed, highlightedPoiId, onPoiTap,
  weather, onOpenMap3D, showGradient, showAspect, dtmProfile, scores, safetyDetails, poiList, natura,
}: Props) {
  const [guideText,    setGuideText]    = useState<string>(hike.cachedGuide ?? '')
  const [guideNotices, setGuideNotices] = useState<string[]>(hike.cachedGuideNotices ?? [])
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [routePhotos,  setRoutePhotos]  = useState<string[]>([])
  const [visibleSec,   setVisibleSec]   = useState(0)

  const poiPhotos = useMemo(() => {
    if (!hike.cachedPoiWiki) return []
    return (hike.cachedPoiWiki as Array<{ poi: PoiItem; wiki: WikiPage }>)
      .filter(w => w.wiki?.thumbnail)
      .map(w => ({
        title:       w.wiki.title,
        thumbnail:   w.wiki.thumbnail!,
        url:         w.wiki.url,
        description: w.wiki.description,
      }))
  }, [hike.cachedPoiWiki])

  const parsedSections = useMemo(() => guideText ? parseGuide(guideText) : [], [guideText])

  const displaySections = useMemo<DisplaySection[]>(() => {
    const byKey = new Map(parsedSections.filter(s => s.key).map(s => [s.key as GuideSectionKey, s]))
    const fixed: DisplaySection[] = GUIDE_SECTIONS.map(def => {
      const parsed = byKey.get(def.key)
      const style = SECTION_STYLE[def.key]
      return { key: def.key, guideKey: def.key, title: def.title, body: parsed?.body, icon: style.icon, color: style.color }
    })
    const legacy: DisplaySection[] = parsedSections
      .filter(s => !s.key)
      .map((s, i) => ({ key: `legacy-${i}` as const, guideKey: null, title: s.title, body: s.body, icon: LEGACY_STYLE.icon, color: LEGACY_STYLE.color }))
    return [...fixed, ...legacy]
  }, [parsedSections])

  const highlightedPoiIndex = useMemo(() => (
    highlightedPoiId != null && poiList ? poiList.pois.findIndex(p => p.id === highlightedPoiId) : null
  ), [highlightedPoiId, poiList])

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
  const autoTriggeredForRef = useRef<string | null>(null)

  // Re-sync from the caller's hike whenever it changes underneath us (e.g. switching routes
  // while this tab stays open, or the cached guide arriving from elsewhere).
  useEffect(() => {
    setGuideText(hike.cachedGuide ?? '')
    setGuideNotices(hike.cachedGuideNotices ?? [])
  }, [hike.id, hike.cachedGuide, hike.cachedGuideNotices])

  // Load route photos from Wikimedia Commons for hero + mosaic + section illustrations
  useEffect(() => {
    const pts = (hike.trackPoints ?? []).filter((p: { lat?: number; lon?: number }) => p.lat && p.lon) as { lat: number; lon: number }[]
    const poly = pts.length > 0 ? pts : (hike.routePolyline ?? []).map((p: [number, number]) => ({ lat: p[0], lon: p[1] }))
    if (!poly.length) return
    const mid = poly[Math.floor(poly.length / 2)]
    import('@/app/lib/guide/fetchRoutePhotos').then(({ fetchRoutePhotos }) =>
      fetchRoutePhotos(mid.lat, mid.lon, 15000, 6)
    ).then(photos => {
      setRoutePhotos(photos.map(p => p.url))
    }).catch(() => {})
  }, [hike.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver: track which section is in view for pin-nav highlighting
  useEffect(() => {
    if (!displaySections.length) return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = sectionRefs.current.indexOf(e.target as HTMLElement)
            if (idx >= 0) setVisibleSec(idx)
          }
        }
      },
      { threshold: 0.3, rootMargin: '-48px 0px -40% 0px' },
    )
    sectionRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [displaySections])

  // Rebuild chunks on section change
  useEffect(() => {
    chunksRef.current = buildChunks(displaySections)
  }, [displaySections])

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async (tier: GuideTier) => {
    setGenerating(true)
    setError(null)
    setGuideText('')
    setGuideNotices([])
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
    setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
    chunkIdxRef.current = 0

    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId: hike.id, tier }),
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
      }

      const { subtitle, cleanedText } = extractCoverSubtitle(acc)
      const { notices, cleanedText: cleanedText2 } = extractGuideNotices(cleanedText)
      acc = cleanedText2
      setGuideText(acc)
      setGuideNotices(notices)

      const cachedPois = (hike.cachedPois ?? []) as PoiItem[]
      const cachedPoiWiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
      const riddles = extractRiddles(acc, cachedPois, cachedPoiWiki)
      const epochPois = extractEpochPois(acc, cachedPois, cachedPoiWiki)
      const patch = { cachedGuide: acc, cachedGuideSubtitle: subtitle, cachedGuideNotices: notices, cachedRiddles: riddles, cachedEpochPois: epochPois, guideTier: tier, guideGeneratedAt: new Date().toISOString() }
      updatePlannedMeta(hike.id, patch).catch(() => {})
      onHikeUpdate(patch)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante la generazione')
    } finally {
      setGenerating(false)
    }
  }, [hike.id, hike.cachedPois, hike.cachedPoiWiki, onHikeUpdate])

  // Auto-generate the Breve guide the moment enrichment data has settled — no button, no user
  // action. Only fires once per hike (guarded by the ref) and only if this account can call
  // Claude at all; otherwise the "no access" card below invites the user to add a key instead.
  useEffect(() => {
    if (hike.cachedGuide || generating) return
    if (!enrichmentReady || hasAiAccess !== true) return
    if (autoTriggeredForRef.current === hike.id) return
    autoTriggeredForRef.current = hike.id
    generate('breve')
  }, [hike.id, hike.cachedGuide, enrichmentReady, hasAiAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Caller (e.g. tapping the Trail Score badge) asked to jump straight to a section.
  useEffect(() => {
    if (!scrollToSectionKey) return
    const idx = displaySections.findIndex(s => s.guideKey === scrollToSectionKey)
    if (idx >= 0) scrollToSection(idx)
    onScrollToSectionConsumed?.()
  }, [scrollToSectionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A POI pin was tapped (on the mini-map here or on the persistent stage map) — scroll to its
  // "### Nome" subheading inside "I luoghi da non perdere", if the guide got that far.
  useEffect(() => {
    if (highlightedPoiId == null || !poiList) return
    const wiki = poiList.poiWikiEntries.find(e => e.poi.id === highlightedPoiId)?.wiki
    const poi  = poiList.pois.find(p => p.id === highlightedPoiId)
    const name = wiki?.title ?? poi?.name
    if (!name) return
    document.getElementById(slugifyHeading(name))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedPoiId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    clearIosTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── PDF export ────────────────────────────────────────────────────────────

  const [exportingPdf, setExportingPdf] = useState(false)

  async function exportPdf() {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      const { exportGuidePdf } = await import('@/utils/pdfExport')
      await exportGuidePdf(hike, guideText)
    } catch (err) {
      console.error('Export PDF guida fallito:', err)
    } finally {
      setExportingPdf(false)
    }
  }

  // ── Widgets per section ───────────────────────────────────────────────────

  function renderWidget(key: DisplaySection['key']): ReactNode {
    switch (key) {
      case 'prima_di_partire':
        return weather
          ? <WeatherWidget mode={weather.mode} lat={weather.lat} lon={weather.lon} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} />
          : null
      case 'il_percorso':
        return (
          <RouteMapSection
            trackPoints={hike.trackPoints}
            pois={poiList?.pois ?? []}
            highlightedPoiIndex={highlightedPoiIndex}
            onPoiTap={poi => onPoiTap?.(poi.id)}
            onOpenMap3D={onOpenMap3D}
            showGradient={showGradient}
            showAspect={showAspect}
            dtmProfile={dtmProfile}
            planned
          />
        )
      case 'dati_sicurezza':
        return (
          <div className="space-y-5">
            {scores && <ScoresWidget {...scores} />}
            {safetyDetails && <SafetyWidget {...safetyDetails} />}
          </div>
        )
      case 'luoghi':
        return poiList
          ? <PoiListWidget {...poiList} highlightedIndex={highlightedPoiIndex} onItemTap={poi => onPoiTap?.(poi.id)} />
          : null
      case 'natura':
        return natura ? <NaturaWidget {...natura} /> : null
      default:
        return null
    }
  }

  const hasGuide  = guideText.trim().length > 50
  const tier      = hike.guideTier
  const effectiveTier: GuideTier = tier ?? 'approfondita'
  const hikeTitle = hike.title
  const categoryBadge = (hike.tags?.[0] ?? hike.assessment?.difficulty ?? 'Escursione').toUpperCase()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fdfcfa' }}>

      {topBanner && <div className="px-4 sm:px-6 pt-4">{topBanner}</div>}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ height: 'clamp(200px, 34vw, 340px)' }}>
        {routePhotos[0] ? (
          <Image
            src={routePhotos[0]}
            alt={hikeTitle}
            fill
            sizes="100vw"
            priority
            className="object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #813619 0%, #1c4724 50%, #4d4740 100%)' }}
          >
            <RouteSvg hike={hike} />
          </div>
        )}

        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to top, rgba(31,22,15,0.88) 0%, rgba(31,22,15,0.45) 40%, rgba(31,22,15,0.12) 80%, transparent 100%)',
        }} />

        <div className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 pb-5">
          <span className="inline-block bg-terra-500 text-white text-[8px] font-bold tracking-[2.5px] px-2.5 py-1 rounded-sm mb-2.5 uppercase">
            {categoryBadge}
          </span>
          <h1 className="font-display text-xl sm:text-3xl font-black text-white leading-tight mb-1 max-w-2xl uppercase tracking-tight"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}
          >
            {hikeTitle}
          </h1>
          {hike.plannedDate && (
            <p className="text-[12px] italic text-white/70">
              {format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="flex bg-stone-50 border-b border-stone-200">
        {[
          { icon: <Route    className="w-3.5 h-3.5" />, value: `${(hike.distanceMeters/1000).toFixed(1)} km`,         label: 'Distanza' },
          { icon: <Mountain className="w-3.5 h-3.5" />, value: `+${Math.round(hike.elevationGain)} m`,               label: 'Dislivello' },
          { icon: <Mountain className="w-3.5 h-3.5" />, value: `${Math.round(hike.altitudeMax)} m`,                  label: 'Quota max' },
          { icon: <Clock    className="w-3.5 h-3.5" />, value: formatDuration(hike.estimatedTimeSeconds),            label: 'Durata' },
        ].map(({ icon, value, label }, i, arr) => (
          <div key={label} className="flex-1 flex flex-col items-center justify-center py-3 gap-1"
            style={{ borderRight: i < arr.length - 1 ? '1px solid #dcd8cc' : 'none' }}
          >
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-stone-800 leading-none">
              <span className="text-terra-600 hidden sm:block">{icon}</span>
              {value}
            </span>
            <span className="font-display text-[7px] font-semibold tracking-[1.6px] uppercase text-stone-400">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Photo mosaic strip ─────────────────────────────────────────── */}
      <PhotoMosaic
        photos={routePhotos.slice(1, 5).map((url, i) => ({ id: String(i), url }))}
        heightClass="h-32"
      />

      {/* ── Voice controls + pin navigation (single sticky row) — always visible, since every
          section always has its own widget even before/without AI text. ─────────────────── */}
      <div data-hscroll className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b px-4 py-2 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: '#dcd8cc', scrollbarWidth: 'none' }}
      >
        {hasGuide && (
          <div className="flex items-center gap-1 shrink-0">
            {RATES.map((r, i) => (
              <button key={r} onClick={() => changeRate(i)}
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                  rateIdx === i ? 'bg-terra-500 text-white' : 'text-stone-400 hover:text-stone-600'
                }`}
              >{r}×</button>
            ))}
            <button onClick={togglePlayPause}
              className={`ml-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                isPlaying || isPaused
                  ? 'bg-terra-500 text-white hover:bg-terra-600'
                  : 'bg-terra-100 text-terra-700 hover:bg-terra-200'
              }`}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
            </button>
            {(isPlaying || isPaused) && (
              <button onClick={stopVoice}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors shrink-0"
              ><Square className="w-2.5 h-2.5" /></button>
            )}
            <div className="w-px h-5 bg-stone-200 shrink-0" />
          </div>
        )}
        <div className="flex gap-1.5 shrink-0">
          {displaySections.map((s, i) => (
            <button key={s.key} onClick={() => scrollToSection(i)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all whitespace-nowrap"
              style={visibleSec === i
                ? { background: s.color, color: 'white' }
                : { background: '#eeece5', color: '#8a7f6e' }
              }
            >
              <span className="[&>svg]:w-3 [&>svg]:h-3">{s.icon}</span>
              <span>{s.title.split(' ').slice(0, 3).join(' ')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6">

        {/* ── No AI access ─────────────────────────────────────────────── */}
        {!hasGuide && hasAiAccess === false && (
          <div className="flex flex-col items-center py-10 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center shadow-inner">
              <KeyRound className="w-6 h-6 text-terra-500" />
            </div>
            <div className="max-w-sm">
              <h2 className="font-display text-lg font-bold text-stone-800 mb-2">
                Racconto di Giulia non disponibile
              </h2>
              <p className="text-stone-500 text-sm leading-relaxed">
                Aggiungi la tua chiave API Claude nelle impostazioni del profilo per generare la guida narrata —
                intanto qui sotto trovi comunque mappa, profilo, punteggi e punti di interesse del percorso.
              </p>
            </div>
          </div>
        )}

        {/* ── Preparing (waiting for enrichment) ──────────────────────── */}
        {!hasGuide && hasAiAccess !== false && !generating && !enrichmentReady && (
          <div className="flex items-center gap-3 py-8 justify-center text-center">
            <Loader2 className="w-5 h-5 animate-spin text-terra-500" />
            <p className="text-stone-500 text-sm">Sto raccogliendo i dati del percorso… la guida di Giulia arriverà tra poco.</p>
          </div>
        )}

        {/* ── Generating spinner (no text yet) ────────────────────────── */}
        {!hasGuide && generating && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center animate-pulse">
              <BookOpen className="w-6 h-6 text-terra-500" />
            </div>
            <div>
              <p className="font-display font-semibold text-stone-700">Giulia sta scrivendo…</p>
              <p className="text-stone-400 text-sm mt-1">i dati qui sotto sono già consultabili nel frattempo</p>
            </div>
          </div>
        )}

        {/* ── Voice progress bar (when playing) ──────────────────────── */}
        {(isPlaying || isPaused) && hasGuide && (
          <div className="mt-4 bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3" style={{ borderColor: '#dcd8cc' }}>
            <Volume2 className="w-3.5 h-3.5 text-terra-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-stone-600 truncate">
                {isPlaying && activeSection !== null
                  ? `▶ ${displaySections[activeSection]?.title ?? '…'}`
                  : '⏸ In pausa'}
              </p>
              <div className="mt-1 h-0.5 bg-terra-100 rounded-full overflow-hidden">
                <div className="h-full bg-terra-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(playProgress * 100)}%` }} />
              </div>
            </div>
            <button onClick={stopVoice}
              className="text-stone-400 hover:text-stone-700 transition-colors"
            ><Square className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── Stato del percorso — avvisi trovati dalla ricerca web di Giulia ──────────── */}
        {guideNotices.length > 0 && (
          <div className="mt-4 space-y-2">
            {guideNotices.map((notice, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[13px] leading-relaxed text-amber-900">{notice}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Guide sections — always rendered (widgets), text where available ────────── */}
        <div className="mt-4 space-y-0">
          {displaySections.map((s, i) => {
            const isLuoghi = s.guideKey === 'luoghi'
            const isVoiceActive = activeSection === i && (isPlaying || isPaused)
            const showBreveHint = hasGuide && effectiveTier === 'breve' && !s.body && !generating

            return (
              <article
                key={s.key}
                ref={el => { sectionRefs.current[i] = el }}
                className={`scroll-mt-16 bg-white rounded-2xl mb-4 overflow-hidden shadow-sm transition-shadow ${
                  isVoiceActive ? 'ring-2 ring-terra-300 shadow-terra-100 shadow-md' : 'hover:shadow-md'
                }`}
              >
                <div
                  className="flex items-center gap-3 px-5 py-3"
                  style={{ background: s.color }}
                >
                  <div className="w-1.5 h-6 rounded-full bg-white/25 shrink-0" />
                  <div className="flex items-center gap-2 text-white">
                    <span className="[&>svg]:w-4 [&>svg]:h-4 opacity-80">{s.icon}</span>
                    <h2 className="font-display text-[12px] font-bold tracking-[2px] uppercase">{s.title}</h2>
                  </div>
                  <div className="flex-1" />
                  {s.body && (
                    <button
                      onClick={() => speakSection(i)}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      title="Ascolta questa sezione"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>

                <div className="px-5 py-5 sm:px-6">
                  {(() => {
                    const widget = renderWidget(s.key)
                    return (
                      <>
                        {widget}
                        {s.body && (
                          <div className={widget ? 'mt-5 pt-5 border-t' : ''} style={widget ? { borderColor: '#dcd8cc' } : undefined}>
                            <MagazineBody body={s.body} color={s.color} sectionPhoto={routePhotos[i + 1]} />
                          </div>
                        )}
                      </>
                    )
                  })()}

                  {showBreveHint && (
                    <p className="text-xs italic text-stone-400 mt-4">
                      Premi &quot;Approfondisci&quot; per il racconto completo di questa sezione.
                    </p>
                  )}

                  {isLuoghi && poiPhotos.length > 0 && (
                    <div className="mt-6 pt-5 border-t" style={{ borderColor: '#dcd8cc' }}>
                      <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-stone-400 mb-3">
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

          {hasGuide && generating && (
            <div className="flex items-center gap-2 px-5 py-4 bg-white rounded-2xl shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-terra-500" />
              <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {hasGuide && !generating && hasAiAccess === true && (
          <GuideQA hikeId={hike.id} />
        )}

        {/* ── Bottom actions ──────────────────────────────────────────── */}
        {hasGuide && !generating && (
          <div className="mt-8 mb-6 pt-5 flex flex-wrap items-center justify-end gap-3" style={{ borderTop: '1px solid #dcd8cc' }}>
            {effectiveTier === 'breve' && (
              <button onClick={() => generate('approfondita')}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-terra-500 hover:bg-terra-600 text-white rounded-full text-sm font-semibold transition-all shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Approfondisci
              </button>
            )}

            <button onClick={() => generate(effectiveTier)} disabled={generating}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-terra-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rigenera
            </button>

            {!('speechSynthesis' in (typeof window !== 'undefined' ? window : {})) && (
              <span className="flex items-center gap-1 text-xs text-stone-400">
                <VolumeX className="w-3.5 h-3.5" /> Voce non supportata
              </span>
            )}

            <button onClick={exportPdf} disabled={exportingPdf}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white rounded-full text-sm font-semibold transition-all shadow-sm"
            >
              {exportingPdf
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileDown className="w-3.5 h-3.5" />}
              {exportingPdf ? 'Genero PDF…' : 'Scarica PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
