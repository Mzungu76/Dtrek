'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import AltimetryChart from '@/components/AltimetryChart'
import SpeedChart from '@/components/SpeedChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import RouteThumb from '@/components/RouteThumb'
import PhotoMosaic from '@/components/PhotoMosaic'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import {
  getActivityById, updateActivityMeta, deleteActivity,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
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
  Pencil, Check, X, Trash2, Loader2, Share2, Layers, Star, Box, Images, RefreshCw, BookOpen, Film,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })

interface RoutePhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

function ratingColor(n: number) {
  return n >= 9 ? '#16a34a' : n >= 7 ? '#65a30d' : n >= 5 ? '#ea580c' : '#dc2626'
}
function ratingLabel(n: number) {
  return n >= 9 ? 'Eccellente' : n >= 7 ? 'Buono' : n >= 5 ? 'Sufficiente' : 'Insufficiente'
}

function stripReportMarkdown(md: string): string {
  return md
    .replace(/^##\s+/gm, '')
    .replace(/\[curiosita\]|\[\/curiosita\]/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)} [...]` : text
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function EscursionePage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)

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
  const [openVideoWizard, setOpenVideoWizard] = useState(false)
  const [showStreetView,  setShowStreetView]  = useState(false)
  const [photos,          setPhotos]          = useState<RoutePhoto[]>([])
  const [coverPhotoId,    setCoverPhotoId]    = useState<string | null>(null)
  const [lightbox,        setLightbox]        = useState<RoutePhoto | null>(null)
  const [report,          setReport]          = useState<{ content: string } | null>(null)
  const [poiWikiEntries,  setPoiWikiEntries]  = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult,       setCtsResult]       = useState<TrailScoreResult | null>(null)
  const [ctsComputing,    setCtsComputing]    = useState(false)
  const [prefsLoaded,     setPrefsLoaded]     = useState(false)
  const [prefSforzo,      setPrefSforzo]      = useState(50)
  const [prefDurata,      setPrefDurata]      = useState(270)

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])


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

  // Load gallery photos + cover preference + existing report (for hero photo / excerpt)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dtrek_vp_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as RoutePhoto[]
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* ignore */ }

    const savedCover = localStorage.getItem(`dtrek_cover_${id}`)
    if (savedCover) setCoverPhotoId(savedCover)

    fetch(`/api/resoconto?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (d?.content) setReport(d) })
      .catch(() => null)
  }, [id])

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

  // Compute CTS for breakdown display — NEVER saves
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
      const pois = allPois
        .filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
        .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))

      const elevProfile = (activity.trackPoints ?? [])
        .filter(p => p.lat && p.lon)
        .map(p => p.altitudeMeters ?? 0)

      const tei = computeTEI({
        track: gps,
        elevGain: activity.elevationGain,
        distanceMeters: activity.distanceMeters,
        altitudeMax: activity.altitudeMax,
        elevProfile,
        pois,
        osmData,
      })
      const bs = teiToBeautyScore(tei)
      const confidence: CtsConfidence = tei.confidence

      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      let { ts } = computeTrailScore(bs, {
        distanceMeters: activity.distanceMeters,
        elevationGain:  activity.elevationGain,
        elevationLoss:  activity.elevationLoss ?? 0,
        altitudeMax:    activity.altitudeMax,
        avgHeartRate:   activity.avgHeartRate,
        prefSforzo:     prefs.prefSforzo,
        prefDurata:     prefs.prefDurata,
        hrRest:         prefs.hrRest,
        hrMax:          prefs.hrMax ?? undefined,
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

  const dateStr   = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const timeStr   = `${format(new Date(activity.startTime), 'HH:mm')} – ${format(new Date(activity.endTime), 'HH:mm')}`
  const dateISO   = format(new Date(activity.startTime), 'yyyy-MM-dd')
  const gpsPoints = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const rated     = (activity.userRating ?? 0) > 0
  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      {/* ══ HERO ══ */}
      <div className="relative text-white overflow-hidden">
        {heroPhoto ? (
          <>
            <img src={heroPhoto.dataUrl} alt=""
              className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-black/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
        )}
        {!heroPhoto && heroPolyline.length > 1 && (
          <div className="absolute inset-0 pointer-events-none">
            <RouteThumb polyline={heroPolyline} color="rgba(255,255,255,0.10)" strokeWidth={7} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-forest-900/60 to-transparent pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between pt-4 pb-3 border-b border-white/10">
            <button onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-forest-300 hover:text-white text-sm transition-colors">
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
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  {icon}
                </button>
              ))}
              <button
                title="Crea Resoconto"
                onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}`)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Resoconto
              </button>
              <PdfExportButton variant="activity" data={activity} iconOnly
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" />
              <button title="Elimina" onClick={handleDelete} disabled={saving}
                className="w-8 h-8 rounded-lg bg-red-500/25 hover:bg-red-500/45 flex items-center justify-center transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="py-7 flex items-end justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              {editTitle ? (
                <div className="flex items-center gap-2 mb-2">
                  <input value={titleVal} onChange={e => setTitleVal(e.target.value)}
                    className="font-display text-2xl sm:text-3xl bg-white/10 rounded-lg px-3 py-1 text-white outline-none border border-white/30 w-full max-w-md"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }} />
                  <button onClick={saveTitle} disabled={saving}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin text-forest-300" /> : <Check className="w-5 h-5 text-forest-300 hover:text-white" />}
                  </button>
                  <button onClick={() => setEditTitle(false)}><X className="w-5 h-5 text-white/50 hover:text-white" /></button>
                </div>
              ) : (
                <button onClick={() => setEditTitle(true)} className="group flex items-center gap-2.5 text-left mb-2">
                  <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
                    {activity.title ?? activity.notes ?? 'Escursione'}
                  </h1>
                  <Pencil className="w-4 h-4 text-white/40 group-hover:text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}

              <p className="text-forest-300 text-sm capitalize mb-1">{dateStr} · {timeStr}</p>
              {activity.device && <p className="text-forest-400 text-xs mb-3">📱 {activity.device}</p>}

              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { icon: <Route className="w-3.5 h-3.5" />, v: `${(activity.distanceMeters/1000).toFixed(1)} km` },
                  { icon: <Mountain className="w-3.5 h-3.5" />, v: `${activity.elevationGain.toFixed(0)} m D+` },
                  { icon: <Clock className="w-3.5 h-3.5" />, v: formatDuration(activity.totalTimeSeconds) },
                  ...(activity.calories > 0 ? [{ icon: <Flame className="w-3.5 h-3.5" />, v: `${activity.calories} kcal` }] : []),
                ].map(({ icon, v }) => (
                  <span key={v} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 border border-white/15">
                    {icon} {v}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {(activity.tags ?? []).map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-white/10 text-forest-200 rounded-full px-3 py-0.5 text-xs">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="+ tag"
                  className="bg-white/10 text-forest-200 placeholder-forest-500 rounded-full px-3 py-0.5 text-xs w-20 outline-none border border-transparent focus:border-white/30" />
              </div>
            </div>

            {/* Voto bellezza utente */}
            <div className="shrink-0 pb-1">
              {rated ? (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center justify-center rounded-2xl px-5 py-3 shadow-xl"
                      style={{ backgroundColor: ratingColor(activity.userRating!) }}>
                      <span className="text-3xl font-bold leading-none text-white">{activity.userRating}</span>
                      <span className="text-white/60 text-[10px] font-medium mt-0.5">/10</span>
                    </div>
                    <button onClick={() => setShowRatingPanel(v => !v)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors" title="Modifica voto">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-white/90">{ratingLabel(activity.userRating!)}</p>
                  <p className="text-[11px] text-forest-400">Voto bellezza</p>
                  {activity.userRatingNote && (
                    <p className="text-xs text-forest-300 italic max-w-[160px] text-right leading-snug mt-0.5">
                      "{activity.userRatingNote}"
                    </p>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowRatingPanel(v => !v)}
                  className="flex items-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/20 text-sm font-medium transition-all hover:scale-[1.02]">
                  <Star className="w-4 h-4 text-amber-300" /> Voto bellezza
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ PHOTO MOSAIC ══ */}
      {photos.length >= 2 && (
        <PhotoMosaic
          photos={photos.slice(1, 5).map(ph => ({ id: ph.id, url: ph.dataUrl, alt: ph.caption }))}
          onPhotoClick={photoId => {
            const ph = photos.find(p => p.id === photoId)
            if (ph) setLightbox(ph)
          }}
        />
      )}

      {/* ══ RESOCONTO EXCERPT ══ */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {report?.content ? (
            <>
              <h2 className="font-display text-lg font-semibold text-stone-700 mb-2">Resoconto</h2>
              <p className="text-sm text-stone-600 leading-relaxed font-lora">
                {truncate(stripReportMarkdown(report.content), 300)}
              </p>
              <button onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}`)}
                className="flex items-center gap-1.5 mt-3 text-sm font-medium text-forest-600 hover:text-forest-700 transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Leggi tutto
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-stone-500">Non hai ancora un resoconto per questa escursione.</p>
              <button onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}`)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Genera resoconto
              </button>
            </div>
          )}
        </div>
      </div>

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

      {showShare && (() => {
        const polyline = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        const step = Math.max(1, Math.ceil(polyline.length / 250))
        // Downsample altitude track to ~140 points for the share-card elevation profile
        const altPts = activity.trackPoints
          .filter(p => p.altitudeMeters !== undefined)
          .map(p => p.altitudeMeters!)
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
          routePolyline: polyline.filter((_, i) => i % step === 0),
          elevationProfile,
        }
        return <ShareModal kind="activity" activity={actMeta} onClose={() => setShowShare(false)} />
      })()}

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 fade-up space-y-6 sm:space-y-8">

        {/* Stats */}
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
              {hasCal && <StatCard label="Calorie"    value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />}
            </div>
          )
        })()}

        {/* Weather */}
        {hasGps && <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />}

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
              {hasGps && (
                <button onClick={() => { setOpenVideoWizard(true); setShow3D(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-forest-600 text-white hover:bg-forest-700 transition-colors">
                  <Film className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Crea video</span>
                </button>
              )}
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
            <MapView trackPoints={activity.trackPoints} height="360px" showGradient={showGradient} pois={pois} wikiPages={wikiPages} />
          </div>
          {pois.length > 0 && <p className="text-xs text-stone-400 mt-2">{pois.length} punti di interesse trovati</p>}
        </section>

        {/* Charts */}
        {(() => {
          const hasHRData = activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0)
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {hasHRData && (
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-400" /> Frequenza Cardiaca
                  </h3>
                  <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
                </div>
              )}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-forest-500" /> Profilo Altimetrico
                </h3>
                <AltimetryChart trackPoints={activity.trackPoints} />
              </div>
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-stone-600 mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-terra-400" /> Velocità
                </h3>
                <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
              </div>
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-stone-600 mb-4">Dati tecnici</h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
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
                      <dd className="font-mono text-stone-700 text-xs font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )
        })()}

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
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {ctsComputing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</>
                    : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>
                  }
                </button>
              </div>
            )}
          </section>
        )}

        {/* Photos */}
        <ActivityPhotoManager
          activityId={id}
          trackPoints={activity.trackPoints}
          activityTitle={activity.title ?? activity.notes ?? undefined}
          distanceMeters={activity.distanceMeters}
          elevationGain={activity.elevationGain}
        />

        {/* Wikipedia */}
        {hasGps && (
          <section>
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-4">Luoghi nelle vicinanze</h2>
            <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
          </section>
        )}

        {/* Notes */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold text-stone-700">Note personali</h2>
            {!editNotes && (
              <button onClick={() => setEditNotes(true)} className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors">
                <Pencil className="w-4 h-4" /> Modifica
              </button>
            )}
          </div>
          {editNotes ? (
            <div>
              <textarea value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={5}
                placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                className="w-full border border-stone-200 rounded-xl p-3 text-stone-700 text-sm outline-none focus:border-forest-400 resize-none" autoFocus />
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
      </main>

      {show3D && (
        <RouteMap3D trackPoints={activity.trackPoints} title={activity.title ?? activity.notes}
          onClose={() => { setShow3D(false); setOpenVideoWizard(false) }} plannedTrackPoints={activity.linkedPlannedTrackPoints}
          activityId={activity.id} initialVideoState={openVideoWizard ? 'config' : 'idle'}
          distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain} pois={pois} />
      )}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={activity.title ?? undefined}
          onClose={() => setShowStreetView(false)} />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.caption}
              className="w-full rounded-2xl shadow-2xl" />
            {lightbox.caption && (
              <p className="font-lora text-sm italic text-white/70 text-center mt-3">
                {lightbox.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
