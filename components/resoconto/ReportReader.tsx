'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailScoreResult } from '@/lib/trailScore'
import type { findSimilarActivities } from '@/lib/stats'
import {
  parseSections, markdownToSections, sectionsToMarkdown, SCAFFOLD_SECTIONS,
  type ReportSection, type ReportAuthoredBy, type HikeReport,
} from '@/lib/reportStore'
import { getReport, saveReportContent, cacheReport } from '@/lib/sync/hikeReportStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { getQuestionnaire } from '@/lib/questionnaireStore'
import { getPlannedById } from '@/lib/plannedStore'
import { extractLeadSubtitle } from '@/lib/extractLeadSubtitle'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
// Estratta in lib/photoBuckets.ts quando è servita anche alla pagina pubblica del Diario:
// la stessa logica in due copie è ciò che in questo progetto ha già prodotto divergenze silenziose.
import { bucketPhotosByChapter } from '@/lib/photoBuckets'
import { computeMaterialScore } from '@/lib/materialScore'
import SectionNav from '@/components/editorial/SectionNav'
import SectionCard from '@/components/editorial/SectionCard'
import NextStepBanner from '@/components/resoconto/NextStepBanner'
import ManualEditor from '@/app/components/ManualEditor'
import { PhotoLightbox } from '@/app/resoconto/[id]/PhotoLightbox'
// Import dinamico: il modulo si porta dietro il template del PDF, `react-dom/client` e jsPDF/
// html2canvas per via delle sue dipendenze. Statico finiva nel bundle di /resoconto — la rotta più
// pesante dell'app — anche per chi apre un resoconto senza mai esportarlo.
import ReportHero from './ReportHero'
import ReportStatsStrip from './ReportStatsStrip'
import PhotoShowcase from './PhotoShowcase'
import StickyRouteMap from './StickyRouteMap'
import { pickBestCoverPhoto } from '@/lib/activityPhotos'
import type { ReportFixedSectionKey } from './sectionStyle'
import { buildReportDisplaySections, renderReportFixedWidget, type DisplaySection } from '@/lib/resoconto/reportDisplaySections'
import {
  Pencil, Loader2, BookOpen, Share2, Copy, Link2Off, ExternalLink, RefreshCw, Download,
} from 'lucide-react'

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
  trackPoints: TrackPoint[]
  /** 1-12 — mese dell'uscita, per la query stagionale GBIF. */
  month: number
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
  const searchParams = useSearchParams()
  const id = activity.id

  const [report,      setReport]      = useState<HikeReport | null>(null)
  const [content,     setContent]     = useState('')
  const [generating,  setGenerating]  = useState(false)
  // Persistita per-attività: la scelta sopravvive al giro di andata/ritorno dal questionario
  // guidato (/racconta), che rimonta questa pagina da zero al rientro.
  const [length,      setLength]      = useState<ResocontoLength>(() => {
    if (typeof window === 'undefined') return 'media'
    const saved = window.localStorage.getItem(`dtrek:resoconto-length:${activity.id}`)
    return saved === 'breve' || saved === 'media' || saved === 'lunga' ? saved : 'media'
  })
  const setLengthPersisted = useCallback((l: ResocontoLength) => {
    setLength(l)
    window.localStorage.setItem(`dtrek:resoconto-length:${id}`, l)
  }, [id])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  // DTREK-AUDIT.md P2 #32 — token opaco per il link pubblico, non l'activityId in chiaro.
  const [shareToken,    setShareToken]    = useState<string | null>(null)
  const [showPublish,   setShowPublish]   = useState(false)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'none' | 'in_progress' | 'completed' | 'skipped'>('none')
  const [questionnaireCounts, setQuestionnaireCounts] = useState({ answered: 0, total: 0 })
  const [writingStyleReady, setWritingStyleReady] = useState(false)
  // Rotta della lettura "a libro" a pagine (.../reportage/[id]/sezione/1) — esiste solo se questa
  // attività è collegata a una Meta che appartiene già a un Diario (ristrutturazione Diario/Mete:
  // succede sempre per un Reportage nato dopo, dato che ActivityUploader.tsx scrive diaryId sulla
  // Meta proprio alla creazione del Reportage). Un Reportage antecedente ai Diari, o non collegato
  // a nessuna Meta, non ha una lettura "a libro" da offrire: resta solo questa vista.
  const [bookHref, setBookHref] = useState<string | null>(null)
  useEffect(() => {
    setBookHref(null)
    const percorsoId = activity.linkedPlannedId
    if (!percorsoId) return
    let cancelled = false
    getPlannedById(percorsoId).then(hike => {
      if (cancelled || !hike?.diaryId) return
      setBookHref(`/diari/${encodeURIComponent(hike.diaryId)}/percorsi/${encodeURIComponent(percorsoId)}/reportage/${encodeURIComponent(id)}/sezione/1`)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [activity.linkedPlannedId, id])
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
    setShareToken(null)
    fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.share_pdf_url) setSharePdfUrl(d.share_pdf_url)
        if (d.share_token) setShareToken(d.share_token)
      })
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

  // Ritorno dal questionario guidato (/racconta) con risposte già pronte (o già saltate): genera
  // subito invece di lasciare all'utente un secondo click "Genera" separato — vedi
  // app/resoconto/[id]/racconta/page.tsx (handleSkipAll/handleAdvance/goToResoconto).
  useEffect(() => {
    if (loading || searchParams.get('generate') !== '1') return
    router.replace(`/resoconto/${encodeURIComponent(id)}`)
    generateReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams])

  // ── Narrative chapters + fixed data sections ─────────────────────────────
  const sections = useMemo(() => parseSections(content), [content])

  // "Galleria fotografica" resta sempre presente (come le altre sezioni fisse) anche senza foto:
  // è l'unico punto da cui caricarle (vedi ActivityPhotoManager dentro il suo widget), quindi
  // nasconderla in assenza di foto renderebbe impossibile aggiungerne la prima.
  const displaySections = useMemo<DisplaySection[]>(() => buildReportDisplaySections(content), [content])

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

  // Un solo pulsante d'azione per la generazione, mai due in competizione: se il questionario è
  // già completato o saltato le risposte (o l'assenza di risposte) sono definitive, quindi genera
  // subito; altrimenti porta al racconto guidato, dove saltare genera comunque subito da lì.
  const questionnaireLocked = questionnaireStatus === 'completed' || questionnaireStatus === 'skipped'
  const primaryAction = questionnaireLocked
    ? { label: hasContent ? 'Rigenera' : 'Genera', onClick: generateReport, Icon: BookOpen }
    : {
        label: questionnaireStatus === 'in_progress' ? 'Riprendi il racconto guidato' : 'Racconta il tuo percorso',
        onClick: () => router.push(`/resoconto/${encodeURIComponent(id)}/racconta`),
        Icon: Pencil,
      }
  const primaryActionButton = (
    <button onClick={primaryAction.onClick} disabled={generating}
      className="flex items-center gap-2 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
      {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</> : <><primaryAction.Icon className="w-4 h-4" /> {primaryAction.label}</>}
    </button>
  )

  const categoryBadge = (activity.tags?.[0] ?? activity.sport ?? 'Escursione').toUpperCase()
  const gpsPoints = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const hasGps = gpsPoints.length > 0
  const dateISO = activity.startTime.slice(0, 10)

  // Stessi dati per la pubblicazione e per lo scarico locale — un solo motore (renderReportPdf.ts,
  // che monta HiddenPdfRoot fuori schermo solo per il tempo della cattura), non più due documenti
  // diversi per lo stesso resoconto.
  const reportPdfParams = () => ({
    activity, heroPhoto,
    dateStr: format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }),
    sections, photos, poiWikiEntries,
  })

  const publishPdf = async () => {
    setPublishing(true); setPublishError(null)
    try {
      const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
      const sb = getBrowserSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Non autenticato')

      const { renderReportPdfBlob } = await import('@/app/resoconto/[id]/renderReportPdf')
      const blob = await renderReportPdfBlob(reportPdfParams())

      // getSession() (a differenza di getUser()) rinfresca proattivamente un token vicino alla
      // scadenza. La generazione appena finita può richiedere diversi secondi su un resoconto
      // lungo: se nel frattempo il token è scaduto, la chiamata di rete dello Storage qui sotto lo
      // userebbe comunque e verrebbe rifiutata dall'RLS con un errore generico invece che di
      // autenticazione (stesso difetto già corretto in lib/activityPhotos.ts).
      await sb.auth.getSession()
      const { uploadReportPdf } = await import('@/lib/pdfUpload')
      const url = await uploadReportPdf(user.id, id, blob)

      const res = await fetch('/api/share-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: id, sharePdfUrl: url }),
      })
      const d = await res.json().catch(() => null)
      setSharePdfUrl(url)
      if (d?.share_token) setShareToken(d.share_token)
    } catch (e) {
      setPublishError(String(e))
    } finally {
      setPublishing(false)
    }
  }

  const downloadPdf = async () => {
    setDownloadingPdf(true); setPublishError(null)
    try {
      const { downloadReportPdf } = await import('@/app/resoconto/[id]/renderReportPdf')
      await downloadReportPdf(reportPdfParams())
    } catch (e) {
      setPublishError(String(e))
    } finally {
      setDownloadingPdf(false)
    }
  }

  const unpublishPdf = async () => {
    await fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setSharePdfUrl(null)
    setShareToken(null)
  }

  // ── Widget per le sezioni dati fisse ──────────────────────────────────────
  // Dispatcher estratto in lib/resoconto/reportDisplaySections.tsx (renderReportFixedWidget) —
  // stessa identica logica, condivisa con le nuove pagine "a libro" del Diario; qui resta solo il
  // passaggio delle variabili di chiusura come props esplicite.
  function renderFixedWidget(key: ReportFixedSectionKey) {
    return renderReportFixedWidget(key, {
      activity, data, natura, hasGps, gpsPoints, dateISO, onOpenMap3D, pois, poiWikiEntries,
      highlightedPoiId, onPoiTap: poiId => setHighlightedPoiId(prev => prev === poiId ? null : poiId),
      photos, onPhotoTap: openLightboxById, onPhotosChange,
    })
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
                            <p className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm mb-2">Rigenera il resoconto</p>
                            {materialBadge}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-xl overflow-hidden border border-stone-200">
                              {(['breve', 'media', 'lunga'] as const).map(l => (
                                <button key={l} onClick={() => setLengthPersisted(l)}
                                  className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            {primaryActionButton}
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
                                <button key={l} onClick={() => setLengthPersisted(l)}
                                  className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            {primaryActionButton}
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

                {/* ── Passa all'editor strutturato / apri lettura a libro ──── */}
                {hasContent && (
                  <div className="flex items-center justify-between mb-3 mt-2 print:hidden flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {report?.updated_at && <span className="text-xs italic text-stone-400">Salvato {new Date(report.updated_at).toLocaleString('it-IT')}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {bookHref && (
                        <button
                          onClick={() => router.push(bookHref)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                          <BookOpen className="w-3.5 h-3.5" /> Lettura a libro
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (reportSections.length === 0) { setReportSections(markdownToSections(content)); setReportAuthoredBy(reportAuthoredBy === 'ai' ? 'mixed' : reportAuthoredBy) }
                          setEditorMode('manual')
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> Modifica
                      </button>
                    </div>
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

                {/* UX-AUDIT.md P-O1/P-O2 — al termine del racconto/dati, invece di lasciare
                    l'utente a un vicolo cieco: invito a pianificare la prossima uscita, più
                    l'eventuale sblocco di nuovi badge (entrambi print:hidden, non hanno senso in
                    un PDF/racconto stampato). */}
                <div className="mt-6 print:hidden">
                  <NextStepBanner />
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
                            {/* DTREK-AUDIT.md P2 #32 — link per token opaco, non per activityId in
                                chiaro; /leggi/r resta solo come fallback per il breve intervallo
                                prima che il token arrivi dal PATCH/GET. */}
                            <a href={shareToken ? `/leggi/p/${encodeURIComponent(shareToken)}` : `/leggi/r/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-display font-bold uppercase tracking-wide transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                            </a>
                            <button
                              onClick={async () => {
                                const viewerPath = shareToken ? `/leggi/p/${encodeURIComponent(shareToken)}` : `/leggi/r/${encodeURIComponent(id)}`
                                const viewerUrl = `${window.location.origin}${viewerPath}`
                                await navigator.clipboard.writeText(viewerUrl)
                                setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                              <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                            </button>
                            <a href={withForcedDownload(sharePdfUrl)} target="_blank" rel="noopener noreferrer" download
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
                            <p className="text-xs text-stone-500 italic">Genera un PDF con le foto e pubblicalo online, oppure scaricalo senza pubblicarlo.</p>
                            {publishError && <p className="text-xs text-red-500">{publishError}</p>}
                            <button disabled={publishing} onClick={publishPdf}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                              {publishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</> : <><Share2 className="w-3.5 h-3.5" /> Genera e pubblica</>}
                            </button>
                            <button disabled={downloadingPdf} onClick={downloadPdf}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-xs font-display font-bold uppercase tracking-wide hover:bg-stone-50 disabled:opacity-50 transition-colors">
                              {downloadingPdf ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</> : <><Download className="w-3.5 h-3.5" /> Scarica PDF</>}
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

      {lightboxIndex != null && (
        <PhotoLightbox photos={photos} index={lightboxIndex} onNavigate={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  )
}
