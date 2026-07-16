'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
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
import type { TrailScoreResult } from '@/lib/trailScore'
import { computeDEP, depLabel, type findSimilarActivities } from '@/lib/stats'
import {
  parseSections, markdownToSections, sectionsToMarkdown, SCAFFOLD_SECTIONS,
  type ReportSection, type ReportAuthoredBy, type HikeReport,
} from '@/lib/reportStore'
import { getReport, saveReportContent, cacheReport } from '@/lib/sync/hikeReportStore'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { getQuestionnaire } from '@/lib/questionnaireStore'
import { extractLeadSubtitle } from '@/lib/extractLeadSubtitle'
import PhotoMosaic from '@/components/PhotoMosaic'
import SectionNav from '@/components/editorial/SectionNav'
import SectionCard from '@/components/editorial/SectionCard'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import RouteMapSection from '@/components/RouteMapSection'
import WeatherWidget from '@/components/WeatherWidget'
import PoiListWidget from '@/components/guida/widgets/PoiListWidget'
import NaturaWidget from '@/components/guida/widgets/NaturaWidget'
import RouteTimeline from '@/app/components/RouteTimeline'
import ManualEditor from '@/app/components/ManualEditor'
import { PhotoGallery } from '@/app/resoconto/[id]/PhotoGallery'
import { PhotoLightbox } from '@/app/resoconto/[id]/PhotoLightbox'
import { PrintPhotoGrid } from '@/app/resoconto/[id]/PrintPhotoGrid'
import { HiddenPdfRoot } from '@/app/resoconto/[id]/HiddenPdfRoot'
import { slotFor } from '@/app/resoconto/[id]/sectionPhotoSlot'
import ReportHero from './ReportHero'
import ReportStatsStrip from './ReportStatsStrip'
import { REPORT_SECTION_STYLE, REPORT_SECTION_TITLE, narrativeStyleFor, type ReportFixedSectionKey } from './sectionStyle'
import {
  Pencil, Check, Loader2, Images, BookOpen, Share2, Copy, Link2Off, ExternalLink,
  Compass, Layers, RefreshCw, Heart, Zap, Flame,
} from 'lucide-react'

const RoutePhotoMap = dynamic(() => import('@/app/components/RoutePhotoMap'), { ssr: false })

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
  pois, poisLoaded, driving, data, natura, onOpenMap3D, onOpenVideoWizard,
  scrollToSectionKey, onScrollToSectionConsumed,
}: Props) {
  const router = useRouter()
  const id = activity.id

  const [report,      setReport]      = useState<HikeReport | null>(null)
  const [content,     setContent]     = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [isEditing,   setIsEditing]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)
  const [length,      setLength]      = useState<ResocontoLength>('media')
  const [lightbox,    setLightbox]    = useState<RoutePhoto | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  const [showPublish,   setShowPublish]   = useState(false)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'none' | 'in_progress' | 'completed' | 'skipped'>('none')
  const [editorMode,       setEditorMode]       = useState<'view' | 'manual'>('view')
  const [showAiPanel,      setShowAiPanel]      = useState(true)
  const [reportSections,   setReportSections]   = useState<ReportSection[]>([])
  const [reportAuthoredBy, setReportAuthoredBy] = useState<ReportAuthoredBy>('ai')
  const [visibleSec,   setVisibleSec]   = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

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
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

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

  // Auto-save debounce when editing raw markdown
  useEffect(() => {
    if (!isEditing || !content || generating) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveContent(content) }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isEditing, generating])

  const saveContent = useCallback(async (text: string) => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await saveReportContent(id, text)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [id])

  const saveSections = useCallback(async (sections: ReportSection[], authoredBy: ReportAuthoredBy) => {
    const newContent = sectionsToMarkdown(sections)
    await saveReportContent(id, newContent, sections, authoredBy)
    setReportSections(sections)
    setReportAuthoredBy(authoredBy)
    setContent(newContent)
  }, [id])

  const generateReport = useCallback(async () => {
    setGenerating(true)
    setContent('')
    setApiError(null)
    const photoMeta = photos.map(p => ({ caption: p.caption, lat: p.lat, lon: p.lon, progress: p.progress, hasExifGps: p.hasExifGps }))

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

  const displaySections = useMemo<DisplaySection[]>(() => {
    const narrative: DisplaySection[] = sections.map((s, i) => ({
      key: `narrative-${i}`, title: s.title, narrativeIndex: i, ...narrativeStyleFor(i),
    }))
    const fixed: DisplaySection[] = (Object.keys(REPORT_SECTION_STYLE) as ReportFixedSectionKey[]).map(k => ({
      key: k, title: REPORT_SECTION_TITLE[k], ...REPORT_SECTION_STYLE[k],
    }))
    return [...narrative, ...fixed]
  }, [sections])

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

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!scrollToSectionKey) return
    const idx = displaySections.findIndex(s => s.key === scrollToSectionKey)
    if (idx >= 0) scrollToSection(idx)
    onScrollToSectionConsumed?.()
  }, [scrollToSectionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mini-mappa con i pin foto — ancorata al capitolo il cui slot foto è 0 (di norma "Il percorso",
  // il primo), esattamente come nella vecchia app/resoconto/[id]/ReportSections.tsx.
  const miniMapNode = activity.trackPoints.length > 4 ? (
    <div className="float-right ml-5 mb-4 w-52 shrink-0 hidden md:block print:block" style={{ columnSpan: 'none' as const }}>
      <div className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden shadow-sm">
        <RoutePhotoMap trackPoints={activity.trackPoints} photos={photos} height="170px" />
        {photos.length > 0 && (
          <div className="px-2 pt-1 pb-2 space-y-0.5">
            {photos.slice(0, 7).map((ph, i) => (
              <div key={ph.id} className="flex items-center gap-1.5">
                <span className="w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shrink-0 font-display">{i + 1}</span>
                <span className="font-body text-[9px] text-stone-500 truncate">{ph.caption}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null

  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null
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
        return (
          <div className="space-y-5">
            {(data.ctsResult || activity.trailScore != null) ? (
              <ComfortTrailScoreWidget result={data.ctsResult} cached={activity.trailScore} beautyScore={activity.linkedBeautyScore} defaultOpen />
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
                pois={pois}
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
        heroPhotoUrl={heroPhoto?.url}
        driving={driving}
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

      {photos.length >= 2 && (
        <PhotoMosaic
          photos={photos.slice(1, 5).map(ph => ({ id: ph.id, url: ph.url, alt: ph.caption }))}
          onPhotoClick={photoId => { const ph = photos.find(p => p.id === photoId); if (ph) setLightbox(ph) }}
        />
      )}

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
            />
          )}

          <div className="min-w-0 px-4 sm:px-6 md:px-0 md:max-w-3xl lg:max-w-[52rem]">

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
                saving={saving}
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
                            <p className="text-xs text-stone-400 italic">
                              {photos.length > 0 ? `${photos.length} foto disponibili · L'AI userà le tue immagini` : 'Aggiungi foto dalla mappa 3D per un resoconto più ricco'}
                            </p>
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
                          <p className="text-sm text-stone-500 italic mb-4">L&apos;AI scrive un reportage giornalistico completo basato sui tuoi dati GPS, biometrici e foto.</p>
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

                {/* ── Edit/view toggle + raw markdown editor ───────────────── */}
                {hasContent && (
                  <div className="flex items-center justify-between mb-3 mt-2 print:hidden">
                    <div className="flex items-center gap-2">
                      {report?.updated_at && <span className="text-xs italic text-stone-400">Salvato {new Date(report.updated_at).toLocaleString('it-IT')}</span>}
                      {saving && <span className="flex items-center gap-1 text-xs italic text-stone-400"><Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…</span>}
                      {saveOk && <span className="flex items-center gap-1 text-xs text-forest-600"><Check className="w-3 h-3" /> Salvato</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (reportSections.length === 0) { setReportSections(markdownToSections(content)); setReportAuthoredBy(reportAuthoredBy === 'ai' ? 'mixed' : reportAuthoredBy) }
                          setEditorMode('manual')
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> Editor strutturato
                      </button>
                      <button
                        onClick={() => { if (isEditing) { saveContent(content); setIsEditing(false) } else setIsEditing(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                        {isEditing ? <><Check className="w-3.5 h-3.5" /> Fatto</> : <><Pencil className="w-3.5 h-3.5" /> Modifica</>}
                      </button>
                    </div>
                  </div>
                )}
                {isEditing && (
                  <textarea value={content} onChange={e => setContent(e.target.value)} rows={30}
                    className="w-full bg-white border border-stone-200 rounded-2xl p-5 font-mono text-sm text-stone-700 leading-relaxed outline-none focus:border-forest-400 resize-y shadow-sm mb-6"
                    placeholder="Scrivi il resoconto in Markdown…" />
                )}

                {/* ── Capitoli del racconto + sezioni dati (sempre presenti) ── */}
                {!isEditing && (
                  <div className="mt-2">
                    {displaySections.map((s, i) => {
                      if (s.narrativeIndex != null) {
                        const section = sections[s.narrativeIndex]
                        const slot = slotFor(section.title, s.narrativeIndex)
                        const photo = slot === 0 ? undefined : photos[slot]
                        return (
                          <SectionCard
                            key={s.key}
                            ref={el => { sectionRefs.current[i] = el }}
                            title={s.title}
                            icon={s.icon}
                            color={s.color}
                            body={section.body}
                            sectionPhoto={photo?.url}
                            photoCaption={photo ? `${slot + 1}. ${photo.caption}` : undefined}
                            photoIndexBadge={photo ? slot + 1 : undefined}
                            extraFloatNode={slot === 0 ? miniMapNode : undefined}
                            twoColumns
                          />
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
                )}

                {hasContent && !isEditing && photos.length > 0 && (
                  <PhotoGallery photos={photos} onPhotoClick={setLightbox} />
                )}
                {hasContent && !isEditing && photos.length > 0 && (
                  <PrintPhotoGrid photos={photos} />
                )}

                {/* ── Pubblica PDF ──────────────────────────────────────────── */}
                {hasContent && !isEditing && (
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

      {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
