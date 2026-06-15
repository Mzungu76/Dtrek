'use client'
import { useEffect, useState, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import AltimetryChart from '@/components/AltimetryChart'
import SpeedChart from '@/components/SpeedChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import RouteThumb from '@/components/RouteThumb'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import {
  getActivityById, updateActivityMeta, deleteActivity,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { formatDuration, msToKmh, formatPace, type TrackPoint } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import PdfExportButton from '@/components/PdfExportButton'
import { type PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import type { CtsConfidence } from '@/lib/trailScore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, FileSpreadsheet, FileText, Map,
  Heart, Zap, Mountain, Clock, Route, Flame,
  Pencil, Check, X, Trash2, Loader2, Share2, Layers, Star, Box, Images, RefreshCw,
  BookOpen, FileDown, Copy, Link2Off, ExternalLink,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
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

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function EscursionePage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)

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

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'resoconto' | 'dati'>('resoconto')

  // Resoconto state
  const [report,        setReport]        = useState<HikeReport | null>(null)
  const [photos,        setPhotos]        = useState<RoutePhoto[]>([])
  const [content,       setContent]       = useState('')
  const [coverPhotoId,  setCoverPhotoId]  = useState<string | null>(null)
  const [isEditing,     setIsEditing]     = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [length,        setLength]        = useState<ResocontoLength>('media')
  const [lightbox,      setLightbox]      = useState<RoutePhoto | null>(null)
  const [saveOk,        setSaveOk]        = useState(false)
  const [savingReport,  setSavingReport]  = useState(false)
  const [showShareReport, setShowShareReport] = useState(false)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [apiError,      setApiError]      = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  // Load activity + POIs
  useEffect(() => {
    getActivityById(id).then(a => {
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
  }, [id, router])

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
    if (!id) return
    fetch(`/api/resoconto?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setReport(data)
          setContent(data.content ?? '')
        }
      })
      .catch(() => {})

    try {
      const raw = localStorage.getItem(`dtrek_vp_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as RoutePhoto[]
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* localStorage non disponibile */ }

    const savedCover = localStorage.getItem(`dtrek_cover_${id}`)
    if (savedCover) setCoverPhotoId(savedCover)

    fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (d.share_pdf_url) setSharePdfUrl(d.share_pdf_url) })
      .catch(() => null)
  }, [id])

  // Auto-save resoconto while editing
  useEffect(() => {
    if (!isEditing || !content || generating) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveContent(content), 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content, isEditing, generating]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute CTS
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
        body: JSON.stringify({ activityId: id, content: text }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } finally {
      setSavingReport(false)
    }
  }, [id])

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
        body: JSON.stringify({ activityId: id, length, photos: photoMeta }),
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
  }, [activity, id, length, photos])

  if (loading) return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento escursione…</span>
      </div>
    </div>
  )
  if (!activity) return null

  const patch = async (data: Parameters<typeof updateActivityMeta>[1]) => {
    setSaving(true)
    try {
      await updateActivityMeta(id, data)
      setActivity(prev => prev ? { ...prev, ...data } : prev)
    } finally { setSaving(false) }
  }

  const saveTitle  = async () => { await patch({ title: titleVal }); setEditTitle(false) }
  const saveNotes  = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  const saveRating = async () => {
    if (!ratingVal) return
    setSavingRating(true)
    try {
      await updateActivityMeta(id, { userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined })
      setActivity(prev => prev ? { ...prev, userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined } : prev)
      setShowRatingPanel(false)
    } finally { setSavingRating(false) }
  }

  const addTag    = async () => { if (!tagInput.trim()) return; await patch({ tags: [...(activity.tags ?? []), tagInput.trim()] }); setTagInput('') }
  const removeTag = async (tag: string) => patch({ tags: (activity.tags ?? []).filter(t => t !== tag) })
  const handleDelete = async () => {
    if (!confirm('Eliminare questa escursione dal diario?')) return
    setSaving(true)
    await deleteActivity(id)
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
      await updateActivityMeta(id, { linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence })
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

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      {/* ══ HERO — cover photo o gradient ══ */}
      <div className="relative overflow-hidden" style={{ height: 'clamp(220px, 38vw, 420px)' }}>
        {heroPhoto
          ? <img src={heroPhoto.dataUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <>
              <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
              {heroPolyline.length > 1 && (
                <div className="absolute inset-0 pointer-events-none">
                  <RouteThumb polyline={heroPolyline} color="rgba(255,255,255,0.10)" strokeWidth={7} />
                </div>
              )}
            </>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/30" />

        {/* Top overlay — back + actions */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => router.push('/diario')}
            className="flex items-center gap-1.5 text-white/90 hover:text-white text-sm transition-colors bg-black/20 rounded-lg px-3 py-1.5">
            <ArrowLeft className="w-4 h-4" /> Diario
          </button>
          <div className="flex gap-1.5">
            {([
              { icon: <FileSpreadsheet className="w-3.5 h-3.5" />, title: 'Excel', fn: () => exportActivityToExcel(activity) },
              { icon: <FileText className="w-3.5 h-3.5" />, title: 'Word', fn: () => exportActivityToDoc(activity) },
              { icon: <Map className="w-3.5 h-3.5" />, title: 'GPX', fn: () => exportActivityToGpx(activity) },
              { icon: <Share2 className="w-3.5 h-3.5" />, title: 'Condividi', fn: () => setShowShare(true) },
            ] as const).map(({ icon, title, fn }) => (
              <button key={title} title={title} onClick={fn}
                className="w-8 h-8 rounded-lg bg-black/25 hover:bg-black/40 flex items-center justify-center transition-colors text-white">
                {icon}
              </button>
            ))}
            <PdfExportButton variant="activity" data={activity} iconOnly
              className="w-8 h-8 rounded-lg bg-black/25 hover:bg-black/40 flex items-center justify-center transition-colors text-white" />
            <button title="Elimina" onClick={handleDelete} disabled={saving}
              className="w-8 h-8 rounded-lg bg-red-500/35 hover:bg-red-500/55 flex items-center justify-center transition-colors text-white">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Bottom — title, date, stats */}
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-4 sm:pb-6 max-w-6xl mx-auto">
          {editTitle ? (
            <div className="flex items-center gap-2 mb-2">
              <input value={titleVal} onChange={e => setTitleVal(e.target.value)}
                className="font-display text-2xl sm:text-3xl bg-white/15 rounded-lg px-3 py-1 text-white outline-none border border-white/30 w-full max-w-md"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }} />
              <button onClick={saveTitle} disabled={saving} className="text-white">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5 hover:text-forest-300" />}
              </button>
              <button onClick={() => setEditTitle(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
          ) : (
            <button onClick={() => setEditTitle(true)} className="group flex items-center gap-2.5 text-left mb-2">
              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight drop-shadow-lg">
                {activity.title ?? activity.notes ?? 'Escursione'}
              </h1>
              <Pencil className="w-4 h-4 text-white/40 group-hover:text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="text-white/70 text-sm capitalize mb-3">{dateStr} · {timeStr}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <Route className="w-3 h-3" />, v: `${(activity.distanceMeters/1000).toFixed(1)} km` },
              { icon: <Mountain className="w-3 h-3" />, v: `${activity.elevationGain.toFixed(0)} m D+` },
              { icon: <Clock className="w-3 h-3" />, v: formatDuration(activity.totalTimeSeconds) },
              ...(activity.calories > 0 ? [{ icon: <Flame className="w-3 h-3" />, v: `${activity.calories} kcal` }] : []),
            ].map(({ icon, v }) => (
              <span key={v} className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-white font-body tracking-wide">
                {icon} {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PHOTO MOSAIC (quando ci sono foto e contenuto) ══ */}
      {photos.length >= 2 && content && (
        <div className="flex h-28 overflow-hidden print:hidden">
          {photos.slice(1, 5).map((ph) => (
            <button key={ph.id} onClick={() => setLightbox(ph)}
              className="flex-1 overflow-hidden hover:scale-[1.02] transition-transform">
              <img src={ph.dataUrl} alt={ph.caption}
                className="w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
            </button>
          ))}
        </div>
      )}

      {/* ══ RATING PANEL ══ */}
      {showRatingPanel && (
        <div className="bg-forest-900 border-b border-forest-800 text-white">
          <div className="max-w-6xl mx-auto px-4 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-forest-200">
                {rated ? `Voto attuale: ${activity.userRating}/10` : 'Dai il tuo voto di bellezza'}
              </p>
              <button onClick={() => setShowRatingPanel(false)} className="text-forest-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-4 max-w-sm">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const sel = n === ratingVal
                return (
                  <button key={n} onClick={() => setRatingVal(n)}
                    style={sel ? { backgroundColor: ratingColor(n) } : {}}
                    className={`flex-1 aspect-square rounded-xl text-sm font-bold transition-all
                      ${sel ? 'text-white scale-110 shadow-lg' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                    {n}
                  </button>
                )
              })}
            </div>
            <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)}
              placeholder="Nota (opzionale)…" rows={2}
              className="w-full max-w-lg bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-white/40 mb-3" />
            <div className="flex gap-2">
              <button onClick={saveRating} disabled={savingRating || ratingVal === 0}
                className="flex items-center gap-2 px-5 py-2 bg-forest-500 hover:bg-forest-400 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">
                {savingRating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {rated ? 'Aggiorna' : 'Salva voto'}
              </button>
              <button onClick={() => setShowRatingPanel(false)} className="px-4 py-2 text-sm text-forest-400 hover:text-white">Annulla</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Share resoconto PDF panel */}
      {showShareReport && (
        <div className="bg-white border-b border-stone-100 print:hidden">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
            {sharePdfUrl ? (
              <>
                <a href={`/leggi/r/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-body font-bold uppercase tracking-wide transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                </a>
                <button
                  onClick={async () => {
                    const viewerUrl = `${window.location.origin}/leggi/r/${encodeURIComponent(id)}`
                    await navigator.clipboard.writeText(viewerUrl)
                    setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-body font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                </button>
                <a href={sharePdfUrl} target="_blank" rel="noopener noreferrer" download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-body font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> PDF diretto
                </a>
                <button
                  onClick={async () => {
                    await fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`, { method: 'DELETE' })
                    setSharePdfUrl(null)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-body font-bold uppercase tracking-wide hover:bg-red-50 transition-colors">
                  <Link2Off className="w-3.5 h-3.5" /> Disattiva
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-500 font-display italic">Genera un PDF con le foto e pubblicalo online.</p>
                {publishError && <p className="text-xs text-red-500">{publishError}</p>}
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
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-body font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                  {publishing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</>
                    : <><Share2 className="w-3.5 h-3.5" /> Genera e pubblica</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB BAR ══ */}
      <div className="sticky top-14 z-30 bg-white border-b border-stone-200 shadow-sm print:hidden">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center">
            {([
              { key: 'resoconto', label: 'Resoconto' },
              { key: 'dati', label: 'Dati tecnici' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-forest-600 text-forest-700'
                    : 'border-transparent text-stone-500 hover:text-stone-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Tab-specific actions */}
          <div className="flex items-center gap-1.5">
            {activeTab === 'resoconto' ? (
              <>
                <button onClick={() => setShowShareReport(s => !s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showShareReport ? 'bg-forest-100 text-forest-700' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'}`}>
                  <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pubblica PDF</span>
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-medium transition-colors">
                  <FileDown className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Stampa PDF</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowRatingPanel(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-medium transition-colors">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">{rated ? `${activity.userRating}/10` : 'Voto'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ══ TAB: RESOCONTO ══ */}
      {activeTab === 'resoconto' && (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 fade-up">

          {/* Generate controls */}
          <div className="mb-6 print:hidden">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="font-body font-bold text-stone-700 uppercase tracking-wide text-sm mb-1">
                    {content ? 'Genera nuovo resoconto' : 'Genera il tuo resoconto'}
                  </p>
                  <p className="text-xs text-stone-400 font-display italic">
                    {photos.length > 0
                      ? `${photos.length} foto disponibili · L'AI userà le tue immagini`
                      : 'Aggiungi foto dalla mappa 3D per un resoconto più ricco'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-xl overflow-hidden border border-stone-200">
                    {(['breve', 'media', 'lunga'] as const).map(l => (
                      <button key={l} onClick={() => setLength(l)}
                        className={`px-3 py-1.5 text-xs font-body font-bold uppercase tracking-wide transition-colors
                          ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShow3D(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-body font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                    <Images className="w-3.5 h-3.5" /> Mappa 3D
                  </button>
                  <button onClick={generateReport} disabled={generating}
                    className="flex items-center gap-2 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-body font-bold uppercase tracking-wide transition-colors">
                    {generating
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</>
                      : <><BookOpen className="w-4 h-4" /> Genera</>
                    }
                  </button>
                </div>
              </div>
              {apiError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{apiError}</div>
              )}
              {/* Cover photo picker */}
              {photos.length > 0 && (
                <div className="border-t border-stone-100 pt-4 mt-4">
                  <p className="font-body text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
                    Immagine di copertina
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.map(ph => (
                      <button key={ph.id}
                        onClick={() => {
                          setCoverPhotoId(ph.id)
                          localStorage.setItem(`dtrek_cover_${id}`, ph.id)
                        }}
                        className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                          (coverPhotoId ?? photos[0]?.id) === ph.id
                            ? 'border-amber-400 shadow-md'
                            : 'border-transparent hover:border-stone-300'
                        }`}>
                        <img src={ph.dataUrl} alt={ph.caption} className="w-16 h-16 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Empty state */}
          {!content && !generating && (
            <div className="flex flex-col items-center py-20 text-stone-400 print:hidden">
              <BookOpen className="w-12 h-12 mb-4 opacity-30" />
              <p className="font-body uppercase tracking-wide text-sm">Nessun resoconto ancora</p>
              <p className="font-display text-sm italic mt-1">Clicca "Genera" per creare il tuo racconto</p>
            </div>
          )}

          {/* Streaming indicator */}
          {generating && !sections.length && (
            <div className="flex items-center gap-3 py-8 text-stone-500 print:hidden">
              <Loader2 className="w-5 h-5 animate-spin text-forest-500" />
              <span className="font-display italic text-sm">Giulia sta scrivendo il tuo resoconto…</span>
            </div>
          )}

          {/* Edit toggle */}
          {content && (
            <div className="flex items-center justify-between mb-5 print:hidden">
              <div className="flex items-center gap-2">
                {report?.updated_at && (
                  <span className="font-display text-xs italic text-stone-400">
                    Salvato {format(new Date(report.updated_at), "d MMM · HH:mm", { locale: it })}
                  </span>
                )}
                {savingReport && (
                  <span className="flex items-center gap-1 font-display text-xs italic text-stone-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
                  </span>
                )}
                {saveOk && (
                  <span className="flex items-center gap-1 font-display text-xs text-forest-600">
                    <Check className="w-3 h-3" /> Salvato
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (isEditing) { saveContent(content); setIsEditing(false) }
                  else setIsEditing(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-body font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                {isEditing
                  ? <><Check className="w-3.5 h-3.5" /> Fatto</>
                  : <><Pencil className="w-3.5 h-3.5" /> Modifica</>
                }
              </button>
            </div>
          )}

          {/* Edit textarea */}
          {isEditing && (
            <div className="mb-6 print:hidden">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={30}
                className="w-full bg-white border border-stone-200 rounded-2xl p-5 font-mono text-sm text-stone-700 leading-relaxed outline-none focus:border-forest-400 resize-y shadow-sm"
                placeholder="Scrivi il resoconto in Markdown…"
              />
            </div>
          )}

          {/* Rendered sections */}
          {!isEditing && (() => {
            const miniMapNode = activity.trackPoints.length > 4 ? (
              <div className="float-right ml-5 mb-4 w-52 shrink-0 hidden md:block print:block">
                <div className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                  <RoutePhotoMap trackPoints={activity.trackPoints} photos={photos} height="170px" />
                  {photos.length > 0 && (
                    <div className="px-2 pt-1 pb-2 space-y-0.5">
                      {photos.slice(0, 7).map((ph, i) => (
                        <div key={ph.id} className="flex items-center gap-1.5">
                          <span className="w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shrink-0 font-body">
                            {i + 1}
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
              <>
                {sections.map((section, i) => (
                  <SectionCard
                    key={i}
                    section={section}
                    index={i}
                    photo={i === 0 ? undefined : photos[i]}
                    photoIndex={i === 0 ? undefined : i + 1}
                    floatNode={i === 0 ? miniMapNode : undefined}
                  />
                ))}
                {sections.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-5 print:rounded-none print:shadow-none print:border-0 print:border-t print:border-stone-200">
                    <h3 className="font-body font-bold uppercase tracking-[2px] text-xs text-stone-400 mb-3">
                      Profilo altimetrico
                    </h3>
                    <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />
                  </div>
                )}
              </>
            )
          })()}

          {/* Streaming raw text */}
          {generating && !sections.length && content && (
            <div className="bg-white rounded-2xl shadow-sm p-6 print:hidden">
              <p className="font-display text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{content}</p>
            </div>
          )}

          {/* Photo gallery */}
          {photos.length > 0 && content && (
            <section className="mt-8 print:hidden">
              <h3 className="font-body font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">Le tue foto</h3>
              <div className="flex gap-3 overflow-x-auto pb-3">
                {photos.map((ph, i) => (
                  <button key={ph.id} onClick={() => setLightbox(ph)}
                    className="shrink-0 w-36 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                    <div className="relative">
                      <img src={ph.dataUrl} alt={ph.caption}
                        className="w-36 h-28 object-cover group-hover:scale-105 transition-transform duration-300" />
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-body">
                        {i + 1}
                      </span>
                    </div>
                    {ph.caption && (
                      <p className="px-2 py-1.5 font-display text-[10px] italic text-stone-500 leading-snug bg-white">
                        {i + 1}. {ph.caption}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Print-only photo grid */}
          {photos.length > 0 && content && (
            <section className="hidden print:block mt-6 pt-4 border-t border-stone-200">
              <h3 className="font-body font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">Documentazione fotografica</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                {photos.map((ph, i) => (
                  <div key={ph.id} style={{ breakInside: 'avoid' }}>
                    <div style={{ position: 'relative' }}>
                      <img src={ph.dataUrl} alt={ph.caption}
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
                      <span style={{
                        position: 'absolute', top: 6, left: 6, width: 18, height: 18, background: '#f59e0b',
                        color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 8, fontWeight: 'bold', border: '2px solid white',
                      }}>{i + 1}</span>
                    </div>
                    {ph.caption && (
                      <p style={{ fontSize: 9, color: '#78716c', fontStyle: 'italic', marginTop: 4, textAlign: 'center', lineHeight: 1.4 }}>
                        {i + 1}. {ph.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

        </main>
      )}

      {/* ══ TAB: DATI TECNICI ══ */}
      {activeTab === 'dati' && (
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 fade-up space-y-6 sm:space-y-8">

          {/* Title/tags edit (inline) */}
          <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold text-stone-700">Dettagli</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRatingPanel(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-xl text-sm font-medium transition-all">
                  <Star className="w-4 h-4 text-amber-400" />
                  {rated ? <span style={{ color: ratingColor(activity.userRating!) }}>{activity.userRating}/10 · {ratingLabel(activity.userRating!)}</span>
                         : <span className="text-stone-500">Vota bellezza</span>}
                </button>
              </div>
            </div>
            {activity.device && <p className="text-stone-400 text-xs mb-3">📱 {activity.device}</p>}
            <div className="flex items-center flex-wrap gap-2">
              {(activity.tags ?? []).map(tag => (
                <span key={tag} className="flex items-center gap-1 bg-forest-50 text-forest-700 rounded-full px-3 py-0.5 text-xs border border-forest-200">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="+ tag"
                className="bg-stone-50 text-stone-600 placeholder-stone-400 rounded-full px-3 py-0.5 text-xs w-20 outline-none border border-stone-200 focus:border-forest-400" />
            </div>
          </section>

          {/* Photos */}
          <ActivityPhotoManager
            activityId={id}
            trackPoints={activity.trackPoints}
            activityTitle={activity.title ?? activity.notes ?? undefined}
            distanceMeters={activity.distanceMeters}
            elevationGain={activity.elevationGain}
          />

          {/* Map */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xl font-semibold text-stone-700">Tracciato GPS</h2>
              <div className="flex items-center gap-2">
                {hasGps && activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
                  <button onClick={() => setShowGradient(g => !g)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${showGradient ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                    <Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Pendenza</span>
                  </button>
                )}
                {hasGps && (
                  <button onClick={() => setShowStreetView(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border bg-white text-stone-600 border-stone-200 hover:bg-stone-50 transition-colors">
                    <Images className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Foto zona</span>
                  </button>
                )}
                {hasGps && (
                  <button onClick={() => setShow3D(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border bg-white text-stone-600 border-stone-200 hover:bg-stone-50 transition-colors">
                    <Box className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Vista 3D</span>
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
              <MapView trackPoints={activity.trackPoints} height="360px" showGradient={showGradient} pois={pois} wikiPages={wikiPages} />
            </div>
            {pois.length > 0 && <p className="text-xs text-stone-400 mt-2">{pois.length} punti di interesse trovati</p>}
          </section>

          {/* Comfort TrailScore */}
          {hasGps && (
            <section className="space-y-2">
              <h2 className="font-display text-xl font-semibold text-stone-700">Comfort TrailScore</h2>
              {(ctsResult || (activity as StoredActivity & { trailScore?: number }).trailScore != null) ? (
                <ComfortTrailScoreWidget
                  result={ctsResult}
                  cached={(activity as StoredActivity & { trailScore?: number }).trailScore}
                  beautyScore={(activity as StoredActivity & { linkedBeautyScore?: BeautyScore }).linkedBeautyScore}
                />
              ) : (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-stone-500">Il punteggio non è ancora stato calcolato per questa escursione.</p>
                  <button
                    onClick={handleComputeCts}
                    disabled={ctsComputing}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                    {ctsComputing
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</>
                      : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>
                    }
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Stats cards */}
          {(() => {
            const hasHR  = (activity.avgHeartRate ?? 0) > 0
            const hasCal = (activity.calories ?? 0) > 0
            const cols   = 4 + (hasHR ? 1 : 0) + (hasCal ? 1 : 0)
            const gridCls = cols === 6
              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3'
              : cols === 5
              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3'
              : 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3'
            return (
              <div className={gridCls}>
                <StatCard label="Distanza"     value={`${(activity.distanceMeters/1000).toFixed(2)} km`} color="forest" icon={<Route className="w-3.5 h-3.5" />} />
                <StatCard label="Durata"       value={formatDuration(activity.totalTimeSeconds)} color="terra" icon={<Clock className="w-3.5 h-3.5" />} />
                {hasHR && <StatCard label="FC Media"   value={`${activity.avgHeartRate} bpm`} sub={`Max ${activity.maxHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5" />} />}
                <StatCard label="Vel. Media"   value={`${msToKmh(activity.avgSpeedMs)} km/h`} sub={`Max ${msToKmh(activity.maxSpeedMs)} km/h`} color="blue" icon={<Zap className="w-3.5 h-3.5" />} />
                <StatCard label="Dislivello ↑" value={`${activity.elevationGain.toFixed(0)} m`} sub={`↓ ${activity.elevationLoss.toFixed(0)} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5" />} />
                {hasCal && <StatCard label="Calorie" value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />}
              </div>
            )
          })()}

          {/* Weather */}
          {hasGps && <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />}

          {/* Charts */}
          {(() => {
            const hasHRData = activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0)
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                {hasHRData && (
                  <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
                    <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                      <Heart className="w-4 h-4 text-red-400" /> Frequenza Cardiaca
                    </h3>
                    <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
                  </div>
                )}
                <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
                  <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                    <Mountain className="w-4 h-4 text-forest-500" /> Profilo Altimetrico
                  </h3>
                  <AltimetryChart trackPoints={activity.trackPoints} />
                </div>
                <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
                  <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-terra-400" /> Velocità
                  </h3>
                  <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
                </div>
                <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
                  <h3 className="text-sm font-semibold text-stone-600 mb-4">Misure</h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      ['Passo medio', formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
                      ['Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`],
                      ['Quota minima', `${activity.altitudeMin.toFixed(1)} m`],
                      ['Quota massima', `${activity.altitudeMax.toFixed(1)} m`],
                      ['Trackpoint', activity.trackPoints.length.toLocaleString('it')],
                      ['Sport', activity.sport],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-stone-200 py-1">
                        <dt className="text-stone-400 text-xs">{k}</dt>
                        <dd className="font-mono text-stone-700 text-xs font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )
          })()}

          {/* Note personali */}
          <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-stone-600">Note personali</h3>
              {!editNotes && (
                <button onClick={() => setEditNotes(true)} className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Modifica
                </button>
              )}
            </div>
            {editNotes ? (
              <div>
                <textarea value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4}
                  placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                  className="w-full border border-stone-200 rounded-xl p-3 text-stone-700 text-sm outline-none focus:border-forest-400 resize-none bg-white" autoFocus />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveNotes} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors disabled:opacity-60">
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                  </button>
                  <button onClick={() => setEditNotes(false)}
                    className="px-4 py-1.5 border border-stone-200 text-stone-500 rounded-lg text-sm hover:bg-stone-50 transition-colors">
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-sm leading-relaxed ${activity.userNotes ? 'text-stone-600' : 'text-stone-400 italic'}`}>
                {activity.userNotes || 'Nessuna nota. Clicca "Modifica" per aggiungere appunti.'}
              </p>
            )}
          </section>

          {/* Wikipedia */}
          {hasGps && (
            <section>
              <h2 className="font-display text-xl font-semibold text-stone-700 mb-4">Luoghi nelle vicinanze</h2>
              <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
            </section>
          )}

        </main>
      )}

      {/* ══ OVERLAYS ══ */}
      {show3D && (
        <RouteMap3D trackPoints={activity.trackPoints} title={activity.title ?? activity.notes}
          onClose={() => setShow3D(false)} plannedTrackPoints={activity.linkedPlannedTrackPoints}
          activityId={activity.id} distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain} />
      )}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={activity.title ?? undefined}
          onClose={() => setShowStreetView(false)} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 print:hidden"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.caption} className="w-full rounded-2xl shadow-2xl" />
            {lightbox.caption && (
              <p className="font-display text-sm italic text-white/70 text-center mt-3">{lightbox.caption}</p>
            )}
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
              : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1b4332,#40916c)' }} />
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
