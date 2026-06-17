'use client'
import {
  useEffect, useState, useMemo, useCallback, useRef, type ReactNode,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import DiarioSidebar from '@/components/DiarioSidebar'
import AltimetryChart from '@/components/AltimetryChart'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import RouteThumb from '@/components/RouteThumb'
import StatCard from '@/components/StatCard'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import ShareModal from '@/components/ShareModal'
import PdfExportButton from '@/components/PdfExportButton'
import {
  getActivityById, updateActivityMeta, deleteActivity,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, ctsLabel, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { formatDuration, msToKmh, formatPace, type TrackPoint } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { type PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import type { CtsConfidence } from '@/lib/trailScore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, FileSpreadsheet, FileText, Map as MapIcon,
  Heart, Zap, Mountain, Clock, Route, Flame,
  Pencil, Check, X, Trash2, Loader2, Share2, Layers, Star, Box, Images, RefreshCw,
  BookOpen, FileDown, Copy, Link2Off, ExternalLink, PenLine, ChevronDown, ChevronUp, Camera,
} from 'lucide-react'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const ActivityPhotoManager = dynamic(() => import('@/app/components/ActivityPhotoManager'), { ssr: false })
const RoutePhotoMap   = dynamic(() => import('@/app/components/RoutePhotoMap'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface RoutePhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

interface HikeReport {
  id: string
  activity_id: string
  title: string
  content: string
  photos: { caption: string; lat?: number; lon?: number; progress: number }[]
  created_at: string
  updated_at: string
}

type ResocontoLength = 'breve' | 'media' | 'lunga'

interface Section {
  title: string
  body: string
}

// ── Markdown helpers ──────────────────────────────────────────────────────────

function parseSections(md: string): Section[] {
  const parts = md.split(/\n(?=## )/)
  return parts
    .map(part => {
      const nl = part.indexOf('\n')
      if (!part.startsWith('## ') || nl === -1) return null
      return { title: part.slice(3, nl).trim(), body: part.slice(nl + 1).trim() }
    })
    .filter((s): s is Section => s !== null)
}

function RenderBody({ text }: { text: string }) {
  const parts = text.split(/(\[curiosita\][\s\S]*?\[\/curiosita\])/g)
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const m = part.match(/^\[curiosita\]([\s\S]*?)\[\/curiosita\]$/)
        if (m) {
          return (
            <blockquote key={i}
              className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r-xl font-display text-sm italic text-stone-700 leading-relaxed">
              {m[1].trim()}
            </blockquote>
          )
        }
        return part.trim()
          ? <div key={i} className="space-y-2.5">
              {part.trim().split(/\n\n+/).map((p, j) => (
                <p key={j} className="font-display text-[15px] leading-[1.8] text-stone-700">{p.trim()}</p>
              ))}
            </div>
          : null
      })}
    </div>
  )
}

// ── Elevation timeline ────────────────────────────────────────────────────────

function RouteTimeline({ trackPoints, photos }: { trackPoints: TrackPoint[]; photos: RoutePhoto[] }) {
  const pts = trackPoints.filter(p => p.altitudeMeters !== undefined && p.lat && p.lon)
  if (pts.length < 4) return null

  const W = 1000, H = 100
  const alts   = pts.map(p => p.altitudeMeters!)
  const minAlt = Math.min(...alts)
  const maxAlt = Math.max(...alts)
  const range  = maxAlt - minAlt || 1
  const toY    = (alt: number) => H - 4 - ((alt - minAlt) / range) * (H - 12)
  const pathD  = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = toY(p.altitudeMeters!)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const sorted = [...photos].sort((a, b) => a.progress - b.progress)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 72 }}>
        <defs>
          <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40916c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#40916c" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${W} ${H} L 0 ${H} Z`} fill="url(#altGrad)" />
        <path d={pathD} fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round" />
        {sorted.map(ph => {
          const x   = ph.progress * W
          const idx = Math.round(ph.progress * (pts.length - 1))
          const pt  = pts[Math.min(idx, pts.length - 1)]
          const y   = toY(pt.altitudeMeters!)
          return (
            <g key={ph.id}>
              <line x1={x} y1={y - 2} x2={x} y2={H} stroke="#b5a48a" strokeWidth="1" strokeDasharray="3 2" />
              <circle cx={x} cy={y - 2} r={5} fill="white" stroke="#2d6a4f" strokeWidth="2" />
            </g>
          )
        })}
      </svg>
      {sorted.length > 0 && (
        <div className="relative mt-1" style={{ height: 88 }}>
          {sorted.map((ph, i) => (
            <div key={ph.id} className="absolute -translate-x-1/2 top-0 flex flex-col items-center"
              style={{ left: `${ph.progress * 100}%` }}>
              <div className="relative">
                <img src={ph.dataUrl} alt={ph.caption}
                  className="w-14 h-14 object-cover rounded-lg shadow border-2 border-white" />
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center font-body">
                  {i + 1}
                </span>
              </div>
              <p className="text-[8px] text-stone-500 font-display mt-0.5 max-w-[60px] text-center leading-tight">{ph.caption}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[9px] text-stone-400 font-mono">↑ {Math.round(minAlt)} m</span>
        <span className="text-[9px] text-stone-400 font-mono">{Math.round(maxAlt)} m ↑</span>
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

const SECTION_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc']

function SectionCard({
  section, index, photo, photoIndex, floatNode,
}: {
  section: Section
  index: number
  photo?: RoutePhoto
  photoIndex?: number
  floatNode?: ReactNode
}) {
  const color = SECTION_COLORS[index % SECTION_COLORS.length]
  return (
    <article className="bg-white rounded-2xl shadow-sm overflow-hidden mb-5 print:rounded-none print:shadow-none print:mb-0 print:border-b print:border-stone-200">
      <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: color }}>
        <span className="font-body text-[11px] font-bold tracking-[2px] uppercase text-white/70">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="font-body text-lg font-bold tracking-wide uppercase text-white leading-tight">
          {section.title}
        </h2>
      </div>
      <div className="p-6 print-columns-2">
        {floatNode}
        {photo && (
          <div className="float-right ml-5 mb-3 w-44 print:w-40 print:ml-4 shrink-0 hidden md:block print:block">
            <div className="relative">
              {photoIndex !== undefined && (
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-body z-10">
                  {photoIndex}
                </span>
              )}
              <img src={photo.dataUrl} alt={photo.caption}
                className="w-full aspect-[4/3] object-cover rounded-xl shadow-md print:rounded-lg" />
            </div>
            {photo.caption && (
              <p className="font-display text-[10px] italic text-stone-400 mt-1 text-center leading-snug">
                {photoIndex !== undefined ? `${photoIndex}. ` : ''}{photo.caption}
              </p>
            )}
          </div>
        )}
        <RenderBody text={section.body} />
      </div>
    </article>
  )
}

// ── Rating helpers ────────────────────────────────────────────────────────────

function ratingColor(n: number) {
  return n >= 9 ? '#16a34a' : n >= 7 ? '#65a30d' : n >= 5 ? '#ea580c' : '#dc2626'
}
function ratingLabel(n: number) {
  return n >= 9 ? 'Eccellente' : n >= 7 ? 'Buono' : n >= 5 ? 'Sufficiente' : 'Insufficiente'
}

// ── CTS Compare Widget ────────────────────────────────────────────────────────

function CtsCompareWidget({ actual, estimated }: { actual: number; estimated?: number }) {
  const info = ctsLabel(actual)
  return (
    <div className="rounded-[14px] p-4 text-white mb-3" style={{ background: 'linear-gradient(135deg, #1a3320, #2d5c38)' }}>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: '#7fd491' }}>CTS Reale</p>
          <p className="text-[42px] font-bold leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>{actual}</p>
          <p className="text-[11px] mt-1 font-semibold" style={{ color: '#7fd491' }}>{info.label}</p>
        </div>
        {estimated != null && (
          <>
            <div className="flex flex-col items-center gap-1 px-3">
              <span className="text-[20px] opacity-40">→</span>
              <span className="text-[9px] uppercase tracking-wider opacity-50">vs</span>
            </div>
            <div className="flex-1 text-center opacity-60">
              <p className="text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: '#7fd491' }}>Stimato</p>
              <p className="text-[36px] font-bold leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>{estimated}</p>
              <p className="text-[11px] mt-1">
                {actual > estimated
                  ? <span style={{ color: '#7fd491' }}>+{actual - estimated} ↑</span>
                  : <span className="text-white opacity-60">{actual - estimated}</span>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

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
    <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>
      {children}
    </p>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function ResocontoPage() {
  const params  = useParams()
  const router  = useRouter()
  const actId   = decodeURIComponent(params.id as string)

  // Activity data
  const [activity,        setActivity]       = useState<StoredActivity | null>(null)
  const [loading,         setLoading]        = useState(true)
  const [saving,          setSaving]         = useState(false)
  const [editTitle,       setEditTitle]      = useState(false)
  const [editNotes,       setEditNotes]      = useState(false)
  const [titleVal,        setTitleVal]       = useState('')
  const [notesVal,        setNotesVal]       = useState('')
  const [tagInput,        setTagInput]       = useState('')
  const [showShare,       setShowShare]      = useState(false)
  const [showGradient,    setShowGradient]   = useState(false)
  const [pois,            setPois]           = useState<PoiItem[]>([])
  const [wikiPages,       setWikiPages]      = useState<WikiPage[]>([])
  const [ratingVal,       setRatingVal]      = useState(0)
  const [ratingNote,      setRatingNote]     = useState('')
  const [savingRating,    setSavingRating]   = useState(false)
  const [showRatingPanel, setShowRatingPanel] = useState(false)
  const [show3D,          setShow3D]          = useState(false)
  const [showStreetView,  setShowStreetView]  = useState(false)
  const [poiWikiEntries,  setPoiWikiEntries]  = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult,       setCtsResult]       = useState<TrailScoreResult | null>(null)
  const [ctsComputing,    setCtsComputing]    = useState(false)
  const [prefsLoaded,     setPrefsLoaded]     = useState(false)
  const [prefSforzo,      setPrefSforzo]      = useState(50)
  const [prefDurata,      setPrefDurata]      = useState(270)

  // Resoconto state
  const [report,           setReport]          = useState<HikeReport | null>(null)
  const [photos,           setPhotos]          = useState<RoutePhoto[]>([])
  const [content,          setContent]         = useState('')
  const [coverPhotoId,     setCoverPhotoId]    = useState<string | null>(null)
  const [isEditing,        setIsEditing]       = useState(false)
  const [generating,       setGenerating]      = useState(false)
  const [length,           setLength]          = useState<ResocontoLength>('media')
  const [lightbox,         setLightbox]        = useState<RoutePhoto | null>(null)
  const [saveOk,           setSaveOk]          = useState(false)
  const [savingReport,     setSavingReport]    = useState(false)
  const [showShareReport,  setShowShareReport] = useState(false)
  const [sharePdfUrl,      setSharePdfUrl]     = useState<string | null>(null)
  const [copyOk,           setCopyOk]          = useState(false)
  const [publishing,       setPublishing]      = useState(false)
  const [publishError,     setPublishError]    = useState<string | null>(null)
  const [apiError,         setApiError]        = useState<string | null>(null)
  const [showFullText,     setShowFullText]    = useState(false)
  const [showPhotoManager, setShowPhotoManager] = useState(false)

  // Accordion state for stats
  const [showHRChart,    setShowHRChart]    = useState(false)
  const [showSpeedChart, setShowSpeedChart] = useState(false)
  // Collapsible gestione section
  const [showGestione, setShowGestione] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  // Load activity + POIs
  useEffect(() => {
    getActivityById(actId).then(a => {
      if (!a) { router.push('/'); return }
      setActivity(a)
      setTitleVal(a.title ?? a.notes ?? '')
      setNotesVal(a.userNotes ?? '')
      setRatingVal(a.userRating ?? 0)
      setRatingNote(a.userRatingNote ?? '')
      const gps = a.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      if (gps.length > 0) {
        const bbox = computeBbox(gps)
        fetch(`/api/pois?bbox=${bbox}`)
          .then(r => r.json())
          .then((all: PoiItem[]) => {
            const nearby = all
              .filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
              .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
            setPois(nearby)
            fetchWikiForNamedPois(nearby)
              .then(entries => { setPoiWikiEntries(entries); setPoisFullyLoaded(true) })
              .catch(() => { setPoisFullyLoaded(true) })
          })
          .catch(() => { setPoisFullyLoaded(true) })
      }
    }).finally(() => setLoading(false))
  }, [actId, router])

  // Load user prefs for CTS display
  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.prefSforzo != null) setPrefSforzo(d.prefSforzo)
        if (d.prefDurata != null) setPrefDurata(d.prefDurata)
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true))
  }, [])

  // Load resoconto + photos + cover from localStorage
  useEffect(() => {
    if (!actId) return
    fetch(`/api/resoconto?activityId=${encodeURIComponent(actId)}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setReport(data)
          setContent(data.content ?? '')
        }
      })
      .catch(() => {})

    try {
      const raw = localStorage.getItem(`dtrek_vp_${actId}`)
      if (raw) {
        const parsed = JSON.parse(raw) as RoutePhoto[]
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* localStorage non disponibile */ }

    const savedCover = localStorage.getItem(`dtrek_cover_${actId}`)
    if (savedCover) setCoverPhotoId(savedCover)

    fetch(`/api/share-report?activityId=${encodeURIComponent(actId)}`)
      .then(r => r.json())
      .then(d => { if (d.share_pdf_url) setSharePdfUrl(d.share_pdf_url) })
      .catch(() => null)
  }, [actId])

  // Auto-save resoconto while editing
  useEffect(() => {
    if (!isEditing || !content || generating) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveContent(content), 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content, isEditing, generating]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute CTS from existing beauty score
  useEffect(() => {
    const bs = (activity as (StoredActivity & { linkedBeautyScore?: BeautyScore }) | null)?.linkedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded) return
    const computed = computeTrailScore(bs, {
      distanceMeters: activity!.distanceMeters,
      elevationGain:  activity!.elevationGain,
      elevationLoss:  activity!.elevationLoss ?? 0,
      altitudeMax:    activity!.altitudeMax,
      avgHeartRate:   activity!.avgHeartRate,
      prefSforzo,
      prefDurata,
    })
    setCtsResult({ ...computed, ts: (activity as StoredActivity & { trailScore?: number }).trailScore ?? computed.ts })
  }, [activity?.id, prefsLoaded, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveContent = useCallback(async (text: string) => {
    if (!text.trim()) return
    setSavingReport(true)
    try {
      await fetch('/api/resoconto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: actId, content: text }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } finally {
      setSavingReport(false)
    }
  }, [actId])

  const generateReport = useCallback(async () => {
    if (!activity) return
    setGenerating(true)
    setContent('')
    setApiError(null)
    const photoMeta = photos.map(p => ({
      caption: p.caption, lat: p.lat, lon: p.lon, progress: p.progress, hasExifGps: p.hasExifGps,
    }))
    try {
      const res = await fetch('/api/resoconto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: actId, length, photos: photoMeta }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setApiError(res.status === 402
          ? 'Aggiungi la tua chiave API Claude nelle impostazioni per usare questa funzione.'
          : (err.message ?? 'Errore durante la generazione.'))
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setContent(full)
      }
    } catch {
      setApiError('Errore di rete. Riprova.')
    } finally {
      setGenerating(false)
    }
  }, [activity, actId, length, photos])

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#F0F7F1' }}>
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
      </div>
    </div>
  )
  if (!activity) return null

  const patch = async (data: Parameters<typeof updateActivityMeta>[1]) => {
    setSaving(true)
    try {
      await updateActivityMeta(actId, data)
      setActivity(prev => prev ? { ...prev, ...data } : prev)
    } finally { setSaving(false) }
  }

  const saveTitle  = async () => { await patch({ title: titleVal }); setEditTitle(false) }
  const saveNotes  = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  const saveRating = async () => {
    if (!ratingVal) return
    setSavingRating(true)
    try {
      await updateActivityMeta(actId, { userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined })
      setActivity(prev => prev ? { ...prev, userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined } : prev)
      setShowRatingPanel(false)
    } finally { setSavingRating(false) }
  }

  const addTag    = async () => { if (!tagInput.trim()) return; await patch({ tags: [...(activity.tags ?? []), tagInput.trim()] }); setTagInput('') }
  const removeTag = async (tag: string) => patch({ tags: (activity.tags ?? []).filter(t => t !== tag) })
  const handleDelete = async () => {
    if (!confirm('Eliminare questa escursione dal diario?')) return
    setSaving(true)
    await deleteActivity(actId)
    router.push('/')
  }

  const handleComputeCts = async () => {
    const gps = (activity.trackPoints ?? [])
      .filter(p => p.lat && p.lon)
      .map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      const deadline = new Promise<null>(r => setTimeout(() => r(null), 12000))
      const bbox = computeBbox(gps)
      const [allPoisRes, osmData] = await Promise.all([
        Promise.race([
          fetch(`/api/pois?bbox=${bbox}`).then(r => r.json()) as Promise<PoiItem[]>,
          deadline,
        ]).then(r => r ?? []),
        Promise.race([
          fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>,
          deadline,
        ]).then(r => r ?? undefined).catch(() => undefined),
      ])
      const allPois = allPoisRes as PoiItem[]
      const nearPois = allPois
        .filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
        .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
      const elevProfile = (activity.trackPoints ?? [])
        .filter(p => p.lat && p.lon)
        .map(p => p.altitudeMeters ?? 0)
      const tei = computeTEI({
        track: gps, elevGain: activity.elevationGain, distanceMeters: activity.distanceMeters,
        altitudeMax: activity.altitudeMax, elevProfile, pois: nearPois, osmData,
      })
      const bs = teiToBeautyScore(tei)
      const confidence: CtsConfidence = tei.confidence
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      let { ts } = computeTrailScore(bs, {
        distanceMeters: activity.distanceMeters, elevationGain: activity.elevationGain,
        elevationLoss: activity.elevationLoss ?? 0, altitudeMax: activity.altitudeMax,
        avgHeartRate: activity.avgHeartRate, prefSforzo: prefs.prefSforzo,
        prefDurata: prefs.prefDurata, hrRest: prefs.hrRest, hrMax: prefs.hrMax ?? undefined,
      })
      if (confidence === 'estimated') ts = Math.round(ts * 0.9)
      await updateActivityMeta(actId, { linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence })
      setActivity(prev => prev ? { ...prev, linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }

  const dateStr = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const timeStr = `${format(new Date(activity.startTime), 'HH:mm')} – ${format(new Date(activity.endTime), 'HH:mm')}`
  const dateISO = format(new Date(activity.startTime), 'yyyy-MM-dd')
  const gpsPoints = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const rated     = (activity.userRating ?? 0) > 0

  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null
  const sections  = parseSections(content)
  const hasReport = !!content

  const meta = activity as StoredActivity & { trailScore?: number; linkedPlannedTrailScore?: number; linkedPlannedTrackPoints?: TrackPoint[]; linkedBeautyScore?: BeautyScore }
  const cts          = meta.trailScore != null ? Math.round(meta.trailScore) : null
  const ctsEstimated = meta.linkedPlannedTrailScore != null ? Math.round(meta.linkedPlannedTrailScore) : undefined
  const hasHRData    = activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0)

  return (
    <div className="min-h-screen" style={{ background: '#F0F7F1' }}>
      <Navbar />

      <div className="md:flex md:h-[calc(100vh-56px)]">
        <DiarioSidebar selected={actId} />

        <main className="flex-1 min-w-0 md:overflow-y-auto pb-20 md:pb-0">

          {/* ══ HERO ══ */}
          <div className="relative overflow-hidden" style={{ height: '220px' }}>
            {/* Aspect: 220px mobile, 280px md */}
            <div className="h-[220px] md:h-[280px] relative overflow-hidden">
              {heroPhoto ? (
                <img src={heroPhoto.dataUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #1a3320 0%, #2d5c38 100%)' }} />
                  {heroPolyline.length > 1 && (
                    <div className="absolute inset-0 pointer-events-none opacity-20">
                      <RouteThumb polyline={heroPolyline} color="rgba(255,255,255,0.7)" strokeWidth={6} />
                    </div>
                  )}
                </>
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.15) 55%, transparent 100%)' }} />

              {/* Top-left: back button */}
              <div className="absolute top-3 left-4">
                <button
                  onClick={() => router.push('/diario')}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-black/40"
                  style={{ background: 'rgba(0,0,0,.30)', color: 'white' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Diario
                </button>
              </div>

              {/* Top-right: action buttons */}
              <div className="absolute top-3 right-4 flex gap-1.5">
                <button title="Condividi" onClick={() => setShowShare(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-white hover:bg-black/40"
                  style={{ background: 'rgba(0,0,0,.25)' }}>
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button title="Elimina" onClick={handleDelete} disabled={saving}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-white"
                  style={{ background: 'rgba(220,38,38,.35)' }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Bottom: title + date + chips */}
              <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
                {editTitle ? (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={titleVal}
                      onChange={e => setTitleVal(e.target.value)}
                      className="text-[20px] font-bold bg-white/15 rounded-lg px-3 py-1 text-white outline-none border border-white/30 w-full max-w-sm"
                      style={{ fontFamily: "'Lora', serif" }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }}
                    />
                    <button onClick={saveTitle} disabled={saving} className="text-white shrink-0">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditTitle(false)} className="text-white/50 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditTitle(true)} className="group flex items-center gap-2 text-left mb-1">
                    <h1
                      className="text-[20px] font-bold leading-tight text-white"
                      style={{ fontFamily: "'Lora', serif" }}
                    >
                      {activity.title ?? activity.notes ?? 'Escursione'}
                    </h1>
                    <Pencil className="w-3.5 h-3.5 text-white/40 group-hover:text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <p className="text-[11px] capitalize mb-2" style={{ color: '#7fd491' }}>{dateStr} · {timeStr}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: <Route className="w-3 h-3" />, v: `${(activity.distanceMeters/1000).toFixed(1)} km` },
                    { icon: <Mountain className="w-3 h-3" />, v: `${activity.elevationGain.toFixed(0)} m D+` },
                    { icon: <Clock className="w-3 h-3" />, v: formatDuration(activity.totalTimeSeconds) },
                    ...(activity.calories > 0 ? [{ icon: <Flame className="w-3 h-3" />, v: `${activity.calories} kcal` }] : []),
                  ].map(({ icon, v }) => (
                    <span key={v} className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.20)' }}>
                      {icon} {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ PHOTO MOSAIC STRIP ══ */}
          {photos.length >= 2 && (
            <div className="flex overflow-hidden" style={{ height: '80px' }}>
              {photos.slice(1, 5).map(ph => (
                <button key={ph.id} onClick={() => setLightbox(ph)} className="flex-1 overflow-hidden">
                  <img src={ph.dataUrl} alt={ph.caption}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                    style={{ objectPosition: 'center 40%' }} />
                </button>
              ))}
            </div>
          )}

          {/* ══ CONTENT ══ */}
          <div className="px-3 sm:px-4 pt-4">

            {/* ── SECTION: RACCONTO ─────────────────────────────────────── */}
            <Card>
              {/* Header row */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <SectionLabel>Racconto</SectionLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Length selector */}
                  <div className="flex rounded-xl overflow-hidden border border-stone-200">
                    {(['breve', 'media', 'lunga'] as const).map(l => (
                      <button key={l} onClick={() => setLength(l)}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${length === l ? 'text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
                        style={length === l ? { background: '#2d5c38' } : {}}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={generateReport}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:opacity-50"
                    style={{ background: '#2d5c38' }}>
                    {generating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione…</>
                      : <><BookOpen className="w-3.5 h-3.5" /> Genera racconto</>
                    }
                  </button>
                </div>
              </div>

              {apiError && (
                <div className="mb-3 p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  {apiError}
                </div>
              )}

              {/* CTS compare widget */}
              {cts != null && <CtsCompareWidget actual={cts} estimated={ctsEstimated} />}

              {/* Generating: show streaming text */}
              {generating && (
                <div>
                  {!content ? (
                    <div className="flex items-center gap-3 py-6 text-stone-500">
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#4a9e5c' }} />
                      <span className="font-display italic text-sm">Giulia sta scrivendo il tuo resoconto…</span>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: '#F0F7F1' }}>
                      <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "'Lora', serif" }}>{content}</p>
                    </div>
                  )}
                </div>
              )}

              {/* No report yet, not generating */}
              {!hasReport && !generating && (
                <div className="rounded-[14px] p-5 flex flex-col items-center gap-3 text-center"
                  style={{ background: '#F0F7F1', border: '2px dashed #4a9e5c' }}>
                  <PenLine className="w-8 h-8" style={{ color: '#4a9e5c' }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
                      Racconto da scrivere
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#8a7f6e' }}>
                      Scegli la lunghezza e clicca &ldquo;Genera racconto&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {/* Report exists: show truncated text + read more */}
              {hasReport && !generating && (
                <div>
                  {/* Save indicator */}
                  <div className="flex items-center gap-2 mb-2 min-h-[20px]">
                    {report?.updated_at && (
                      <span className="font-display text-[10px] italic text-stone-400">
                        Salvato {format(new Date(report.updated_at), "d MMM · HH:mm", { locale: it })}
                      </span>
                    )}
                    {savingReport && (
                      <span className="flex items-center gap-1 font-display text-[10px] italic text-stone-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
                      </span>
                    )}
                    {saveOk && (
                      <span className="flex items-center gap-1 font-display text-[10px] text-green-600">
                        <Check className="w-3 h-3" /> Salvato
                      </span>
                    )}
                  </div>

                  {/* Truncated preview */}
                  <div className="relative">
                    <p className="text-[14px] leading-7 text-stone-600 line-clamp-4"
                      style={{ fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
                      {content.replace(/^## .+$/gm, '').replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '').trim().slice(0, 350)}
                      {content.length > 350 ? '…' : ''}
                    </p>
                    <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                      style={{ background: 'linear-gradient(to top, white, transparent)' }} />
                  </div>

                  <button
                    onClick={() => setShowFullText(true)}
                    className="mt-3 text-[12px] font-bold flex items-center gap-1 transition-colors hover:underline"
                    style={{ color: '#2d5c38' }}>
                    Leggi tutto il racconto →
                  </button>
                </div>
              )}
            </Card>

            {/* ── SECTION: FOTO ─────────────────────────────────────── */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Foto {photos.length > 0 && `(${photos.length})`}</SectionLabel>
                <button
                  onClick={() => setShowPhotoManager(s => !s)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg transition-colors"
                  style={showPhotoManager
                    ? { background: '#e8f5eb', color: '#2d5c38' }
                    : { background: '#f5f5f5', color: '#5e564c' }}>
                  <Camera className="w-3 h-3" />
                  Gestisci
                </button>
              </div>

              {photos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {photos.map((ph, i) => (
                    <button key={ph.id} onClick={() => setLightbox(ph)}
                      className="shrink-0 rounded-[10px] overflow-hidden"
                      style={{ width: '110px', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
                      <img src={ph.dataUrl} alt={ph.caption} style={{ width: '110px', height: '82px', objectFit: 'cover' }} />
                      {ph.caption && (
                        <div className="bg-white px-1.5 py-1">
                          <p className="text-[9px] leading-tight truncate" style={{ color: '#5e564c', fontStyle: 'italic' }}>
                            {i + 1}. {ph.caption}
                          </p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] p-4 flex flex-col items-center gap-2 text-center"
                  style={{ background: '#F0F7F1', border: '2px dashed #4a9e5c' }}>
                  <Camera className="w-7 h-7" style={{ color: '#4a9e5c' }} />
                  <p className="text-xs" style={{ color: '#8a7f6e' }}>Nessuna foto ancora · clicca Gestisci per aggiungerne</p>
                </div>
              )}

              {showPhotoManager && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <ActivityPhotoManager
                    activityId={actId}
                    trackPoints={activity.trackPoints}
                    activityTitle={activity.title ?? activity.notes ?? undefined}
                    distanceMeters={activity.distanceMeters}
                    elevationGain={activity.elevationGain}
                  />
                </div>
              )}
            </Card>

            {/* ── SECTION: MAPPA ─────────────────────────────────────── */}
            <Card>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <SectionLabel>Mappa</SectionLabel>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasGps && activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
                    <button onClick={() => setShowGradient(g => !g)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors"
                      style={showGradient ? { background: '#2d5c38', color: 'white', borderColor: '#2d5c38' } : { background: 'white', color: '#5e564c', borderColor: '#e5e7eb' }}>
                      <Layers className="w-3 h-3" /> Pendenza
                    </button>
                  )}
                  {hasGps && activity.trackPoints.length > 1 && (
                    <button onClick={() => setShow3D(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors"
                      style={{ background: 'white', color: '#5e564c', borderColor: '#e5e7eb' }}>
                      <Box className="w-3 h-3" /> Vista 3D
                    </button>
                  )}
                  {hasGps && centerPt?.lat && (
                    <button onClick={() => setShowStreetView(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors"
                      style={{ background: 'white', color: '#5e564c', borderColor: '#e5e7eb' }}>
                      <Images className="w-3 h-3" /> Foto zona
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-[12px] overflow-hidden h-[280px] md:h-[380px]">
                {hasGps ? (
                  <MapView trackPoints={activity.trackPoints} height="100%" showGradient={showGradient} pois={pois} wikiPages={wikiPages} />
                ) : (
                  <div className="h-full flex items-center justify-center" style={{ background: '#f5f5f5' }}>
                    <p className="text-stone-400 text-sm">Nessuna traccia GPS disponibile</p>
                  </div>
                )}
              </div>

              {hasGps && (
                <div className="mt-3">
                  <AltimetryChart trackPoints={activity.trackPoints} mode="actual" />
                </div>
              )}
            </Card>

            {/* ── SECTION: STATISTICHE ───────────────────────────────── */}
            <Card>
              <SectionLabel>Statistiche</SectionLabel>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Distanza',  value: `${(activity.distanceMeters/1000).toFixed(2)} km`, icon: <Route className="w-4 h-4" /> },
                  { label: 'Durata',    value: formatDuration(activity.totalTimeSeconds),          icon: <Clock className="w-4 h-4" /> },
                  { label: 'D+ totale', value: `${activity.elevationGain.toFixed(0)} m`,           icon: <Mountain className="w-4 h-4" /> },
                  { label: 'Vel. Media',value: `${msToKmh(activity.avgSpeedMs)} km/h`,             icon: <Zap className="w-4 h-4" /> },
                  ...(activity.avgHeartRate > 0 ? [{ label: 'FC Media', value: `${activity.avgHeartRate} bpm`, icon: <Heart className="w-4 h-4" /> }] : []),
                  ...(activity.calories > 0 ? [{ label: 'Calorie', value: `${activity.calories} kcal`, icon: <Flame className="w-4 h-4" /> }] : []),
                ].map(s => (
                  <div key={s.label} className="rounded-[12px] p-3" style={{ background: '#F0F7F1' }}>
                    <div className="flex items-center gap-1.5 mb-1" style={{ color: '#4a9e5c' }}>
                      {s.icon}
                      <span className="text-[9px] font-bold uppercase tracking-[1px]">{s.label}</span>
                    </div>
                    <p className="text-[18px] font-bold" style={{ color: '#1a3320', fontFamily: "'DM Mono', monospace" }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* HR chart accordion */}
              {hasHRData && (
                <div className="border-t border-stone-100 pt-3 mt-1">
                  <button
                    onClick={() => setShowHRChart(v => !v)}
                    className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wide py-1"
                    style={{ color: '#4a9e5c' }}>
                    <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> Frequenza Cardiaca</span>
                    {showHRChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showHRChart && (
                    <div className="mt-2">
                      <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
                    </div>
                  )}
                </div>
              )}

              {/* Speed chart accordion */}
              <div className="border-t border-stone-100 pt-3 mt-1">
                <button
                  onClick={() => setShowSpeedChart(v => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wide py-1"
                  style={{ color: '#4a9e5c' }}>
                  <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Velocità</span>
                  {showSpeedChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showSpeedChart && (
                  <div className="mt-2">
                    <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
                  </div>
                )}
              </div>
            </Card>

            {/* ── SECTION: SCHEDA TECNICA ───────────────────────────── */}
            <Card>
              <SectionLabel>Scheda Tecnica</SectionLabel>

              {/* Data table */}
              <div className="rounded-[12px] overflow-hidden mb-3" style={{ border: '1px solid #eef0ec' }}>
                {[
                  ['Distanza',     `${(activity.distanceMeters/1000).toFixed(2)} km`],
                  ['Dislivello D+',`${Math.round(activity.elevationGain)} m`],
                  ['Dislivello D−',`${Math.round(activity.elevationLoss ?? 0)} m`],
                  ['Durata',        formatDuration(activity.totalTimeSeconds)],
                  ['Quota max',    `${Math.round(activity.altitudeMax)} m`],
                  ['Quota min',    `${Math.round(activity.altitudeMin ?? 0)} m`],
                  ['Passo medio',   formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
                  ['Vel. media',   `${msToKmh(activity.avgSpeedMs)} km/h`],
                  ['Vel. max',     `${msToKmh(activity.maxSpeedMs)} km/h`],
                  ...(activity.avgHeartRate > 0 ? [['FC media', `${activity.avgHeartRate} bpm`]] : []),
                  ...(activity.maxHeartRate > 0 ? [['FC max',   `${activity.maxHeartRate} bpm`]] : []),
                  ['Trackpoint',   activity.trackPoints.length.toLocaleString('it')],
                  ['Sport',        activity.sport ?? '—'],
                ].map((row, i, arr) => (
                  <div key={row[0]} className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid #f0f5f9' : 'none' }}>
                    <span className="text-[11px] uppercase tracking-[1px] font-semibold" style={{ color: '#8a7f6e' }}>{row[0]}</span>
                    <span className="text-[14px] font-bold" style={{ color: '#1a3320', fontFamily: "'DM Mono', monospace" }}>{row[1]}</span>
                  </div>
                ))}
              </div>

              {/* CTS widget */}
              {hasGps && (
                <>
                  {(ctsResult || meta.trailScore != null) ? (
                    <ComfortTrailScoreWidget
                      result={ctsResult}
                      cached={meta.trailScore}
                      beautyScore={meta.linkedBeautyScore}
                    />
                  ) : (
                    <div className="rounded-[12px] px-4 py-3 flex items-center justify-between gap-3" style={{ background: '#F0F7F1', border: '1px solid #d4e8d4' }}>
                      <p className="text-xs text-stone-500">Il punteggio CTS non è ancora stato calcolato.</p>
                      <button onClick={handleComputeCts} disabled={ctsComputing}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:opacity-50"
                        style={{ background: '#2d5c38' }}>
                        {ctsComputing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-3.5 h-3.5" /> Calcola CTS</>}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Weather widget */}
              {hasGps && centerPt?.lat && (
                <div className="mt-3">
                  <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />
                </div>
              )}
            </Card>

            {/* ── SECTION: POI & LUOGHI ─────────────────────────────── */}
            {hasGps && (
              <Card>
                <SectionLabel>POI & Luoghi</SectionLabel>

                {/* POI cards */}
                {!poisFullyLoaded && pois.length === 0 && (
                  <div className="flex items-center gap-2 py-4 text-stone-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Caricamento punti di interesse…
                  </div>
                )}

                {pois.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-stone-400 mb-2">{pois.length} POI trovati entro 300 m dal tracciato</p>
                    <div className="grid grid-cols-1 gap-2">
                      {poiWikiEntries.slice(0, 6).map(({ poi, wiki }) => (
                        <div key={poi.id ?? poi.name} className="flex items-start gap-3 rounded-[12px] p-3"
                          style={{ background: '#F0F7F1', border: '1px solid #d4e8d4' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold truncate" style={{ color: '#1a3320' }}>{poi.name}</p>
                            {poi.type && <p className="text-[10px] capitalize" style={{ color: '#4a9e5c' }}>{poi.type.replace(/_/g, ' ')}</p>}
                            {wiki.extract && (
                              <p className="text-[11px] text-stone-500 mt-1 leading-relaxed line-clamp-2">{wiki.extract}</p>
                            )}
                            {poi.distFromTrack !== undefined && (
                              <p className="text-[9px] text-stone-400 mt-0.5">{poi.distFromTrack} m dal tracciato</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {pois.length > 6 && poiWikiEntries.length === 0 && pois.slice(0, 8).map(poi => (
                        <div key={poi.id ?? poi.name} className="flex items-center gap-2 px-3 py-2 rounded-[10px]"
                          style={{ background: '#F0F7F1' }}>
                          <span className="text-[11px] font-medium truncate" style={{ color: '#1a3320' }}>{poi.name}</span>
                          {poi.distFromTrack !== undefined && (
                            <span className="text-[9px] text-stone-400 shrink-0">{poi.distFromTrack} m</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* WikiCards */}
                <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
              </Card>
            )}

            {/* ── SECTION: GESTIONE (collapsible) ───────────────────── */}
            <Card>
              <button
                onClick={() => setShowGestione(v => !v)}
                className="w-full flex items-center justify-between">
                <SectionLabel>Gestione</SectionLabel>
                {showGestione ? <ChevronUp className="w-4 h-4 mb-3" style={{ color: '#4a9e5c' }} /> : <ChevronDown className="w-4 h-4 mb-3" style={{ color: '#4a9e5c' }} />}
              </button>

              {showGestione && (
                <div className="space-y-4">
                  {/* Tags */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[1px] mb-2 text-stone-500">Tag</p>
                    <div className="flex items-center flex-wrap gap-2">
                      {(activity.tags ?? []).map(tag => (
                        <span key={tag} className="flex items-center gap-1 rounded-full px-3 py-0.5 text-xs border"
                          style={{ background: '#e8f5eb', color: '#2d5c38', borderColor: '#c1dfca' }}>
                          {tag}
                          <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="+ tag"
                        className="rounded-full px-3 py-0.5 text-xs w-20 outline-none border border-stone-200 focus:border-green-400"
                        style={{ background: '#f9fafb', color: '#374151' }} />
                    </div>
                  </div>

                  {/* Rating panel */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-[1px] text-stone-500">Voto bellezza</p>
                      {rated && (
                        <span className="text-xs font-bold" style={{ color: ratingColor(activity.userRating!) }}>
                          {activity.userRating}/10 · {ratingLabel(activity.userRating!)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mb-3">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                        const sel = n === ratingVal
                        return (
                          <button key={n} onClick={() => setRatingVal(n)}
                            style={sel ? { backgroundColor: ratingColor(n) } : { background: '#f0f0f0' }}
                            className={`flex-1 aspect-square rounded-lg text-xs font-bold transition-all ${sel ? 'text-white scale-110 shadow' : 'text-stone-500 hover:text-stone-700'}`}>
                            {n}
                          </button>
                        )
                      })}
                    </div>
                    <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)}
                      placeholder="Nota (opzionale)…" rows={2}
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 placeholder-stone-300 resize-none outline-none focus:border-green-400 mb-2"
                      style={{ background: '#fafafa' }} />
                    <button onClick={saveRating} disabled={savingRating || ratingVal === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:opacity-40"
                      style={{ background: '#2d5c38' }}>
                      {savingRating && <Loader2 className="w-3 h-3 animate-spin" />}
                      {rated ? 'Aggiorna voto' : 'Salva voto'}
                    </button>
                  </div>

                  {/* Personal notes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-[1px] text-stone-500">Note personali</p>
                      {!editNotes && (
                        <button onClick={() => setEditNotes(true)} className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-700">
                          <Pencil className="w-3 h-3" /> Modifica
                        </button>
                      )}
                    </div>
                    {editNotes ? (
                      <div>
                        <textarea value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4}
                          placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                          className="w-full border border-stone-200 rounded-xl p-3 text-sm text-stone-700 outline-none focus:border-green-400 resize-none"
                          autoFocus />
                        <div className="flex gap-2 mt-2">
                          <button onClick={saveNotes} disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-1.5 text-white rounded-lg text-xs font-bold uppercase disabled:opacity-60 transition-colors"
                            style={{ background: '#2d5c38' }}>
                            {saving && <Loader2 className="w-3 h-3 animate-spin" />} Salva
                          </button>
                          <button onClick={() => setEditNotes(false)}
                            className="px-4 py-1.5 border border-stone-200 text-stone-500 rounded-lg text-xs hover:bg-stone-50">
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm leading-relaxed ${activity.userNotes ? 'text-stone-600' : 'text-stone-400 italic'}`}>
                        {activity.userNotes || 'Nessuna nota personale.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* ── SECTION: ESPORTA ──────────────────────────────────── */}
            <Card>
              <SectionLabel>Esporta</SectionLabel>

              {/* Export buttons */}
              <div className="flex gap-2 flex-wrap mb-4">
                <button onClick={() => exportActivityToExcel(activity)} title="Excel"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors hover:bg-stone-50"
                  style={{ borderColor: '#e5e7eb', color: '#5e564c' }}>
                  <FileSpreadsheet className="w-4 h-4 text-green-600" /> Excel
                </button>
                <button onClick={() => exportActivityToDoc(activity)} title="Word"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors hover:bg-stone-50"
                  style={{ borderColor: '#e5e7eb', color: '#5e564c' }}>
                  <FileText className="w-4 h-4 text-blue-600" /> Word
                </button>
                <button onClick={() => exportActivityToGpx(activity)} title="GPX"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors hover:bg-stone-50"
                  style={{ borderColor: '#e5e7eb', color: '#5e564c' }}>
                  <MapIcon className="w-4 h-4 text-orange-500" /> GPX
                </button>
                <button onClick={() => window.print()} title="Stampa PDF"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-colors hover:bg-stone-50"
                  style={{ borderColor: '#e5e7eb', color: '#5e564c' }}>
                  <FileDown className="w-4 h-4 text-stone-500" /> Stampa
                </button>
                <PdfExportButton variant="activity" data={activity}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-stone-200 text-stone-600 transition-colors hover:bg-stone-50" />
              </div>

              {/* Publish PDF section */}
              <div className="border-t border-stone-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-[1px] text-stone-500">Pubblica PDF</p>
                  <button onClick={() => setShowShareReport(s => !s)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg transition-colors"
                    style={showShareReport ? { background: '#e8f5eb', color: '#2d5c38' } : { background: '#f5f5f5', color: '#5e564c' }}>
                    <Share2 className="w-3 h-3" /> {showShareReport ? 'Nascondi' : 'Mostra'}
                  </button>
                </div>

                {showShareReport && (
                  sharePdfUrl ? (
                    <div className="flex flex-wrap gap-2">
                      <a href={`/leggi/r/${encodeURIComponent(actId)}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
                        style={{ background: '#f0f0f0', color: '#5e564c' }}>
                        <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                      </a>
                      <button
                        onClick={async () => {
                          const viewerUrl = `${window.location.origin}/leggi/r/${encodeURIComponent(actId)}`
                          await navigator.clipboard.writeText(viewerUrl)
                          setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white transition-colors"
                        style={{ background: '#2d5c38' }}>
                        <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                      </button>
                      <a href={sharePdfUrl} target="_blank" rel="noopener noreferrer" download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors"
                        style={{ borderColor: '#e5e7eb', color: '#5e564c' }}>
                        <ExternalLink className="w-3.5 h-3.5" /> PDF diretto
                      </a>
                      <button
                        onClick={async () => {
                          await fetch(`/api/share-report?activityId=${encodeURIComponent(actId)}`, { method: 'DELETE' })
                          setSharePdfUrl(null)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide hover:bg-red-50 transition-colors"
                        style={{ borderColor: '#fecaca', color: '#dc2626' }}>
                        <Link2Off className="w-3.5 h-3.5" /> Disattiva
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-stone-500 italic mb-2">Genera un PDF con le foto e pubblicalo online.</p>
                      {publishError && <p className="text-xs text-red-500 mb-2">{publishError}</p>}
                      <button
                        disabled={publishing || !content}
                        onClick={async () => {
                          if (!activity) return
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
                            const url = await uploadReportPdf(user.id, actId, blob)
                            await fetch('/api/share-report', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ activityId: actId, sharePdfUrl: url }),
                            })
                            setSharePdfUrl(url)
                          } catch (e) {
                            setPublishError(String(e))
                          } finally {
                            setPublishing(false)
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:opacity-50"
                        style={{ background: '#2d5c38' }}>
                        {publishing
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</>
                          : <><Share2 className="w-3.5 h-3.5" /> Genera e pubblica</>
                        }
                      </button>
                    </div>
                  )
                )}
              </div>
            </Card>

            {/* bottom spacing */}
            <div className="h-4" />
          </div>

        </main>
      </div>

      {/* ══ OVERLAYS ══ */}

      {/* Share activity modal */}
      {showShare && (() => {
        const polyline = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        const step = Math.max(1, Math.ceil(polyline.length / 250))
        const altPts = activity.trackPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
        const aStep = Math.max(1, Math.ceil(altPts.length / 140))
        const elevationProfile = altPts.length > 4 ? altPts.filter((_, i) => i % aStep === 0) : undefined
        const actMeta: ActivityMeta = {
          id: activity.id, title: activity.title ?? activity.notes ?? 'Escursione',
          startTime: activity.startTime, distanceMeters: activity.distanceMeters,
          totalTimeSeconds: activity.totalTimeSeconds, calories: activity.calories,
          avgHeartRate: activity.avgHeartRate, maxHeartRate: activity.maxHeartRate,
          elevationGain: activity.elevationGain, elevationLoss: activity.elevationLoss,
          altitudeMax: activity.altitudeMax, avgSpeedMs: activity.avgSpeedMs,
          maxSpeedMs: activity.maxSpeedMs, tags: activity.tags,
          userNotes: activity.userNotes, fileName: activity.fileName,
          routePolyline: polyline.filter((_, i) => i % step === 0), elevationProfile,
        }
        return <ShareModal kind="activity" activity={actMeta} onClose={() => setShowShare(false)} />
      })()}

      {/* RouteMap3D */}
      {show3D && (
        <RouteMap3D trackPoints={activity.trackPoints} title={activity.title ?? activity.notes}
          onClose={() => setShow3D(false)} plannedTrackPoints={meta.linkedPlannedTrackPoints}
          activityId={activity.id} distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain} />
      )}

      {/* StreetView */}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={activity.title ?? undefined}
          onClose={() => setShowStreetView(false)} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.92)' }}
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.caption} className="w-full rounded-2xl shadow-2xl" />
            {lightbox.caption && (
              <p className="text-sm italic text-white/70 text-center mt-3" style={{ fontFamily: "'Lora', serif" }}>
                {lightbox.caption}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Full-text drawer */}
      {showFullText && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setShowFullText(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Chiudi
            </button>
            <h2 className="flex-1 text-sm font-semibold text-stone-700 truncate" style={{ fontFamily: "'Lora', serif" }}>
              {activity.title ?? activity.notes ?? 'Escursione'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Save indicator */}
              {savingReport && <span className="flex items-center gap-1 text-[10px] italic text-stone-400"><Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…</span>}
              {saveOk && <span className="flex items-center gap-1 text-[10px] text-green-600"><Check className="w-3 h-3" /> Salvato</span>}
              {/* Edit toggle */}
              <button
                onClick={() => {
                  if (isEditing) { saveContent(content); setIsEditing(false) }
                  else setIsEditing(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors border-stone-200">
                {isEditing ? <><Check className="w-3.5 h-3.5" /> Fatto</> : <><Pencil className="w-3.5 h-3.5" /> Modifica</>}
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Edit textarea */}
            {isEditing && (
              <div className="mb-6">
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={30}
                  className="w-full bg-white border border-stone-200 rounded-2xl p-5 font-mono text-sm text-stone-700 leading-relaxed outline-none focus:border-green-400 resize-y shadow-sm"
                  placeholder="Scrivi il resoconto in Markdown…"
                />
              </div>
            )}

            {/* Rendered sections */}
            {!isEditing && sections.map((section, i) => {
              const miniMapNode = i === 0 && activity.trackPoints.length > 4 ? (
                <div className="float-right ml-5 mb-4 w-52 shrink-0 hidden md:block">
                  <div className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                    <RoutePhotoMap trackPoints={activity.trackPoints} photos={photos} height="170px" />
                    {photos.length > 0 && (
                      <div className="px-2 pt-1 pb-2 space-y-0.5">
                        {photos.slice(0, 7).map((ph, idx) => (
                          <div key={ph.id} className="flex items-center gap-1.5">
                            <span className="w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-display text-[9px] text-stone-500 truncate">{ph.caption}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : undefined

              return (
                <SectionCard
                  key={i}
                  section={section}
                  index={i}
                  photo={i === 0 ? undefined : photos[i]}
                  photoIndex={i === 0 ? undefined : i + 1}
                  floatNode={miniMapNode}
                />
              )
            })}

            {/* Route timeline */}
            {sections.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-5">
                <h3 className="font-body font-bold uppercase tracking-[2px] text-xs text-stone-400 mb-3">Profilo altimetrico</h3>
                <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />
              </div>
            )}

            {/* Photo gallery grid */}
            {photos.length > 0 && (
              <section className="mt-6 mb-5">
                <h3 className="font-body font-bold uppercase tracking-[2px] text-xs text-stone-500 mb-4">Documentazione fotografica</h3>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((ph, i) => (
                    <button key={ph.id} onClick={() => setLightbox(ph)} className="text-left">
                      <div className="relative">
                        <img src={ph.dataUrl} alt={ph.caption} className="w-full aspect-[4/3] object-cover rounded-xl shadow" />
                        <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {i + 1}
                        </span>
                      </div>
                      {ph.caption && (
                        <p className="text-[9px] italic text-stone-400 mt-1 text-center leading-snug">{i + 1}. {ph.caption}</p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Print + publish */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-stone-100">
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors border-stone-200 text-stone-600">
                <FileDown className="w-3.5 h-3.5" /> Stampa PDF
              </button>
              <button onClick={() => { setShowFullText(false); setShowShareReport(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white transition-colors"
                style={{ background: '#2d5c38' }}>
                <Share2 className="w-3.5 h-3.5" /> Pubblica PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF root (for publish PDF capture) */}
      {content && (
        <div id="resoconto-print-root"
          style={{ position: 'fixed', left: '-9999px', top: 0, width: 794, background: 'white', fontFamily: 'Georgia, serif' }}>
          <div className="pdf-block" style={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden', marginBottom: 0 }}>
            {heroPhoto
              ? <img src={heroPhoto.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a3320,#2d5c38)' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 32px' }}>
              <h1 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 28, fontWeight: 900, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
                {activity.title ?? activity.notes ?? 'Escursione'}
              </h1>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', fontStyle: 'italic' }}>
                {format(new Date(activity.startTime), "d MMMM yyyy", { locale: it })}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  `${(activity.distanceMeters / 1000).toFixed(1)} km`,
                  `${activity.elevationGain.toFixed(0)} m D+`,
                  formatDuration(activity.totalTimeSeconds),
                ].map(v => (
                  <span key={v} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontFamily: 'Arial, sans-serif' }}>{v}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding: '32px 32px 0' }}>
            {sections.map((section, i) => (
              <div key={i} className="pdf-block" style={{ marginBottom: 24 }}>
                <div style={{ background: ['#2d6a4f','#40916c','#74c69d','#b7e4c7','#d8f3dc'][i % 5], padding: '6px 16px', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i+1).padStart(2,'0')}</span>
                  <span style={{ fontSize: 14, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 1 }}>{section.title}</span>
                </div>
                <div style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                  {photos[i] && i > 0 && (
                    <div style={{ float: 'right', marginLeft: 12, marginBottom: 8, width: 120 }}>
                      <img src={photos[i].dataUrl} alt={photos[i].caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                    </div>
                  )}
                  {section.body.split(/\n\n+/).map((p, j) => (
                    <p key={j} style={{ fontSize: 11, lineHeight: 1.7, color: '#374151', margin: '0 0 8px' }}>{p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()}</p>
                  ))}
                </div>
              </div>
            ))}
            {photos.length > 0 && (
              <div className="pdf-block" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
                <h3 style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }}>Documentazione fotografica</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {photos.map((ph, i) => (
                    <div key={ph.id} className="pdf-block">
                      <img src={ph.dataUrl} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                      {ph.caption && <p style={{ fontSize: 8, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{i+1}. {ph.caption}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
