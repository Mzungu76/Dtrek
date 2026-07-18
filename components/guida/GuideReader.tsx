'use client'
import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { formatDuration } from '@/lib/tcxParser'
import type { WikiPage } from '@/lib/wikipedia'
import {
  VolumeX, Loader2,
  FileDown, BookOpen, Sparkles,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'
import PhotoMosaic from '@/components/PhotoMosaic'
import { extractEpochPois } from '@/lib/epochPois'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices, normalizeGuideNotices, parseNoticeSource, type GuideNotice } from '@/lib/guideNotices'
import { extractGuideSources, type GuideSource } from '@/lib/guideSources'
import { stripGuideStatus } from '@/lib/guideStatus'
import { extractGuideAiError, type GuideAiError } from '@/lib/guideAiError'
import CreditErrorModal from './CreditErrorModal'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { AlertTriangle, Link2, KeyRound } from 'lucide-react'
import GuideQA from './widgets/GuideQA'
import {
  GUIDE_SECTIONS, DEFAULT_BREVE_SECTIONS, GUIDE_TEXT_LENGTHS, DEFAULT_SECTION_LENGTHS,
  sanitizeSectionLengths, countMoltoApprofondita, MAX_MOLTO_APPROFONDITA_SECTIONS,
  type GuideSectionKey, type GuideTextLength, type SectionLengthMap,
} from '@/lib/guideSections'
import { parseGuideSections, mergeGuideSection } from '@/lib/guideParse'
import { SECTION_STYLE, LEGACY_STYLE } from './sectionStyle'
import { slugifyHeading } from '@/lib/guideSlug'
import WeatherWidget from '@/components/WeatherWidget'
import RouteMapSection from '@/components/RouteMapSection'
import DatiSicurezzaTabs from './widgets/DatiSicurezzaTabs'
import PoiListWidget from './widgets/PoiListWidget'
import NaturaWidget from './widgets/NaturaWidget'
import GuideHero from './GuideHero'
import GuideStatsStrip from './GuideStatsStrip'
import SectionNav from '@/components/editorial/SectionNav'
import VoicePlayer from '@/components/editorial/VoicePlayer'
import SectionCard from '@/components/editorial/SectionCard'
import type { CtsProps } from '@/components/ScoreRing'
import type { SafetyScore } from '@/lib/safetyScore'
import type { HikeAssessment } from '@/lib/hikeAssessment'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

// ── Types ─────────────────────────────────────────────────────────────────────

// Stile del riquadro avviso per gravità (vedi lib/guideNotices.ts) — una chiusura reale (danger)
// deve leggersi diversamente da una nota stagionale (info), non tutte uguali in ambra.
const NOTICE_SEVERITY_STYLE: Record<GuideNotice['severity'], { box: string; icon: string; text: string; link: string }> = {
  danger:  { box: 'border-red-200 bg-red-50',       icon: 'text-red-600',    text: 'text-red-900',    link: 'bg-red-100 hover:bg-red-200 text-red-800' },
  warning: { box: 'border-amber-200 bg-amber-50',   icon: 'text-amber-600',  text: 'text-amber-900',  link: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
  info:    { box: 'border-sky-200 bg-sky-50',       icon: 'text-sky-600',    text: 'text-sky-900',    link: 'bg-sky-100 hover:bg-sky-200 text-sky-800' },
}

interface DisplaySection {
  key: GuideSectionKey | `legacy-${number}`
  guideKey: GuideSectionKey | null
  title: string
  subtitle?: string
  body?: string
  icon: ReactNode
  color: string
}

export interface ScoresBundle {
  safety: SafetyScore | null
  cts: CtsProps
  showAspectToggle: boolean
  showGradientToggle: boolean
  showAspect: boolean
  showGradient: boolean
  onToggleAspect: () => void
  onToggleGradient: () => void
  /** Avvisi trovati dalla ricerca web di Giulia (vedi lib/guideNotices.ts) — puramente
   *  informativi, mostrati come puntini colorati sull'anello Sicurezza del badge a doppio anello
   *  (components/TrailScoreGaugeBadge.tsx), non entrano nel calcolo del punteggio. */
  guideNotices?: GuideNotice[]
}

export interface SafetyDetailsBundle {
  assessment?: HikeAssessment
  hasGps: boolean
  osmId?: number
  polyline?: [number, number][]
  plannedId: string
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
  flora?: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

interface Props {
  hike: PlannedHike
  /** Mirrors what's persisted (cachedGuide/cachedEpochPois/guideTier) back into the caller's own
   *  hike state, so the rest of the app (epoch POIs) sees a freshly generated guide without
   *  waiting for a refetch. */
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  /** True once every enrichment source (POI/Wikipedia, scores, sicurezza, natura) has settled (or
   *  a safety timeout fired) — gates the automatic Breve generation. */
  enrichmentReady: boolean
  /** null while the pre-flight check is in flight, then whether this account can call Claude at all. */
  hasAiAccess: boolean | null
  /** true when the check itself failed (e.g. Supabase irraggiungibile) rather than confirming the
   *  account genuinely has no key — shows a "riprova più tardi" message instead of "aggiungi la
   *  tua chiave" (which would be misleading for someone who already saved one). */
  aiUnavailable: boolean
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
  hike, onHikeUpdate, enrichmentReady, hasAiAccess, aiUnavailable,
  scrollToSectionKey, onScrollToSectionConsumed, highlightedPoiId, onPoiTap,
  weather, onOpenMap3D, showGradient, showAspect, dtmProfile, scores, safetyDetails, poiList, natura, driving,
}: Props) {
  const [guideText,    setGuideText]    = useState<string>(hike.cachedGuide ?? '')
  const [guideNotices, setGuideNotices] = useState<GuideNotice[]>(normalizeGuideNotices(hike.cachedGuideNotices))
  const [guideSources, setGuideSources] = useState<GuideSource[]>(hike.cachedGuideSources ?? [])
  const [genStatus,    setGenStatus]    = useState<string | undefined>(undefined)
  const [generating,   setGenerating]   = useState(false)
  // Sezioni in corso di generazione in QUESTA chiamata (una sola per "Approfondisci con Giulia" su
  // una sezione, più d'una per "Genera il resto della guida") — pilota lo spinner per-sezione in
  // SectionCard senza interferire con `generating`, usato solo per la primissima generazione.
  const [generatingSections, setGeneratingSections] = useState<GuideSectionKey[]>([])
  // Lunghezza scelta per sezione — parte dal default salvato in Impostazioni (vedi l'effetto più
  // sotto), modificabile qui per sezione prima di premere "Approfondisci con Giulia" / "Genera il
  // resto della guida": è l'override "per singola guida" richiesto, non persistito altrove.
  const [sectionLengths, setSectionLengths] = useState<SectionLengthMap>(DEFAULT_SECTION_LENGTHS)
  const [error,        setError]        = useState<string | null>(null)
  // Errore AI irreversibile rilevato a metà stream (es. credito Anthropic esaurito, vedi
  // lib/guideAiError.ts) — mostrato come popup dedicato invece del banner generico `error` sopra,
  // perché richiede un'azione dell'utente (ricaricare credito o cambiare modello) e non va perso
  // di vista in fondo alla pagina.
  const [aiCreditError, setAiCreditError] = useState<GuideAiError | null>(null)
  const [routePhotos,  setRoutePhotos]  = useState<string[]>([])
  const [visibleSec,   setVisibleSec]   = useState(0)

  const parsedSections = useMemo(() => guideText ? parseGuideSections(guideText) : [], [guideText])

  const displaySections = useMemo<DisplaySection[]>(() => {
    const byKey = new Map(parsedSections.filter(s => s.key).map(s => [s.key as GuideSectionKey, s]))
    const fixed: DisplaySection[] = GUIDE_SECTIONS.map(def => {
      const parsed = byKey.get(def.key)
      const style = SECTION_STYLE[def.key]
      return { key: def.key, guideKey: def.key, title: def.title, subtitle: def.subtitle, body: parsed?.body, icon: style.icon, color: style.color }
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
    setGuideNotices(normalizeGuideNotices(hike.cachedGuideNotices))
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

  // Genera una o più sezioni con Giulia in una sola chiamata AI — sostituisce i vecchi generate()
  // (guida intera) e generateSection() (una sola): ora è la stessa funzione sia per la
  // generazione automatica iniziale, sia per "Approfondisci con Giulia" su una sezione, sia per
  // "Genera il resto della guida" su più sezioni mancanti insieme. Due modalità, a seconda che il
  // percorso abbia già del testo:
  //  - primissima generazione (nessuna sezione scritta finora): reset completo + anteprima live
  //    man mano che lo stream arriva.
  //  - aggiunta di sezioni a una guida già esistente: nessun reset, nessuna anteprima live — solo
  //    uno spinner per-sezione (generatingSections) finché il risultato non è pronto, poi fuso nel
  //    testo già visibile con mergeGuideSection (lib/guideParse.ts), sezione per sezione.
  const generateSections = useCallback(async (sections: GuideSectionKey[]) => {
    if (generating || generatingSections.length > 0 || sections.length === 0) return
    const isInitial = guideText.trim().length <= 50
    // Istantanea del testo già esistente PRIMA di questa chiamata — usata per fondere in anteprima
    // live le sole sezioni di questa richiesta (vedi onChunk sotto), senza toccare quelle già
    // scritte. Da qui in poi lo state guideText non va più letto: verrà aggiornato progressivamente
    // dalla preview stessa.
    const baseText = isInitial ? '' : guideText

    if (isInitial) {
      setGenerating(true)
      setGuideText('')
      setGuideNotices([])
      setGuideSources([])
      setGenStatus(undefined)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
      setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
      chunkIdxRef.current = 0
    } else {
      setGeneratingSections(sections)
    }
    setError(null)

    try {
      // hikeFallback: usato dal server SOLO in modalità di emergenza (Supabase del tutto
      // irraggiungibile, nessun utente verificabile) — la copia che il browser ha già in
      // locale, per non bloccare la generazione in quei momenti. Ignorato in condizioni normali.
      // Override "per singola guida" della lunghezza — solo per le sezioni di QUESTA richiesta,
      // presa dal selettore accanto al bottone "Approfondisci"/"Genera il resto" (sectionLengths
      // state, di partenza uguale al default salvato in Impostazioni). Il server la fonde con
      // quel default per ogni altra sezione non toccata qui — vedi effectiveSectionLengths in
      // app/api/guide/route.ts.
      const sectionLengthsForCall = Object.fromEntries(sections.map(k => [k, sectionLengths[k]]))
      let acc = await streamFetchText('/api/guide', {
        hikeId: hike.id,
        sections,
        sectionLengths: sectionLengthsForCall,
        hikeFallback: {
          title:                hike.title,
          plannedDate:          hike.plannedDate,
          userNotes:            hike.userNotes,
          tags:                 hike.tags,
          distanceMeters:       hike.distanceMeters,
          elevationGain:        hike.elevationGain,
          elevationLoss:        hike.elevationLoss,
          altitudeMax:          hike.altitudeMax,
          altitudeMin:          hike.altitudeMin,
          estimatedTimeSeconds: hike.estimatedTimeSeconds,
          assessment:           hike.assessment,
          cachedPois:           hike.cachedPois,
          cachedPoiWiki:        hike.cachedPoiWiki,
          trackPoints:          hike.trackPoints,
        },
      }, (partial) => {
        const { lastStatus, cleanedText: displayText } = stripGuideStatus(partial)
        if (lastStatus) setGenStatus(lastStatus)
        // Stesso taglio del commento libero pre-prima-sezione applicato in anteprima live, non
        // solo a fine generazione — altrimenti per qualche istante, prima che il modello scriva il
        // primo "## ", quel testo appare come una finta sezione a sé (si "aggiusta" da solo appena
        // arriva il primo titolo vero, ma nel frattempo si vede).
        const firstHeadingIdx = displayText.search(/^## /m)
        const cleaned = firstHeadingIdx > 0 ? displayText.slice(firstHeadingIdx) : displayText
        if (isInitial) {
          setGuideText(cleaned)
        } else {
          // "Approfondisci"/"Genera il resto": fonde in anteprima live SOLO le sezioni di questa
          // richiesta dentro la guida già esistente (stesso mergeGuideSection usato per il
          // salvataggio finale più sotto), così il testo compare progressivamente al posto giusto
          // invece di restare dietro a un semplice spinner — senza toccare le sezioni già scritte
          // in precedenza (baseText, mai lo state guideText che cambierebbe sotto i piedi).
          const partialSections = parseGuideSections(cleaned)
          let preview = baseText
          for (const sec of partialSections) {
            if (!sec.key) continue
            preview = mergeGuideSection(preview, sec.key, sec.title, sec.body)
          }
          setGuideText(preview)
        }
      })
      acc = stripGuideStatus(acc).cleanedText
      setGenStatus(undefined)

      const { aiError, cleanedText: withoutAiError } = extractGuideAiError(acc)
      if (aiError) { setAiCreditError(aiError); return }
      acc = withoutAiError

      // [sottotitolo] compare solo alla primissima generazione, [avviso]/[fonti] solo quando
      // "Verificato online" è tra le sezioni richieste (vedi SYSTEM_VERIFICATO in
      // app/api/guide/route.ts) — per ogni altra combinazione questi extract tornano comunque
      // vuoti/undefined sul testo, quindi non serve altra guardia qui. Senza questa guardia legata
      // alla sezione giusta, un "Approfondisci" richiesto sulla sola "Verificato online" (senza
      // "Il percorso" nella stessa chiamata) lasciava i tag [avviso]/[fonti] grezzi nel testo,
      // poi persistiti così com'erano dal patch più sotto.
      let subtitle: string | undefined
      if (isInitial) {
        const r = extractCoverSubtitle(acc)
        subtitle = r.subtitle
        acc = r.cleanedText
      }
      let notices = guideNotices
      let sources = guideSources
      if (sections.includes('verificato')) {
        const rn = extractGuideNotices(acc)
        notices = rn.notices
        const rs = extractGuideSources(rn.cleanedText)
        sources = rs.sources
        acc = rs.cleanedText
      }

      const cachedPois = (hike.cachedPois ?? []) as PoiItem[]
      const cachedPoiWiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
      const { epochPois, cleanedText: c1 } = extractEpochPois(acc, cachedPois, cachedPoiWiki)
      acc = c1

      // Ogni tanto il modello scrive una riga di commento libero ("Ho tutte le informazioni che
      // mi servono, ora scrivo la guida...") prima del primo titolo di sezione, non racchiusa in
      // nessun tag riconosciuto — senza questo taglio diventa una finta sezione "legacy" con
      // titolo posticcio (parseGuide tratta il testo prima del primo "## " come una sezione a sé).
      const firstHeadingIdx = acc.search(/^## /m)
      if (firstHeadingIdx > 0) acc = acc.slice(firstHeadingIdx)

      const parsedNew = parseGuideSections(acc)
      if (parsedNew.every(s => !s.key)) throw new Error('Risposta non riconosciuta, riprova.')
      let merged = baseText
      for (const sec of parsedNew) {
        if (!sec.key) continue
        merged = mergeGuideSection(merged, sec.key, sec.title, sec.body)
      }

      setGuideText(merged)
      setGuideNotices(notices)
      setGuideSources(sources)

      // Le epoche esistono solo per la sezione "luoghi" — rigenerandola sostituiscono le
      // precedenti (evita duplicati sugli stessi POI), per ogni altra combinazione restano invariate.
      const mergedEpochPois = sections.includes('luoghi') ? epochPois : (hike.cachedEpochPois ?? [])

      const patch: Partial<PlannedHike> = {
        cachedGuide: merged,
        cachedGuideNotices: notices,
        cachedGuideSources: sources,
        cachedEpochPois: mergedEpochPois,
        guideTier: 'breve',
        guideGeneratedAt: new Date().toISOString(),
      }
      if (isInitial) patch.cachedGuideSubtitle = subtitle
      updatePlannedMeta(hike.id, patch).catch(() => {})
      onHikeUpdate(patch)
    } catch (e) {
      if (e instanceof StreamFetchError) {
        // message (se presente) è il testo pensato per l'utente — error è solo il codice
        // macchina (es. "ai_temporarily_unavailable"), non va mostrato direttamente.
        const j = e.body as { error?: string; message?: string }
        setError(j.message ?? j.error ?? `HTTP ${e.status}`)
      } else {
        setError(e instanceof Error ? e.message : 'Errore durante la generazione')
      }
    } finally {
      setGenerating(false)
      setGeneratingSections([])
    }
  }, [
    generating, generatingSections, guideText, guideNotices, guideSources,
    hike.id, hike.title, hike.plannedDate, hike.userNotes, hike.tags,
    hike.distanceMeters, hike.elevationGain, hike.elevationLoss, hike.altitudeMax, hike.altitudeMin,
    hike.estimatedTimeSeconds, hike.assessment, hike.cachedPois, hike.cachedPoiWiki, hike.trackPoints,
    hike.cachedEpochPois,
    onHikeUpdate, sectionLengths,
  ])

  // Sezioni Breve scelte dall'utente in Impostazioni (components/profilo/SectionGuida.tsx) — null
  // finché non si sa ancora (in caricamento), in quel caso l'effetto sotto aspetta invece di
  // generare comunque; un fallimento del fetch non deve bloccare la generazione automatica per
  // sempre, quindi in quel caso si assume il default (comportamento di prima di questa impostazione).
  const [autoGenSections, setAutoGenSections] = useState<GuideSectionKey[] | null>(null)
  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        setAutoGenSections(Array.isArray(d.guideBreveSections) ? d.guideBreveSections as GuideSectionKey[] : DEFAULT_BREVE_SECTIONS)
        if (d.guideSectionLengths) setSectionLengths(sanitizeSectionLengths(d.guideSectionLengths))
      })
      .catch(() => setAutoGenSections(DEFAULT_BREVE_SECTIONS))
  }, [])

  // Auto-generate the Breve guide the moment enrichment data has settled — no button, no user
  // action. Only fires once per hike (guarded by the ref) and only if this account can call
  // Claude at all; otherwise the "no access" card below invites the user to add a key instead.
  // Salta del tutto se l'utente ha scelto zero sezioni automatiche in Impostazioni — evita una
  // chiamata AI per una guida che non scriverebbe comunque nessun testo.
  useEffect(() => {
    if (hike.cachedGuide || generating) return
    if (!enrichmentReady || hasAiAccess !== true) return
    if (!autoGenSections || autoGenSections.length === 0) return
    if (autoTriggeredForRef.current === hike.id) return
    autoTriggeredForRef.current = hike.id
    generateSections(autoGenSections)
  }, [hike.id, hike.cachedGuide, enrichmentReady, hasAiAccess, autoGenSections]) // eslint-disable-line react-hooks/exhaustive-deps

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
        return <DatiSicurezzaTabs scores={scores ? { ...scores, guideNotices } : scores} safetyDetails={safetyDetails} />
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
      case 'verificato':
        // Avvisi (banner colorati per gravità) + fonti consultate — prima mostrati globalmente
        // sopra tutte le sezioni, ora vivono qui: stessi dati (guideNotices/guideSources, mai
        // toccati), solo raccolti in un unico posto invece di sparsi in due blocchi separati.
        return (guideNotices.length > 0 || guideSources.length > 0) ? (
          <div className="space-y-3">
            {guideNotices.length > 0 && (
              <div className="space-y-2">
                {guideNotices.map((notice, i) => {
                  const { text, url } = parseNoticeSource(notice.text)
                  const style = NOTICE_SEVERITY_STYLE[notice.severity]
                  return (
                    <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${style.box}`}>
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`} />
                      <div className="min-w-0">
                        <p className={`text-[13px] leading-relaxed ${style.text}`}>{text}</p>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full transition-colors text-[11px] ${style.link}`}
                            title={url}
                          >
                            <Link2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                            <span className="truncate">Vai alla fonte</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {guideSources.length > 0 && (
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
            )}
          </div>
        ) : null
      default:
        return null
    }
  }

  // Selettore "Essenziale/Approfondita/Molto approfondita" mostrato accanto al bottone
  // "Approfondisci con Giulia" di ogni sezione ancora senza testo (vedi SectionCard's
  // lengthSelector) — parte dal default salvato in Impostazioni (sectionLengths state) ma è solo
  // un override locale per QUESTA generazione, non persistito.
  const renderLengthSelector = (key: GuideSectionKey) => {
    const moltoCount = countMoltoApprofondita(sectionLengths)
    return (
    <div className="flex items-center gap-0.5 rounded-full border border-stone-200 p-0.5 shrink-0">
      {GUIDE_TEXT_LENGTHS.map(l => {
        const isCurrent = sectionLengths[key] === l.key
        // Stesso limite di Impostazioni (components/profilo/SectionGuida.tsx) — il tetto vale
        // sull'intera sectionLengths condivisa, non solo sulle sezioni di questa generazione,
        // perché "Genera il resto della guida" può richiederle tutte insieme in una sola chiamata.
        const atLimit = l.key === 'molto_approfondita' && !isCurrent && moltoCount >= MAX_MOLTO_APPROFONDITA_SECTIONS
        return (
          <button
            key={l.key}
            type="button"
            onClick={() => setSectionLengths(prev => ({ ...prev, [key]: l.key }))}
            disabled={atLimit}
            title={atLimit ? `Massimo ${MAX_MOLTO_APPROFONDITA_SECTIONS} sezioni in "Molto approfondita" — riduci un'altra sezione prima` : l.description}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isCurrent ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-100'
            }`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
    )
  }

  const hasGuide  = guideText.trim().length > 50
  const hikeTitle = hike.title
  const categoryBadge = (hike.tags?.[0] ?? hike.assessment?.difficulty ?? 'Escursione').toUpperCase()
  // Qualunque sezione ancora senza testo AI può mostrare l'invito ad "Approfondisci con Giulia" —
  // SectionCard mostra comunque il bottone solo se !hasBody.
  const showApprofondisciHint = hasGuide && !generating
  // Sezioni fisse ancora senza testo — pilota sia il bottone "Genera il resto della guida" (mostrato
  // solo se ce n'è almeno una) sia il calcolo di cosa chiedere quando viene premuto.
  const missingSectionKeys = useMemo(
    () => displaySections.filter((s): s is DisplaySection & { guideKey: GuideSectionKey } => s.guideKey != null && !s.body?.trim()).map(s => s.guideKey),
    [displaySections],
  )

  // Galleria fotografica — fonte principale: le thumbnail degli articoli Wikipedia dei luoghi
  // lungo il percorso (già scaricate durante l'arricchimento del percorso, prima ancora che la
  // guida esista — vedi lib/wikipedia.ts's WikiPage.thumbnail), quindi disponibili a costo zero e
  // indipendenti da quante fonti la ricerca web di sicurezza cita. Deliberatamente disaccoppiata
  // da quella ricerca (max_uses:2, mirata solo a condizioni/sicurezza, vedi SYSTEM_RESEARCH in
  // app/api/guide/route.ts) — prima la galleria dipendeva SOLO dalle foto trovate tra le fonti
  // citate lì, quindi poteva restare vuota quando quella ricerca non trovava nulla da segnalare.
  const poiPhotos = useMemo(() => {
    const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
    const seen = new Set<string>()
    return wiki
      .filter(({ wiki: w }) => !!w.thumbnail && !seen.has(w.thumbnail) && seen.add(w.thumbnail))
      .slice(0, 12)
      .map(({ wiki: w }) => ({ url: w.url, imageUrl: w.thumbnail!, title: w.title }))
  }, [hike.cachedPoiWiki])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fdfcfa' }}>

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
      />

      <PhotoMosaic
        photos={routePhotos.slice(0, 4).map((url, i) => ({ id: String(i), url }))}
        heightClass="h-32"
      />

      {/* ── Section nav (mobile: sticky pill bar / md+: sidebar) + reading column ────────── */}
      <div className="md:px-8 md:max-w-[1180px] md:mx-auto">
        <div className="md:grid md:grid-cols-[auto_1fr] md:gap-8 md:items-start md:pt-6">
          <SectionNav
            sections={displaySections.map(s => ({ key: s.key, title: s.title, icon: s.icon, color: s.color }))}
            activeIndex={visibleSec}
            onSelect={scrollToSection}
          />

          <div className="min-w-0 px-4 sm:px-6 md:px-0 md:max-w-3xl lg:max-w-[52rem]">

            {/* ── Genera il resto della guida in un'unica chiamata ────────────── */}
            {hasGuide && !generating && generatingSections.length === 0 && missingSectionKeys.length > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl bg-terra-50 border border-terra-200">
                <div className="flex items-start gap-3 min-w-0">
                  <Sparkles className="w-4 h-4 text-terra-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-stone-800">
                      {missingSectionKeys.length === 1 ? 'Manca ancora una sezione' : `Mancano ancora ${missingSectionKeys.length} sezioni`}
                    </p>
                    <p className="text-[11.5px] text-stone-500 leading-snug">
                      Generarle tutte insieme in un&apos;unica richiesta è più efficiente che una alla volta
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => generateSections(missingSectionKeys)}
                  className="w-full sm:w-auto shrink-0 px-4 py-2 rounded-full bg-terra-600 hover:bg-terra-700 text-white text-[12.5px] font-semibold transition-colors"
                >
                  Genera il resto con Giulia (AI)
                </button>
              </div>
            )}

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

            {/* ── AI temporaneamente non verificabile (es. blackout Supabase) ─── */}
            {!hasGuide && hasAiAccess === false && aiUnavailable && (
              <div className="flex flex-col items-center py-10 gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center shadow-inner">
                  <Loader2 className="w-6 h-6 text-terra-500" />
                </div>
                <div className="max-w-sm">
                  <h2 className="font-display text-lg font-bold text-stone-800 mb-2">
                    Racconto di Giulia temporaneamente non disponibile
                  </h2>
                  <p className="text-stone-500 text-sm leading-relaxed">
                    Non riusciamo a verificare la tua chiave AI in questo momento — riprova tra poco.
                    Intanto qui sotto trovi comunque mappa, profilo, punteggi e punti di interesse del percorso.
                  </p>
                </div>
              </div>
            )}

            {/* ── No AI access ─────────────────────────────────────────────── */}
            {!hasGuide && hasAiAccess === false && !aiUnavailable && (
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

            {/* ── Guide sections — always rendered (widgets), text where available ────────── */}
            <div className="mt-4">
              {displaySections.map((s, i) => {
                // Ogni sezione può essere approfondita singolarmente (app/api/guide/route.ts,
                // sections) — a differenza di "Genera il resto della guida" che le chiede tutte
                // insieme. Solo per le sezioni fisse (s.guideKey), non per quelle "legacy".
                const canApprofondisciSection = showApprofondisciHint && s.guideKey != null && generatingSections.length === 0
                return (
                  <SectionCard
                    key={s.key}
                    ref={el => { sectionRefs.current[i] = el }}
                    title={s.title}
                    subtitle={s.subtitle}
                    icon={s.icon}
                    color={s.color}
                    body={s.body}
                    widget={renderWidget(s.key)}
                    sectionPhoto={routePhotos[i]}
                    twoColumns
                    isVoiceActive={activeSection === i && (isPlaying || isPaused)}
                    onSpeak={() => speakSection(i)}
                    showApprofondisciHint={canApprofondisciSection}
                    onApprofondisci={canApprofondisciSection ? () => generateSections([s.guideKey!]) : undefined}
                    approfondendo={generatingSections.includes(s.guideKey as GuideSectionKey)}
                    // "Verificato online" non passa mai dal meccanismo delle lunghezze (è generata
                    // da una chiamata AI dedicata alla sola ricerca web, indipendente da
                    // sectionLengths — vedi SECTION_LENGTH_BY_LEVEL in app/api/guide/route.ts):
                    // mostrare il selettore lì sarebbe un controllo che sembra fare qualcosa ma non
                    // ha alcun effetto.
                    lengthSelector={canApprofondisciSection && s.guideKey !== 'verificato' ? renderLengthSelector(s.guideKey!) : undefined}
                  />
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

            {hasGuide && !generating && (poiPhotos.length > 0 || guideSources.some(s => s.imageUrl)) && (
              <div className="mt-4 mb-1">
                <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-stone-400 mb-2">
                  Galleria fotografica
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
                  {poiPhotos.map((p, i) => (
                    <a
                      key={`poi-${i}`}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-52 rounded-2xl overflow-hidden border border-stone-200 group"
                      style={{ scrollSnapAlign: 'start' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto hotlinkata da Wikipedia, mai copiata sui nostri server */}
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-52 h-36 object-cover group-hover:opacity-90 transition-opacity"
                        loading="lazy"
                        onError={e => { (e.currentTarget.closest('a') as HTMLElement | null)?.style.setProperty('display', 'none') }}
                      />
                      <p className="px-2.5 py-1.5 text-[10px] text-stone-400 bg-stone-50 truncate">
                        Luogo: {p.title}
                      </p>
                    </a>
                  ))}
                  {guideSources.filter(s => s.imageUrl).map((s, i) => (
                    <a
                      key={`src-${i}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-52 rounded-2xl overflow-hidden border border-stone-200 group"
                      style={{ scrollSnapAlign: 'start' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto hotlinkata dalla fonte, mai copiata sui nostri server */}
                      <img
                        src={s.imageUrl}
                        alt={s.title}
                        className="w-52 h-36 object-cover group-hover:opacity-90 transition-opacity"
                        loading="lazy"
                        onError={e => { (e.currentTarget.closest('a') as HTMLElement | null)?.style.setProperty('display', 'none') }}
                      />
                      <p className="px-2.5 py-1.5 text-[10px] text-stone-400 bg-stone-50 truncate">
                        Fonte: {s.title}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {hasGuide && !generating && hasAiAccess === true && (
              <GuideQA
                hikeId={hike.id}
                hikeFallback={{
                  title:                hike.title,
                  distanceMeters:       hike.distanceMeters,
                  elevationGain:        hike.elevationGain,
                  estimatedTimeSeconds: hike.estimatedTimeSeconds,
                  assessment:           hike.assessment,
                  cachedPois:           hike.cachedPois,
                  cachedPoiWiki:        hike.cachedPoiWiki,
                  cachedGuide:          guideText,
                }}
              />
            )}

            {/* ── Bottom actions ──────────────────────────────────────────── */}
            {hasGuide && !generating && (
              <div className="mt-8 mb-6 pt-5 space-y-3" style={{ borderTop: '1px solid #dcd8cc' }}>
                {!('speechSynthesis' in (typeof window !== 'undefined' ? window : {})) && (
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                    <span className="flex items-center gap-1 text-xs text-stone-400">
                      <VolumeX className="w-3.5 h-3.5" /> Voce non supportata
                    </span>
                  </div>
                )}

                {/* Azioni principali — impilate a piena larghezza su mobile, affiancate da sm in
                    su, sempre come coppia coerente invece di andare a capo l'una senza l'altra. */}
                <div className="flex flex-col sm:flex-row sm:justify-end gap-2.5">
                  <button onClick={exportPdf} disabled={exportingPdf}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white rounded-full text-sm font-semibold transition-all shadow-sm"
                  >
                    {exportingPdf
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileDown className="w-3.5 h-3.5" />}
                    {exportingPdf ? 'Genero PDF…' : 'Scarica PDF'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {aiCreditError && (
        <CreditErrorModal message={aiCreditError.message} onClose={() => setAiCreditError(null)} />
      )}
    </div>
  )
}
