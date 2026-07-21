'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { ctsLabel, type TrailScoreResult } from '@/lib/trailScore'
import { computeDEP, depLabel, type findSimilarActivities } from '@/lib/stats'
import {
  parseSections, markdownToSections, sectionsToMarkdown, SCAFFOLD_SECTIONS,
  type ReportSection, type ReportAuthoredBy, type HikeReport,
} from '@/lib/reportStore'
import { getReport, saveReportContent, cacheReport } from '@/lib/sync/hikeReportStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { getQuestionnaire } from '@/lib/questionnaireStore'
import { extractLeadSubtitle } from '@/lib/extractLeadSubtitle'
import { computeMaterialScore } from '@/lib/materialScore'
import SectionNav from '@/components/editorial/SectionNav'
import SectionCard from '@/components/editorial/SectionCard'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { RatingGaugeBadge } from '@/components/resoconto/RatingGaugeBadge'
import Kicker from '@/components/ui/Kicker'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import RouteMapSection from '@/components/RouteMapSection'
import WeatherWidget from '@/components/WeatherWidget'
import PoiListWidget from '@/components/guida/widgets/PoiListWidget'
import NaturaWidget from '@/components/guida/widgets/NaturaWidget'
import RouteTimeline from '@/app/components/RouteTimeline'
import ManualEditor from '@/app/components/ManualEditor'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'
import { PhotoGallery } from '@/app/resoconto/[id]/PhotoGallery'
import { PhotoLightbox } from '@/app/resoconto/[id]/PhotoLightbox'
import { PrintPhotoGrid } from '@/app/resoconto/[id]/PrintPhotoGrid'
import { HiddenPdfRoot } from '@/app/resoconto/[id]/HiddenPdfRoot'
import ReportHero from './ReportHero'
import ReportStatsStrip from './ReportStatsStrip'
import PhotoShowcase from './PhotoShowcase'
import PhotoMapSection from './PhotoMapSection'
import StickyRouteMap from './StickyRouteMap'
import { pickBestCoverPhoto } from '@/lib/activityPhotos'
import { REPORT_SECTION_STYLE, REPORT_SECTION_TITLE, narrativeStyleFor, type ReportFixedSectionKey } from './sectionStyle'
import {
  Pencil, Loader2, Images, BookOpen, Share2, Copy, Link2Off, ExternalLink,
  Compass, Layers, RefreshCw, Heart, Zap, Flame,
} from 'lucide-react'

/** Distribuisce le foto tra i capitoli narrativi in base alla loro progressione lungo il
 *  percorso (0..1) — ogni capitolo riceve le foto scattate durante la sua "fetta" di cammino,
 *  invece del vecchio abbinamento a un solo titolo fisso ('Il percorso'/'Cronaca'/…, vedi
 *  app/resoconto/[id]/sectionPhotoSlot.ts, ancora usato dal solo export PDF che non passa da
 *  qui) — funziona con qualunque numero/titolo di capitoli scriva Giulia. */
function bucketPhotosByChapter(photos: RoutePhoto[], chapterCount: number): RoutePhoto[][] {
  if (chapterCount === 0) return []
  const buckets: RoutePhoto[][] = Array.from({ length: chapterCount }, () => [])
  const sorted = [...photos].sort((a, b) => a.progress - b.progress)
  for (const p of sorted) {
    const idx = Math.min(chapterCount - 1, Math.floor(p.progress * chapterCount))
    buckets[idx].push(p)
  }
  return buckets
}

/** Frase a effetto da mostrare in grande, stile rivista, a metà lettura — preferisce un
 *  [curiosita] già scritto da Giulia (già pensato per stupire), altrimenti la frase più lunga
 *  (ma non un intero paragrafo) tra tutti i capitoli. */
function extractPullQuote(sections: { title: string; body: string }[]): string | null {
  for (const s of sections) {
    const m = s.body.match(/\[curiosita\]([\s\S]*?)\[\/curiosita\]/)
    if (m) {
      const text = m[1].trim().replace(/\s+/g, ' ')
      if (text.length > 20 && text.length < 240) return text
    }
  }
  let best: string | null = null
  for (const s of sections) {
    const plain = s.body.replace(/\[(curiosita|avviso)\][\s\S]*?\[\/\1\]/g, ' ').replace(/^###\s.*$/gm, ' ')
    const sentences = plain.split(/(?<=[.!?])\s+/).map(t => t.trim()).filter(t => t.length > 40 && t.length < 200)
    for (const sent of sentences) {
      if (!best || sent.length > best.length) best = sent
    }
  }
  return best
}

type ResocontoLength = 'breve' | 'media' | 'lunga'

interface DisplaySection {
  key: string
  title: string
  icon: ReactNode
  color: string
  narrativeIndex?: number
}

export interface DataSectionBundle {
  ctsResult: TrailScoreResult | null
  ctsComputing: boolean
  onComputeCts: () => void
  dtmProfile?: TrailDtmProfile
  showGradient: boolean
  showAspect: boolean
  onToggleGradient: () => void
  onToggleAspect: () => void
  similarActivities: ReturnType<typeof findSimilarActivities>
  onOpenSimilar: (id: string) => void
}

export interface NaturaBundle {
  hasGps: boolean
  flora: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

interface Props {
  activity: StoredActivity
  photos: RoutePhoto[]
  photosError: boolean
  onRetryPhotos: () => void
  onPhotosChange: (photos: RoutePhoto[]) => void
  coverPhotoId: string | null
  onOpenCoverPicker: () => void
  pois: PoiItem[]
  poisLoaded: boolean
  driving?: { distanceMeters: number; mapsUrl?: string } | null
  weatherIcon?: { emoji: string; label: string } | null
  data: DataSectionBundle
  natura: NaturaBundle
  onOpenMap3D: () => void
  onOpenVideoWizard: () => void
  scrollToSectionKey?: ReportFixedSectionKey | null
  onScrollToSectionConsumed?: () => void
}

/**
 * Lettore "magazine" del resoconto — stessa impaginazione del lettore di Guida
 * (components/guida/GuideReader.tsx): hero, striscia di cifre, sommario ad ancore + colonna di
 * lettura con una SectionCard per capitolo. A differenza di Guida i capitoli del racconto non
 * sono a chiave fissa (li scrive Giulia o l'utente con titoli liberi) — solo le quattro sezioni
 * "dati" (Dati e punteggi/Andamento/Natura/Punti di interesse) sono fisse e sempre presenti,
 * indipendentemente dal racconto, sullo stesso principio per cui in Guida ogni widget resta
 * raggiungibile anche senza testo AI.
 */
export default function ReportReader({
  activity, photos, photosError, onRetryPhotos, onPhotosChange, coverPhotoId, onOpenCoverPicker,
  pois, poisLoaded, driving, weatherIcon, data, natura, onOpenMap3D, onOpenVideoWizard,
  scrollToSectionKey, onScrollToSectionConsumed,
}: Props) {
  const router = useRouter()
  const id = activity.id

  const [report,      setReport]      = useState<HikeReport | null>(null)
  const [content,     setContent]     = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [length,      setLength]      = useState<ResocontoLength>('media')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  const [showPublish,   setShowPublish]   = useState(false)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'none' | 'in_progress' | 'completed' | 'skipped'>('none')
  const [questionnaireCounts, setQuestionnaireCounts] = useState({ answered: 0, total: 0 })
  const [writingStyleReady, setWritingStyleReady] = useState(false)
  const [editorMode,       setEditorMode]       = useState<'view' | 'manual'>('view')
  const [showAiPanel,      setShowAiPanel]      = useState(true)
  const [reportSections,   setReportSections]   = useState<ReportSection[]>([])
  const [reportAuthoredBy, setReportAuthoredBy] = useState<ReportAuthoredBy>('ai')
  const [visibleSec,   setVisibleSec]   = useState(0)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  // Elementi "di passaggio" tra due SectionCard (es. la citazione a effetto) che non hanno una
  // voce propria nel sommario ma vanno comunque osservati: senza questo, scorrendo sopra la
  // citazione l'IntersectionObserver non intercetta nessun elemento tracciato e il sommario resta
  // "congelato" sulla sezione precedente invece di aggiornarsi.
  const gapRefs = useRef<{ node: HTMLElement; idx: number }[]>([])

  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)

  // ── Load report + questionnaire status ───────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getReport(id).catch(() => null),
      getQuestionnaire(id).catch(() => null),
    ]).then(([rep, questionnaire]) => {
      if (cancelled) return
      if (rep) {
        setReport(rep)
        setContent(rep.content ?? '')
        if (Array.isArray(rep.sections) && rep.sections.length > 0) setReportSections(rep.sections)
        setReportAuthoredBy(rep.authored_by ?? 'ai')
        if (rep.content) setShowAiPanel(false)
      } else {
        setReport(null); setContent(''); setReportSections([]); setReportAuthoredBy('ai'); setShowAiPanel(true)
      }
      setQuestionnaireStatus(questionnaire?.status ?? 'none')
      const answered = questionnaire
        ? Object.values(questionnaire.answers).filter(a => !a.skipped && a.text?.trim()).length
        : 0
      setQuestionnaireCounts({ answered, total: questionnaire?.questions.length ?? 0 })
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  // Badge "nel tuo stile" — pronto quando il profilo di scrittura (lib/writingStyleProfile.ts) ha
  // abbastanza risposte al questionario da essere un segnale affidabile. A livello utente, non di
  // singola attività: nessuna dipendenza da `id`.
  useEffect(() => {
    let cancelled = false
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => { if (!cancelled) setWritingStyleReady(!!d.writingStyleReady) })
      .catch(() => null)
    return () => { cancelled = true }
  }, [])

  // getReport() above only reads the local cache once on mount; a newer version fetched by
  // lib/sync/pullEngine.ts's background revalidation (e.g. a regeneration done on another device)
  // lands in IndexedDB and fires this event, but without listening for it here this already-open
  // reader kept showing whatever it first rendered — indistinguishable from the update having been
  // lost, until the page was manually reloaded. getReport() itself is cache-first and cheap here:
  // by the time this fires the newer copy is already in IndexedDB, so this just re-reads it.
  useCtsUpdated(() => {
    getReport(id).then(rep => {
      if (!rep) return
      setReport(rep)
      setContent(rep.content ?? '')
      if (Array.isArray(rep.sections) && rep.sections.length > 0) setReportSections(rep.sections)
      setReportAuthoredBy(rep.authored_by ?? 'ai')
    }).catch(() => {})
  })

  // Load existing PDF share link
  useEffect(() => {
    let cancelled = false
    setSharePdfUrl(null)
    fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.share_pdf_url) setSharePdfUrl(d.share_pdf_url) })
      .catch(() => null)
    return () => { cancelled = true }
  }, [id])

  // POI Wikipedia entries (galleria luoghi) — come in Guida, per nome specifico
  useEffect(() => {
    setPoiWikiEntries([])
    if (pois.length === 0) return
    let cancelled = false
    fetchWikiForNamedPois(pois).then(entries => { if (!cancelled) setPoiWikiEntries(entries) }).catch(() => {})
    return () => { cancelled = true }
  }, [pois])

  const saveSections = useCallback(async (sections: ReportSection[], authoredBy: ReportAuthoredBy) => {
    const newContent = sectionsToMarkdown(sections)
    await saveReportContent(id, newContent, sections, authoredBy)
    setReportSections(sections)
    setReportAuthoredBy(authoredBy)
    setContent(newContent)
    setReport(prev => prev ? { ...prev, updated_at: new Date().toISOString() } : prev)
  }, [id])

  const generateReport = useCallback(async () => {
    setGenerating(true)
    setContent('')
    setApiError(null)
    const photoMeta = photos.map(p => ({ caption: p.caption, lat: p.lat, lon: p.lon, progress: p.progress, hasExifGps: p.hasExifGps, url: p.url }))

    try {
      const full = await streamFetchText('/api/resoconto', { activityId: id, length, photos: photoMeta }, setContent)
      const now = new Date().toISOString()
      const generated: HikeReport = {
        id: `report-${id}`,
        activity_id: id,
        title: activity.title ?? 'Escursione',
        content: full,
        photos: photoMeta.map(({ caption, lat, lon, progress }) => ({ caption, lat, lon, progress })),
        authored_by: 'ai',
        sections: null,
        created_at: now,
        updated_at: now,
      }
      await cacheReport(id, generated)
      setReport(generated)
    } catch (e) {
      if (e instanceof StreamFetchError) {
        if (e.status === 402) setApiError('Aggiungi la tua chiave API Claude nelle impostazioni per usare questa funzione.')
        else setApiError((e.body as { message?: string }).message ?? 'Errore durante la generazione.')
      } else {
        setApiError('Errore di rete. Riprova.')
      }
    } finally {
      setGenerating(false)
    }
  }, [activity.title, id, length, photos])

  // ── Narrative chapters + fixed data sections ─────────────────────────────
  const sections = useMemo(() => parseSections(content), [content])

  // "Galleria fotografica" resta sempre presente (come le altre sezioni fisse) anche senza foto:
  // è l'unico punto da cui caricarle (vedi ActivityPhotoManager dentro il suo widget), quindi
  // nasconderla in assenza di foto renderebbe impossibile aggiungerne la prima.
  const displaySections = useMemo<DisplaySection[]>(() => {
    const narrative: DisplaySection[] = sections.map((s, i) => ({
      key: `narrative-${i}`, title: s.title, narrativeIndex: i, ...narrativeStyleFor(i),
    }))
    const fixed: DisplaySection[] = (Object.keys(REPORT_SECTION_STYLE) as ReportFixedSectionKey[]).map(k => ({
      key: k, title: REPORT_SECTION_TITLE[k], ...REPORT_SECTION_STYLE[k],
    }))
    return [...narrative, ...fixed]
  }, [sections])

  // Foto di ogni capitolo — se il racconto ha una struttura editata a mano (reportSections, in
  // sync 1:1 con i capitoli attuali) si usa la scelta esplicita dell'utente (foto principale +
  // extra, vedi SectionEditor.tsx); altrimenti (racconto solo generato dall'AI, mai passato
  // dall'editor strutturato) si ricade sulla distribuzione automatica per progressione lungo il
  // percorso — vedi bucketPhotosByChapter più sopra.
  const photoBuckets = useMemo(() => {
    const manual = [...reportSections].sort((a, b) => a.order - b.order)
    if (manual.length > 0 && manual.length === sections.length) {
      return manual.map(s => {
        const ids = [s.photoId, ...(s.extraPhotoIds ?? [])].filter((id): id is string => !!id)
        return ids.map(id => photos.find(p => p.id === id)).filter((p): p is RoutePhoto => !!p)
      })
    }
    return bucketPhotosByChapter(photos, sections.length)
  }, [photos, sections.length, reportSections])

  // Posizione lungo il percorso (0..1) di ogni voce del sommario — solo i capitoli narrativi ne
  // hanno una (si presume distribuiti uniformemente lungo il cammino); le sezioni dati fisse
  // restano `null` (non legate a un punto preciso) — usata dalla mini-mappa sticky in
  // components/resoconto/StickyRouteMap.tsx.
  const sectionProgress = useMemo(
    () => displaySections.map(s => s.narrativeIndex != null ? s.narrativeIndex / Math.max(sections.length - 1, 1) : null),
    [displaySections, sections.length],
  )

  // Frase a effetto mostrata a metà lettura — solo se il racconto ha abbastanza capitoli da
  // giustificare un'interruzione editoriale.
  const pullQuote = useMemo(() => sections.length >= 3 ? extractPullQuote(sections) : null, [sections])
  const pullQuoteAfterNarrativeIndex = Math.floor((sections.length - 1) / 2)

  const readingMinutes = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length
    return words > 0 ? Math.max(1, Math.round(words / 200)) : undefined
  }, [content])

  useEffect(() => {
    if (!displaySections.length) return
    const state = new Map<number, boolean>()
    const resolveIdx = (target: HTMLElement) => {
      const direct = sectionRefs.current.indexOf(target)
      if (direct >= 0) return direct
      return gapRefs.current.find(g => g.node === target)?.idx ?? -1
    }
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const idx = resolveIdx(e.target as HTMLElement)
          if (idx >= 0) state.set(idx, e.isIntersecting)
        }
        const activeIdxs = Array.from(state.entries()).filter(([, v]) => v).map(([k]) => k)
        if (activeIdxs.length > 0) setVisibleSec(Math.max(...activeIdxs))
      },
      { threshold: 0, rootMargin: '-96px 0px -70% 0px' },
    )
    sectionRefs.current.forEach(el => el && obs.observe(el))
    gapRefs.current.forEach(g => obs.observe(g.node))
    return () => obs.disconnect()
  }, [displaySections])

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!scrollToSectionKey) return
    const idx = displaySections.findIndex(s => s.key === scrollToSectionKey)
    if (idx >= 0) scrollToSection(idx)
    onScrollToSectionConsumed?.()
  }, [scrollToSectionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const autoHeroPhoto = useMemo(() => pickBestCoverPhoto(photos), [photos])
  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? autoHeroPhoto ?? null

  // Foto del carosello hero — la copertina (scelta o automatica) sempre per prima, poi le altre
  // più "descrittive" (didascalia più lunga), fino a 4.
  const heroCarouselPhotos = useMemo(() => {
    if (!heroPhoto) return []
    const rest = photos
      .filter(p => p.id !== heroPhoto.id)
      .sort((a, b) => (b.caption?.trim().length ?? 0) - (a.caption?.trim().length ?? 0))
    return [heroPhoto, ...rest].slice(0, 4).map(p => ({ id: p.id, url: p.url }))
  }, [photos, heroPhoto])

  // Mosaico "protagonista" — le foto restanti, senza ripetere quelle già nel carosello hero. Solo
  // 4 (1 grande + 3 piccole): di più affollava la colonna dei piccoli riquadri su desktop.
  const showcasePhotos = useMemo(() => {
    const heroIds = new Set(heroCarouselPhotos.map(p => p.id))
    return photos.filter(p => !heroIds.has(p.id)).slice(0, 4)
  }, [photos, heroCarouselPhotos])

  const openLightboxById = (photoId: string) => {
    const idx = photos.findIndex(p => p.id === photoId)
    if (idx >= 0) setLightboxIndex(idx)
  }

  // Quanto materiale reale c'è per un resoconto ricco — mostrato prima di generare, mai un vincolo.
  const materialScore = useMemo(() => computeMaterialScore({
    photoCount:            photos.length,
    positionedPhotoCount:  photos.filter(p => p.hasExifGps || p.progress !== 0.5).length,
    questionnaireStatus,
    questionnaireAnswered: questionnaireCounts.answered,
    questionnaireTotal:    questionnaireCounts.total,
    hasUserNotes:          !!activity.userNotes?.trim(),
    hasWeather:            !!activity.weatherAtHike,
    hasGuideOrPoi:         !!activity.linkedPlannedId || pois.length > 0,
  }), [photos, questionnaireStatus, questionnaireCounts, activity.userNotes, activity.weatherAtHike, activity.linkedPlannedId, pois.length])

  const materialBadge = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-display font-bold uppercase tracking-wide ${
        materialScore.label === 'ottimo' ? 'bg-forest-50 text-forest-700'
        : materialScore.label === 'buono' ? 'bg-amber-50 text-amber-700'
        : 'bg-stone-100 text-stone-500'
      }`}>
        {materialScore.score}% materiale {materialScore.label}
      </span>
      {writingStyleReady && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-display font-bold uppercase tracking-wide bg-forest-50 text-forest-700">
          Stile riconosciuto
        </span>
      )}
      {materialScore.suggestion && (
        <span className="text-xs text-stone-400 italic">{materialScore.suggestion}</span>
      )}
    </div>
  )

  const hasContent = content.trim().length > 0
  const categoryBadge = (activity.tags?.[0] ?? activity.sport ?? 'Escursione').toUpperCase()
  const gpsPoints = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const hasGps = gpsPoints.length > 0
  const dateISO = activity.startTime.slice(0, 10)

  const publishPdf = async () => {
    setPublishing(true); setPublishError(null)
    try {
      const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
      const sb = getBrowserSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Non autenticato')

      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
      const printRoot = document.getElementById('resoconto-print-root')
      if (!printRoot) throw new Error('Layout non trovato')

      const host = document.createElement('div')
      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'
      const clone = printRoot.cloneNode(true) as HTMLElement
      clone.style.cssText = 'width:794px;background:#fff;font-family:Georgia,serif'
      host.appendChild(clone)
      document.body.appendChild(host)
      await nextLayout()

      let blob: Blob
      try {
        blob = await paginateToPdf([clone])
      } finally {
        document.body.removeChild(host)
      }

      const { uploadReportPdf } = await import('@/lib/pdfUpload')
      const url = await uploadReportPdf(user.id, id, blob)

      await fetch('/api/share-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: id, sharePdfUrl: url }),
      })
      setSharePdfUrl(url)
    } catch (e) {
      setPublishError(String(e))
    } finally {
      setPublishing(false)
    }
  }

  const unpublishPdf = async () => {
    await fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setSharePdfUrl(null)
  }

  // ── Widget per le sezioni dati fisse ──────────────────────────────────────
  function renderFixedWidget(key: ReportFixedSectionKey): ReactNode {
    switch (key) {
      case 'dati_punteggi': {
        const hasHR  = (activity.avgHeartRate ?? 0) > 0
        const hasCal = (activity.calories ?? 0) > 0
        const hasNetSpeed = (activity.netSpeedMs ?? 0) > 0 && (activity.pauseTimeSeconds ?? 0) > 0
        const hasIev = (activity.iev ?? 0) > 0
        const dep = computeDEP(activity.distanceMeters, activity.elevationGain)
        const ts = data.ctsResult?.ts ?? activity.trailScore
        const scoreLabel = ts != null ? (data.ctsResult ?? ctsLabel(ts)).label : undefined
        const rated = (activity.userRating ?? 0) > 0
        return (
          <div className="space-y-5">
            {rated && (
              <div className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 px-5 py-6 flex flex-col sm:flex-row items-center gap-4">
                <RatingGaugeBadge value={activity.userRating!} size={96} />
                {activity.userRatingNote && (
                  <p className="flex-1 min-w-0 text-white/85 text-sm italic leading-relaxed text-center sm:text-left">
                    “{activity.userRatingNote}”
                  </p>
                )}
              </div>
            )}
            {ts != null ? (
              <>
                {/* Stessa impaginazione della "Punteggio complessivo" di Guida
                    (components/guida/widgets/ScoresWidget.tsx): card scura + badge grande. Un solo
                    anello (safety=null) perché qui c'è un solo dato da mostrare, non due. */}
                <div className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 px-5 py-7 flex flex-col items-center gap-2">
                  <Kicker className="text-stone-400">Punteggio complessivo</Kicker>
                  <TrailScoreGaugeBadge total={Math.round(ts)} safety={null} showLabel={false} size={128} />
                  {scoreLabel && (
                    <p className="text-white text-[11px] sm:text-xs font-bold uppercase tracking-wide" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
                      {scoreLabel}
                    </p>
                  )}
                </div>
                <ComfortTrailScoreWidget result={data.ctsResult} cached={activity.trailScore} beautyScore={activity.linkedBeautyScore} />
              </>
            ) : (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 border border-stone-200 px-5 py-4">
                <p className="text-sm text-stone-500">Il punteggio non è ancora stato calcolato.</p>
                <button onClick={data.onComputeCts} disabled={data.ctsComputing} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-500 hover:bg-forest-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                  {data.ctsComputing ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>}
                </button>
              </div>
            )}

            {hasGps && data.dtmProfile?.source === 'dtm' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={data.onToggleAspect} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${data.showAspect ? 'bg-forest-500 text-white border-forest-500' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                  <Compass className="w-3 h-3" /> Esposizione
                </button>
                {activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
                  <button onClick={data.onToggleGradient} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${data.showGradient ? 'bg-forest-500 text-white border-forest-500' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                    <Layers className="w-3 h-3" /> Pendenza
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {hasHR && <StatCard label="FC Media" value={`${activity.avgHeartRate} bpm`} sub={`Max ${activity.maxHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5" />} />}
              <StatCard label="Vel. Media" value={`${msToKmh(activity.avgSpeedMs)} km/h`} sub={`Max ${msToKmh(activity.maxSpeedMs)} km/h`} color="blue" icon={<Zap className="w-3.5 h-3.5" />} />
              {hasNetSpeed && <StatCard label="Vel. Crociera" value={`${msToKmh(activity.netSpeedMs!)} km/h`} sub={`Pause ${formatDuration(activity.pauseTimeSeconds!)}`} color="blue" />}
              {hasCal && <StatCard label="Calorie" value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />}
              <StatCard label="DEP" value={`${dep.toFixed(1)} km`} sub={depLabel(dep)} color="stone" />
              {hasIev && <StatCard label="Efficienza verticale" value={`${activity.iev!.toFixed(0)} m/min`} color="forest" />}
            </div>

            <dl className="rounded-2xl bg-stone-50 border border-stone-200 p-4 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                ['Passo medio', formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
                ['Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`],
                ['Quota minima', `${activity.altitudeMin.toFixed(1)} m`],
                ['Quota massima', `${activity.altitudeMax.toFixed(1)} m`],
                ['Trackpoint', activity.trackPoints.length.toLocaleString('it')],
                ['Sport', activity.sport],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-stone-100 py-1">
                  <dt className="text-stone-400 text-xs">{k}</dt>
                  <dd className="font-mono text-xs font-medium text-stone-800">{v}</dd>
                </div>
              ))}
            </dl>

            {hasGps && dateISO && <WeatherWidget mode="historical" lat={gpsPoints[Math.floor(gpsPoints.length / 2)].lat!} lon={gpsPoints[Math.floor(gpsPoints.length / 2)].lon!} date={dateISO} />}

            {data.similarActivities.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-stone-800">Percorsi simili</p>
                <div className="rounded-2xl bg-stone-50 border border-stone-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {data.similarActivities.slice(0, 5).map(({ activity: a, startDistanceM }) => (
                        <tr key={a.id} className="border-t border-stone-100 first:border-t-0 hover:bg-stone-100 cursor-pointer" onClick={() => data.onOpenSimilar(a.id)}>
                          <td className="px-3 py-2 text-stone-800">{new Date(a.startTime).toLocaleDateString('it-IT')}</td>
                          <td className="px-3 py-2 text-stone-800">{(a.distanceMeters / 1000).toFixed(1)} km</td>
                          <td className="px-3 py-2 text-stone-400">{startDistanceM < 50 ? 'stesso punto' : `${startDistanceM.toFixed(0)} m`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      }
      case 'andamento':
        return (
          <div className="space-y-5">
            {hasGps && activity.trackPoints.length ? (
              <RouteMapSection
                trackPoints={activity.trackPoints}
                showPois={false}
                onOpenMap3D={onOpenMap3D}
                showGradient={data.showGradient}
                showAspect={data.showAspect}
                dtmProfile={data.dtmProfile}
              />
            ) : (
              <p className="text-sm italic text-center py-8 text-stone-400">Profilo altimetrico non disponibile senza un tracciato GPS.</p>
            )}
            {activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0) && (
              <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
            )}
            <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
            {photos.length > 0 && <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />}
          </div>
        )
      case 'natura':
        return <NaturaWidget {...natura} />
      case 'poi':
        return (
          <PoiListWidget
            pois={pois}
            poiWikiEntries={poiWikiEntries}
            hasGps={hasGps}
            centerLat={gpsPoints[Math.floor(gpsPoints.length / 2)]?.lat}
            centerLon={gpsPoints[Math.floor(gpsPoints.length / 2)]?.lon}
            onWikiLoaded={() => {}}
            highlightedPoiId={highlightedPoiId}
            onItemTap={poi => setHighlightedPoiId(poi.id)}
            trackPoints={activity.trackPoints}
            onOpenMap3D={onOpenMap3D}
          />
        )
      case 'galleria_foto':
        return (
          <div className="space-y-6">
            {hasGps && (
              <PhotoMapSection trackPoints={activity.trackPoints} photos={photos} onPhotoTap={openLightboxById} onOpenMap3D={onOpenMap3D} />
            )}
            {photos.length > 0 && (
              <>
                <PhotoGallery photos={photos} onPhotoClick={photo => openLightboxById(photo.id)} />
                <PrintPhotoGrid photos={photos} />
              </>
            )}
            <ActivityPhotoManager
              activityId={activity.id}
              trackPoints={activity.trackPoints}
              photos={photos}
              onPhotosChange={onPhotosChange}
            />
          </div>
        )
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
      <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento resoconto…</span>
    </div>
  )

  return (
    <div style={{ background: '#fdfcfa' }}>

      <ReportHero
        trackPoints={activity.trackPoints}
        title={activity.title ?? activity.notes ?? 'Escursione'}
        categoryBadge={categoryBadge}
        startTime={activity.startTime}
        heroPhotos={heroCarouselPhotos}
        driving={driving}
        weatherIcon={weatherIcon}
        readingMinutes={hasContent ? readingMinutes : undefined}
      />

      <ReportStatsStrip
        distanceKm={activity.distanceMeters / 1000}
        elevationGain={activity.elevationGain}
        durationLabel={formatDuration(activity.totalTimeSeconds)}
        fourth={
          (activity.calories ?? 0) > 0 ? { value: `${activity.calories} kcal`, label: 'Calorie' }
          : (activity.avgHeartRate ?? 0) > 0 ? { value: `${activity.avgHeartRate} bpm`, label: 'FC media' }
          : undefined
        }
      />

      <PhotoShowcase photos={showcasePhotos} onPhotoClick={openLightboxById} />

      {photosError && (
        <div className="px-4 pt-4">
          <button onClick={onRetryPhotos} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-500">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Impossibile caricare le foto — riprova
          </button>
        </div>
      )}

      <div className="md:px-8 md:max-w-[1180px] md:mx-auto">
        <div className="md:grid md:grid-cols-[auto_1fr] md:gap-8 md:items-start md:pt-6">
          {editorMode !== 'manual' && (
            <SectionNav
              sections={displaySections.map(s => ({ key: s.key, title: s.title, icon: s.icon, color: s.color }))}
              activeIndex={visibleSec}
              onSelect={scrollToSection}
              stickyExtra={hasGps ? <StickyRouteMap trackPoints={activity.trackPoints} progress={sectionProgress[visibleSec] ?? null} /> : undefined}
            />
          )}

          <div className={`min-w-0 px-4 sm:px-6 md:px-0 ${editorMode === 'manual' ? 'md:col-span-2' : 'md:max-w-3xl lg:max-w-[52rem]'}`}>

            {editorMode === 'manual' ? (
              <ManualEditor
                activityId={id}
                activity={activity}
                photos={photos}
                onPhotosChange={onPhotosChange}
                initialSections={reportSections.length > 0 ? reportSections : SCAFFOLD_SECTIONS}
                initialAuthoredBy={reportAuthoredBy}
                onSave={saveSections}
                onCancel={() => setEditorMode('view')}
              />
            ) : (
              <>
                {/* ── AI generation panel ─────────────────────────────────── */}
                {hasContent && (
                  <button onClick={() => setShowAiPanel(s => !s)}
                    className="flex items-center gap-1.5 mt-4 mb-1 text-xs font-display font-bold uppercase tracking-wide text-stone-500 hover:text-stone-700 transition-colors print:hidden">
                    Genera / rigenera con AI {showAiPanel ? '▲' : '▼'}
                  </button>
                )}
                {(hasContent ? showAiPanel : true) && (
                  <div className={`${hasContent ? 'mb-6' : 'mt-4 mb-6'} print:hidden`}>
                    {hasContent ? (
                      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div>
                            <p className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm mb-1">Genera nuovo resoconto</p>
                            {materialBadge}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-xl overflow-hidden border border-stone-200">
                              {(['breve', 'media', 'lunga'] as const).map(l => (
                                <button key={l} onClick={() => setLength(l)}
                                  className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            <button onClick={onOpenMap3D} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                              <Images className="w-3.5 h-3.5" /> Mappa 3D
                            </button>
                            <button onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}/racconta`)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                              {questionnaireStatus === 'in_progress' ? 'Riprendi il racconto guidato' : 'Racconta il tuo percorso'}
                            </button>
                            <button onClick={generateReport} disabled={generating}
                              className="flex items-center gap-2 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
                              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</> : <><BookOpen className="w-4 h-4" /> Genera</>}
                            </button>
                          </div>
                        </div>
                        {apiError && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{apiError}</div>}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col items-start">
                          <Pencil className="w-10 h-10 text-stone-400 mb-3" />
                          <p className="font-display font-bold uppercase tracking-wide text-stone-700 mb-2">Scrivi tu</p>
                          <p className="text-sm text-stone-500 italic mb-4">
                            Costruisci il resoconto sezione per sezione, con le tue parole. Puoi richiedere aiuto all&apos;AI su singoli paragrafi e associare le tue foto.
                          </p>
                          <button
                            onClick={() => { setReportSections(SCAFFOLD_SECTIONS); setReportAuthoredBy('manual'); setEditorMode('manual') }}
                            className="mt-auto flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
                            Inizia a scrivere
                          </button>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col items-start">
                          <BookOpen className="w-10 h-10 text-forest-400 mb-3" />
                          <p className="font-display font-bold uppercase tracking-wide text-stone-700 mb-2">Genera con AI</p>
                          <p className="text-sm text-stone-500 italic mb-2">L&apos;AI scrive un reportage giornalistico completo basato sui tuoi dati GPS, biometrici e foto.</p>
                          <div className="mb-4">{materialBadge}</div>
                          <div className="flex items-center gap-2 mt-auto flex-wrap">
                            <div className="flex rounded-xl overflow-hidden border border-stone-200">
                              {(['breve', 'media', 'lunga'] as const).map(l => (
                                <button key={l} onClick={() => setLength(l)}
                                  className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            <button onClick={generateReport} disabled={generating}
                              className="flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
                              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</> : <><BookOpen className="w-4 h-4" /> Genera</>}
                            </button>
                          </div>
                          {apiError && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 w-full">{apiError}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Streaming indicator (prima che si veda una sezione) ──── */}
                {generating && sections.length === 0 && (
                  <div className="flex items-center gap-3 py-8 text-stone-500">
                    <Loader2 className="w-5 h-5 animate-spin text-forest-500" />
                    <span className="italic text-sm">Giulia sta scrivendo il tuo resoconto…</span>
                  </div>
                )}
                {generating && sections.length === 0 && content && (
                  <div className="bg-white rounded-2xl shadow-sm p-6">
                    <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{content}</p>
                  </div>
                )}

                {/* ── Passa all'editor strutturato ─────────────────────────── */}
                {hasContent && (
                  <div className="flex items-center justify-between mb-3 mt-2 print:hidden">
                    <div className="flex items-center gap-2">
                      {report?.updated_at && <span className="text-xs italic text-stone-400">Salvato {new Date(report.updated_at).toLocaleString('it-IT')}</span>}
                    </div>
                    <button
                      onClick={() => {
                        if (reportSections.length === 0) { setReportSections(markdownToSections(content)); setReportAuthoredBy(reportAuthoredBy === 'ai' ? 'mixed' : reportAuthoredBy) }
                        setEditorMode('manual')
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Editor strutturato
                    </button>
                  </div>
                )}

                {/* ── Capitoli del racconto + sezioni dati (sempre presenti) ── */}
                <div className="mt-2">
                    {(gapRefs.current = []) && null}
                    {displaySections.map((s, i) => {
                      if (s.narrativeIndex != null) {
                        const section = sections[s.narrativeIndex]
                        const bucket = photoBuckets[s.narrativeIndex] ?? []
                        const primary = bucket[0]
                        const primaryIdx = primary ? photos.findIndex(p => p.id === primary.id) : -1
                        const extraPhotos = bucket.slice(1).map(p => ({ url: p.url, caption: p.caption }))
                        return (
                          <Fragment key={s.key}>
                            <SectionCard
                              ref={el => { sectionRefs.current[i] = el }}
                              title={s.title}
                              icon={s.icon}
                              color={s.color}
                              body={section.body}
                              sectionPhoto={primary?.url}
                              photoCaption={primary ? `${primaryIdx + 1}. ${primary.caption}` : undefined}
                              photoIndexBadge={primary ? primaryIdx + 1 : undefined}
                              extraPhotos={extraPhotos}
                              collapsible
                              twoColumns
                            />
                            {pullQuote && s.narrativeIndex === pullQuoteAfterNarrativeIndex && (
                              <blockquote
                                ref={el => { if (el) gapRefs.current.push({ node: el, idx: i }) }}
                                className="my-6 px-2 sm:px-8 text-center">
                                <p className="font-display italic text-[22px] sm:text-[28px] leading-snug text-stone-700">
                                  “{pullQuote}”
                                </p>
                              </blockquote>
                            )}
                          </Fragment>
                        )
                      }
                      return (
                        <SectionCard
                          key={s.key}
                          ref={el => { sectionRefs.current[i] = el }}
                          title={s.title}
                          icon={s.icon}
                          color={s.color}
                          widget={renderFixedWidget(s.key as ReportFixedSectionKey)}
                        />
                      )
                    })}
                  </div>

                {/* ── Pubblica PDF ──────────────────────────────────────────── */}
                {hasContent && (
                  <div className="mt-8 mb-6 pt-5 print:hidden" style={{ borderTop: '1px solid #dcd8cc' }}>
                    <button onClick={() => setShowPublish(s => !s)}
                      className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-stone-500 hover:text-stone-700 transition-colors">
                      <Share2 className="w-3.5 h-3.5" /> Pubblica PDF {showPublish ? '▲' : '▼'}
                    </button>
                    {showPublish && (
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        {sharePdfUrl ? (
                          <>
                            <a href={`/leggi/r/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-display font-bold uppercase tracking-wide transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                            </a>
                            <button
                              onClick={async () => {
                                const viewerUrl = `${window.location.origin}/leggi/r/${encodeURIComponent(id)}`
                                await navigator.clipboard.writeText(viewerUrl)
                                setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                              <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                            </button>
                            <a href={sharePdfUrl} target="_blank" rel="noopener noreferrer" download
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-display font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" /> PDF diretto
                            </a>
                            <button onClick={unpublishPdf}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-display font-bold uppercase tracking-wide hover:bg-red-50 transition-colors">
                              <Link2Off className="w-3.5 h-3.5" /> Disattiva
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-stone-500 italic">Genera un PDF con le foto e pubblicalo online.</p>
                            {publishError && <p className="text-xs text-red-500">{publishError}</p>}
                            <button disabled={publishing} onClick={publishPdf}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                              {publishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</> : <><Share2 className="w-3.5 h-3.5" /> Genera e pubblica</>}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {hasContent && (
        <HiddenPdfRoot activity={activity} heroPhoto={heroPhoto} dateStr={format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })} sections={sections} photos={photos} />
      )}

      {lightboxIndex != null && (
        <PhotoLightbox photos={photos} index={lightboxIndex} onNavigate={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  )
}
