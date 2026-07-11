'use client'
import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import type { WikiPage } from '@/lib/wikipedia'
import {
  VolumeX, Loader2, RefreshCw,
  FileDown, BookOpen, Sparkles,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'
import PhotoMosaic from '@/components/PhotoMosaic'
import { extractRiddles } from '@/lib/riddles'
import { extractEpochPois } from '@/lib/epochPois'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices } from '@/lib/guideNotices'
import { extractGuideSources, type GuideSource } from '@/lib/guideSources'
import { stripGuideStatus } from '@/lib/guideStatus'
import { AlertTriangle, Link2, KeyRound } from 'lucide-react'
import GuideQA from './widgets/GuideQA'
import { GUIDE_SECTIONS, sectionDefForTitle, type GuideSectionKey } from '@/lib/guideSections'
import { SECTION_STYLE, LEGACY_STYLE } from './sectionStyle'
import { slugifyHeading } from '@/lib/guideSlug'
import WeatherWidget from '@/components/WeatherWidget'
import RouteMapSection from '@/components/RouteMapSection'
import ScoresWidget from './widgets/ScoresWidget'
import SafetyWidget from './widgets/SafetyWidget'
import PoiListWidget from './widgets/PoiListWidget'
import NaturaWidget from './widgets/NaturaWidget'
import GuideHero from './GuideHero'
import GuideStatsStrip from './GuideStatsStrip'
import GuideSectionNav from './GuideSectionNav'
import VoicePlayer from './VoicePlayer'
import SectionCard from './SectionCard'
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
  /** Distanza/durata in auto dall'indirizzo salvato nelle impostazioni fino al trailhead — vedi
   *  app/guida/useDrivingDistance.ts. Undefined finché l'indirizzo non è geocodificato o non c'è
   *  un punto di partenza noto per questo percorso. mapsUrl apre le indicazioni su Google Maps. */
  driving?: { distanceMeters: number; durationSeconds: number; mapsUrl?: string } | null
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

interface ParsedSection { key: GuideSectionKey | null; title: string; body: string }

function parseGuide(text: string): ParsedSection[] {
  return text.split(/^## /m).filter(Boolean).map(part => {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    return { key: sectionDefForTitle(title)?.key ?? null, title, body }
  })
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
 *
 * Layout: this is the orchestrator only — hero, stats strip, section nav, voice mini-player and
 * each section's editorial header/body live in their own components (GuideHero, GuideStatsStrip,
 * GuideSectionNav, VoicePlayer, SectionCard/MagazineBody). State, effects and handlers for TTS,
 * generation and scroll/nav all stay here and get threaded down as props.
 */
export default function GuideReader({
  hike, onHikeUpdate, topBanner, enrichmentReady, hasAiAccess,
  scrollToSectionKey, onScrollToSectionConsumed, highlightedPoiId, onPoiTap,
  weather, onOpenMap3D, showGradient, showAspect, dtmProfile, scores, safetyDetails, poiList, natura, driving,
}: Props) {
  const [guideText,    setGuideText]    = useState<string>(hike.cachedGuide ?? '')
  const [guideNotices, setGuideNotices] = useState<string[]>(hike.cachedGuideNotices ?? [])
  const [guideSources, setGuideSources] = useState<GuideSource[]>(hike.cachedGuideSources ?? [])
  const [genStatus,    setGenStatus]    = useState<string | undefined>(undefined)
  const [generating,   setGenerating]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [routePhotos,  setRoutePhotos]  = useState<string[]>([])
  const [visibleSec,   setVisibleSec]   = useState(0)

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
    setGuideSources(hike.cachedGuideSources ?? [])
  }, [hike.id, hike.cachedGuide, hike.cachedGuideNotices, hike.cachedGuideSources])

  // Load route photos from Wikimedia Commons for the mosaic + section illustrations (the hero
  // itself is now a recolored map, not a photo — see GuideHero — so every photo slot here goes
  // to the mosaic/section illustrations instead of being reserved for the hero).
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

  // IntersectionObserver: track which section is in view for pin-nav highlighting. Uses a thin
  // "activation band" near the top of the viewport (threshold 0, shrunk rootMargin) rather than
  // a ratio threshold — a ratio threshold (e.g. 0.3) requires 30% of the *target's own* height to
  // be visible, which tall sections (mappa+profilo altimetrico in "Il percorso", mappa+lista+
  // galleria in "I luoghi da non perdere") could fail to ever reach, leaving their nav pill never
  // highlighted. A thin band only needs any overlap, so it works regardless of section height.
  // Intersection state per section is tracked across callback batches (not just the entries in
  // the current batch) since enter/exit events for different sections don't always land together.
  useEffect(() => {
    if (!displaySections.length) return
    const state = new Map<number, boolean>()
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const idx = sectionRefs.current.indexOf(e.target as HTMLElement)
          if (idx >= 0) state.set(idx, e.isIntersecting)
        }
        const activeIdxs = Array.from(state.entries()).filter(([, v]) => v).map(([k]) => k)
        if (activeIdxs.length > 0) setVisibleSec(Math.max(...activeIdxs))
      },
      { threshold: 0, rootMargin: '-96px 0px -70% 0px' },
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
    setGuideSources([])
    setGenStatus(undefined)
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
        const { lastStatus, cleanedText: displayText } = stripGuideStatus(acc)
        if (lastStatus) setGenStatus(lastStatus)
        setGuideText(displayText)
      }
      acc = stripGuideStatus(acc).cleanedText
      setGenStatus(undefined)

      const { subtitle, cleanedText } = extractCoverSubtitle(acc)
      const { notices, cleanedText: cleanedText2 } = extractGuideNotices(cleanedText)
      const { sources, cleanedText: cleanedText3 } = extractGuideSources(cleanedText2)
      acc = cleanedText3
      setGuideText(acc)
      setGuideNotices(notices)
      setGuideSources(sources)

      const cachedPois = (hike.cachedPois ?? []) as PoiItem[]
      const cachedPoiWiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
      const riddles = extractRiddles(acc, cachedPois, cachedPoiWiki)
      const epochPois = extractEpochPois(acc, cachedPois, cachedPoiWiki)
      const patch = { cachedGuide: acc, cachedGuideSubtitle: subtitle, cachedGuideNotices: notices, cachedGuideSources: sources, cachedRiddles: riddles, cachedEpochPois: epochPois, guideTier: tier, guideGeneratedAt: new Date().toISOString() }
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
            showPois={false}
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
          ? (
            <PoiListWidget
              {...poiList}
              highlightedPoiId={highlightedPoiId}
              onItemTap={poi => onPoiTap?.(poi.id)}
              trackPoints={hike.trackPoints}
              onOpenMap3D={onOpenMap3D}
            />
          )
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
  const showApprofondisciHint = hasGuide && !generating && effectiveTier === 'breve'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fdfcfa' }}>

      {topBanner && <div className="px-4 sm:px-6 pt-4">{topBanner}</div>}

      <GuideHero
        trackPoints={hike.trackPoints}
        routePolyline={hike.routePolyline}
        title={hikeTitle}
        categoryBadge={categoryBadge}
        plannedDate={hike.plannedDate}
        driving={driving}
      />

      <GuideStatsStrip
        distanceKm={hike.distanceMeters / 1000}
        elevationGain={hike.elevationGain}
        altitudeMax={hike.altitudeMax}
        durationLabel={formatDuration(hike.estimatedTimeSeconds)}
        driving={driving}
      />

      <PhotoMosaic
        photos={routePhotos.slice(0, 4).map((url, i) => ({ id: String(i), url }))}
        heightClass="h-32"
      />

      {/* ── Section nav (mobile: sticky pill bar / md+: sidebar) + reading column ────────── */}
      <div className="md:px-8 md:max-w-[1180px] md:mx-auto">
        <div className="md:grid md:grid-cols-[auto_1fr] md:gap-8 md:items-start md:pt-6">
          <GuideSectionNav
            sections={displaySections.map(s => ({ key: s.key, title: s.title, icon: s.icon, color: s.color }))}
            activeIndex={visibleSec}
            onSelect={scrollToSection}
          />

          <div className="min-w-0 px-4 sm:px-6 md:px-0 md:max-w-3xl lg:max-w-[52rem]">

            {/* ── Voice mini-player ──────────────────────────────────────────── */}
            {hasGuide && (
              <div className="mt-4">
                <VoicePlayer
                  isPlaying={isPlaying}
                  isPaused={isPaused}
                  rateIdx={rateIdx}
                  onTogglePlayPause={togglePlayPause}
                  onStop={stopVoice}
                  onChangeRate={changeRate}
                />
              </div>
            )}

            {/* ── Voice progress (sticky while playing, so stop stays reachable) ─────── */}
            {(isPlaying || isPaused) && hasGuide && (
              <div className="sticky top-2 z-10 mt-3 bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3 shadow-sm" style={{ borderColor: '#dcd8cc' }}>
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
              </div>
            )}

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
                  <p className="font-display font-semibold text-stone-700">{genStatus ?? 'Giulia sta scrivendo…'}</p>
                  <p className="text-stone-400 text-sm mt-1">i dati qui sotto sono già consultabili nel frattempo</p>
                </div>
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
            <div className="mt-4">
              {displaySections.map((s, i) => (
                <SectionCard
                  key={s.key}
                  ref={el => { sectionRefs.current[i] = el }}
                  title={s.title}
                  icon={s.icon}
                  color={s.color}
                  body={s.body}
                  widget={renderWidget(s.key)}
                  sectionPhoto={routePhotos[i]}
                  twoColumns
                  isVoiceActive={activeSection === i && (isPlaying || isPaused)}
                  onSpeak={() => speakSection(i)}
                  showApprofondisciHint={showApprofondisciHint}
                  onApprofondisci={showApprofondisciHint ? () => generate('approfondita') : undefined}
                />
              ))}

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

            {hasGuide && !generating && guideSources.length > 0 && (
              <div className="mt-4 mb-2">
                <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-stone-400 mb-2">
                  Fonti consultate online
                </p>
                <div className="flex flex-wrap gap-2">
                  {guideSources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[11px] text-stone-600"
                      title={s.url}
                    >
                      <Link2 className="w-3 h-3 shrink-0 text-stone-400" />
                      <span className="truncate">{s.title}</span>
                    </a>
                  ))}
                </div>
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
      </div>
    </div>
  )
}
