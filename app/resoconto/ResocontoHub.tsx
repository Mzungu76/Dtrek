'use client'
import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import RouteHub from '@/components/routehub/RouteHub'
import SectionSplit from '@/components/routehub/SectionSplit'
import { useCenteredItem } from '@/components/routehub/useCenteredItem'
import type { RouteHubItem, SectionKind } from '@/components/routehub/types'
import { wmoInfo } from '@/lib/openmeteo'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import { ScoreRing } from '@/components/ScoreRing'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import {
  getActivityById, updateActivityMeta, deleteActivity, getAllActivities,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, type TrailScoreResult, type CtsConfidence } from '@/lib/trailScore'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { exportActivityPdf } from '@/utils/pdfExport'
import { type PoiItem, POI_META } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { computeDEP, depLabel, findSimilarActivities } from '@/lib/stats'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import {
  FileSpreadsheet, FileText, Map, FileDown,
  Route, TrendingUp, Clock, Flame, Heart, Zap,
  Pencil, Trash2, Loader2, Share2, Layers, Box, Images, RefreshCw, BookOpen, Film, Compass, Leaf, Camera, PawPrint, X,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'
import HikeNotesRecorder from '@/app/components/HikeNotesRecorder'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { PhenologyPanel } from '@/components/PhenologyPanel'
import { useSentinel2 } from '@/lib/cl/useCL'
import { useFlora } from '@/lib/useFlora'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const FloraGallery    = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery   = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

function ratingColor(n: number) {
  return n >= 9 ? '#16a34a' : n >= 7 ? '#65a30d' : n >= 5 ? '#ea580c' : '#dc2626'
}

const COVER_FETCH_CAP = 40

function metaToItem(a: ActivityMeta): RouteHubItem {
  return {
    id: a.id,
    title: a.title ?? 'Escursione',
    polyline: a.routePolyline,
    statPills: [
      { icon: Route,      label: `${(a.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp, label: `+${Math.round(a.elevationGain)} m` },
      { icon: Clock,      label: formatDuration(a.totalTimeSeconds) },
    ],
  }
}

export default function ResocontoHub({ id }: { id?: string }) {
  const router = useRouter()

  const [rawActivities, setRawActivities] = useState<ActivityMeta[]>([])
  const [items,      setItems]      = useState<RouteHubItem[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [covers,     setCovers]     = useState<Record<string, string>>({})
  const [currentId,  setCurrentId]  = useState<string | null>(id ?? null)
  const [activity,   setActivity]   = useState<StoredActivity | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [notesVal,   setNotesVal]   = useState('')
  const [editNotes,  setEditNotes]  = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect,   setShowAspect]   = useState(false)
  const [dtmProfile,      setDtmProfile]     = useState<TrailDtmProfile | undefined>(undefined)
  const [terrainProfile,  setTerrainProfile] = useState<TrailTerrainProfile | undefined>(undefined)
  const [inProtectedArea, setInProtectedArea] = useState<boolean | undefined>(undefined)
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
  const [showShare,       setShowShare]       = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [ctsResult,       setCtsResult]       = useState<TrailScoreResult | null>(null)
  const [ctsComputing,    setCtsComputing]    = useState(false)
  const [prefsLoaded,     setPrefsLoaded]     = useState(false)
  const [prefSforzo,      setPrefSforzo]      = useState(50)
  const [prefDurata,      setPrefDurata]      = useState(270)

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  const s2    = useSentinel2({ polyline: heroPolyline })
  const flora = useFlora(heroPolyline, activity?.altitudeMax)
  const poiCenter = useCenteredItem(pois.length)
  const [altActiveIndex, setAltActiveIndex] = useState<number | null>(null)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)

  // Lightweight list of all completed hikes, most recent first — backs the carousel/gallery.
  useEffect(() => {
    getAllActivities().then(list => {
      const sorted = list.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      setRawActivities(sorted)
      setItems(sorted.map(metaToItem))
    }).catch(() => setItems([])).finally(() => setListLoaded(true))
  }, [])

  // Background best-effort cover-photo fetch for the gallery/carousel thumbnails (capped —
  // this is a nice-to-have visual enhancement, not core functionality).
  useEffect(() => {
    if (rawActivities.length === 0) return
    let cancelled = false
    rawActivities.slice(0, COVER_FETCH_CAP).forEach(a => {
      fetchActivityPhotos(a.id).then(ph => {
        if (cancelled || !ph[0]) return
        setCovers(prev => prev[a.id] ? prev : { ...prev, [a.id]: ph[0].url })
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [rawActivities])

  useEffect(() => {
    if (currentId || items.length === 0) return
    setCurrentId(items[0].id)
  }, [items, currentId])

  useEffect(() => {
    if (!currentId) return
    const loadPoisFor = (a: StoredActivity) => {
      const gps = a.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined).map(p => [p.lat!, p.lon!] as [number, number])
      if (gps.length === 0) return
      const bbox = computeBbox(gps)
      fetch(`/api/pois?bbox=${bbox}`)
        .then(r => r.json())
        .then((all: PoiItem[]) => {
          const nearby = all.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
            .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
          setPois(nearby)
        })
        .catch(() => {})
    }
    setPois([]); setPhotos([]); setCoverPhotoId(null)
    getActivityById(currentId, fresh => { setActivity(fresh); loadPoisFor(fresh) }).then(a => {
      if (!a) { router.push('/resoconto'); return }
      setActivity(a)
      setNotesVal(a.userNotes ?? '')
      setRatingVal(a.userRating ?? 0)
      setRatingNote(a.userRatingNote ?? '')
      loadPoisFor(a)
    })
    fetchActivityPhotos(currentId).then(setPhotos).catch(() => {})
    const savedCover = localStorage.getItem(`dtrek_cover_${currentId}`)
    if (savedCover) setCoverPhotoId(savedCover)
  }, [currentId, router])

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).then((p: TrailDtmProfile) => setDtmProfile(p)).catch(() => {})
  }, [activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).then((p: TrailTerrainProfile) => setTerrainProfile(p)).catch(() => {})
  }, [activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    checkProtectedArea(gps).then(r => setInProtectedArea(r.inProtectedArea)).catch(() => {})
  }, [activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/user-settings').then(r => r.json()).then(d => {
      if (d.prefSforzo != null) setPrefSforzo(d.prefSforzo)
      if (d.prefDurata != null) setPrefDurata(d.prefDurata)
    }).catch(() => {}).finally(() => setPrefsLoaded(true))
  }, [])

  useEffect(() => {
    const bs = activity?.linkedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded || !activity) return
    const computed = computeTrailScore(bs, {
      distanceMeters: activity.distanceMeters, elevationGain: activity.elevationGain,
      elevationLoss: activity.elevationLoss ?? 0, altitudeMax: activity.altitudeMax,
      avgHeartRate: activity.avgHeartRate, prefSforzo, prefDurata,
    })
    setCtsResult({ ...computed, ts: activity.trailScore ?? computed.ts })
  }, [activity?.id, prefsLoaded, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps

  const similarActivities = useMemo(() => {
    if (!activity) return []
    const startPt = activity.trackPoints.find(p => p.lat !== undefined && p.lon !== undefined)
    if (!startPt) return []
    return findSimilarActivities(
      { id: activity.id, distanceMeters: activity.distanceMeters, startLat: startPt.lat!, startLon: startPt.lon! },
      rawActivities,
    )
  }, [activity, rawActivities])

  const weatherIcon = useMemo(() => {
    if (!activity?.weatherAtHike) return null
    const info = wmoInfo(activity.weatherAtHike.weathercode)
    return { emoji: info.emoji, label: info.label }
  }, [activity])

  const displayItems = useMemo(() => {
    const pillsFor = (a: StoredActivity) => [
      { icon: Route,      label: `${(a.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp, label: `+${Math.round(a.elevationGain)} m` },
      { icon: Clock,      label: formatDuration(a.totalTimeSeconds) },
      ...((a.calories ?? 0) > 0 ? [{ icon: Flame, label: `${a.calories} kcal` }] : []),
    ]
    const cover = (id_: string) => covers[id_] ?? (id_ === activity?.id ? photos.find(p => p.id === coverPhotoId)?.url ?? photos[0]?.url : undefined)
    const mapped = items.map(it => it.id === activity?.id
      ? { ...it, statPills: pillsFor(activity), coverPhotoUrl: cover(it.id) }
      : (cover(it.id) ? { ...it, coverPhotoUrl: cover(it.id) } : it))
    if (activity && !mapped.some(it => it.id === activity.id)) {
      return [{ id: activity.id, title: activity.title ?? 'Escursione', polyline: activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]), statPills: pillsFor(activity), coverPhotoUrl: cover(activity.id) }, ...mapped]
    }
    return mapped
  }, [items, covers, activity, photos, coverPhotoId])

  if (!listLoaded) {
    return (
      <div className="fixed inset-0 bg-forest-950 flex items-center justify-center text-stone-300 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
      </div>
    )
  }
  if (!currentId) {
    return (
      <div className="fixed inset-0 bg-forest-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-stone-300 text-sm">Nessuna escursione conclusa.</p>
        <button onClick={() => router.push('/upload?tab=activity')} className="px-5 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Carica un&apos;escursione
        </button>
      </div>
    )
  }
  if (displayItems.length === 0) {
    return (
      <div className="fixed inset-0 bg-forest-950 flex items-center justify-center text-stone-300 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
      </div>
    )
  }

  const patch = async (data: Parameters<typeof updateActivityMeta>[1]) => {
    if (!activity) return
    setSaving(true)
    try { await updateActivityMeta(activity.id, data); setActivity(prev => prev ? { ...prev, ...data } : prev) }
    finally { setSaving(false) }
  }
  const saveNotes  = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  const saveRating = async () => {
    if (!activity || !ratingVal) return
    setSavingRating(true)
    try {
      await updateActivityMeta(activity.id, { userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined })
      setActivity(prev => prev ? { ...prev, userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined } : prev)
      setShowRatingPanel(false)
    } finally { setSavingRating(false) }
  }
  const setCover = (photoId: string | null) => {
    if (!activity) return
    setCoverPhotoId(photoId)
    if (photoId) localStorage.setItem(`dtrek_cover_${activity.id}`, photoId)
    else localStorage.removeItem(`dtrek_cover_${activity.id}`)
    setShowCoverPicker(false)
  }
  const handleDelete = async () => {
    if (!activity || !confirm('Eliminare questa escursione dal diario?')) return
    setSaving(true)
    await deleteActivity(activity.id)
    router.push('/resoconto')
  }

  const handleComputeCts = async () => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      const deadline = new Promise<null>(r => setTimeout(() => r(null), 25000))
      const bbox = computeBbox(gps)
      const [allPoisRes, osmData] = await Promise.all([
        Promise.race([fetch(`/api/pois?bbox=${bbox}`).then(r => r.json()) as Promise<PoiItem[]>, deadline]).then(r => r ?? []),
        Promise.race([fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>, deadline]).then(r => r ?? undefined).catch(() => undefined),
      ])
      const allPois = allPoisRes as PoiItem[]
      const poisNear = allPois.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
        .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
      const elevProfile = activity.trackPoints.filter(p => p.lat && p.lon).map(p => p.altitudeMeters ?? 0)
      const tei = computeTEI({
        track: gps, elevGain: activity.elevationGain, distanceMeters: activity.distanceMeters, altitudeMax: activity.altitudeMax,
        elevProfile, pois: poisNear, osmData, dtmProfile, terrainProfile, inProtectedArea,
      })
      const bs = teiToBeautyScore(tei)
      const confidence: CtsConfidence = tei.confidence
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      let { ts } = computeTrailScore(bs, {
        distanceMeters: activity.distanceMeters, elevationGain: activity.elevationGain, elevationLoss: activity.elevationLoss ?? 0,
        altitudeMax: activity.altitudeMax, avgHeartRate: activity.avgHeartRate,
        prefSforzo: prefs.prefSforzo, prefDurata: prefs.prefDurata, hrRest: prefs.hrRest, hrMax: prefs.hrMax ?? undefined,
        avgSlopeDeg: dtmProfile?.avgSlopeDeg ?? undefined,
      })
      if (confidence === 'estimated') ts = Math.round(ts * 0.9)
      await updateActivityMeta(activity.id, { linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence })
      setActivity(prev => prev ? { ...prev, linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }

  const gpsPoints = activity?.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const rated     = (activity?.userRating ?? 0) > 0
  const dateISO   = activity ? activity.startTime.slice(0, 10) : undefined

  const renderStageMap = (item: RouteHubItem, interactive: boolean) => {
    if (!activity || item.id !== activity.id) return <div className="absolute inset-0 bg-gradient-to-br from-forest-900 to-forest-950" />
    if (!hasGps) return <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">Tracciato non disponibile</div>
    return (
      <MapView trackPoints={activity.trackPoints} height="100%" interactive={interactive}
        showGradient={showGradient} showAspect={showAspect} dtmProfile={dtmProfile} pois={pois} wikiPages={wikiPages} />
    )
  }

  // Default section map — real, interactive/navigable, no per-section highlight.
  const sectionMap = () => hasGps && activity
    ? <MapView trackPoints={activity.trackPoints} height="100%" interactive pois={pois} />
    : <div className="absolute inset-0 bg-[#0b1a24]" />
  const open3D = (closeSection: () => void) => hasGps ? () => { closeSection(); setShow3D(true) } : undefined

  const ratingBadge = (item: RouteHubItem) => {
    if (!activity || item.id !== activity.id || !rated) return null
    return (
      <span className="flex flex-col items-center justify-center text-white leading-none">
        <span className="text-[15px] font-bold">{activity.userRating}</span>
        <span className="text-[7px] font-medium opacity-70">/10</span>
      </span>
    )
  }

  const renderSection = (section: SectionKind, item: RouteHubItem, onClose: () => void) => {
    if (!activity || item.id !== activity.id) {
      return <SectionSplit title="…" onClose={onClose} mapContent={<div className="absolute inset-0 bg-[#0b1a24]" />}>
        <div className="py-10 text-center text-sm text-stone-400">Caricamento…</div>
      </SectionSplit>
    }

    if (section === 'dati') return (
      <SectionSplit
        title="Dati & punteggi"
        onClose={onClose}
        on3D={open3D(onClose)}
        mapContent={
          <div className="absolute inset-0">
            {sectionMap()}
            <div className="absolute bottom-3 inset-x-3 flex flex-wrap gap-1.5 justify-center pointer-events-none">
              {activity.trailScore != null && (
                <span className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-[11px] font-bold border border-white/15">CTS {Math.round(activity.trailScore)}</span>
              )}
              {rated && (
                <span className="px-2.5 py-1 rounded-full text-white text-[11px] font-bold border border-white/15" style={{ backgroundColor: ratingColor(activity.userRating!) }}>Bellezza {activity.userRating}/10</span>
              )}
            </div>
          </div>
        }
      >
        <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
          {(ctsResult || activity.trailScore != null) ? (
            <ScoreRing
              cl={{ notMatched: true }}
              safety={null}
              cts={{ result: ctsResult, cached: activity.trailScore, beautyScore: activity.linkedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts }}
            />
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-stone-500">Il punteggio non è ancora stato calcolato.</p>
              <button onClick={handleComputeCts} disabled={ctsComputing} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {ctsComputing ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>}
              </button>
            </div>
          )}

          {hasGps && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
                <button onClick={() => { setShowGradient(g => !g); setShowAspect(false) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}>
                  <Layers className="w-3 h-3" /> Pendenza
                </button>
              )}
              {dtmProfile?.source === 'dtm' && (
                <button onClick={() => { setShowAspect(a => !a); setShowGradient(false) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}>
                  <Compass className="w-3 h-3" /> Esposizione
                </button>
              )}
            </div>
          )}

          {(() => {
            const hasHR  = (activity.avgHeartRate ?? 0) > 0
            const hasCal = (activity.calories ?? 0) > 0
            const hasNetSpeed = (activity.netSpeedMs ?? 0) > 0 && (activity.pauseTimeSeconds ?? 0) > 0
            const hasIev = (activity.iev ?? 0) > 0
            const hasHRTrack = activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0)
            const dep = computeDEP(activity.distanceMeters, activity.elevationGain)
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {hasHR && <StatCard label="FC Media" value={`${activity.avgHeartRate} bpm`} sub={`Max ${activity.maxHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5" />} />}
                  <StatCard label="Vel. Media" value={`${msToKmh(activity.avgSpeedMs)} km/h`} sub={`Max ${msToKmh(activity.maxSpeedMs)} km/h`} color="blue" icon={<Zap className="w-3.5 h-3.5" />} />
                  {hasNetSpeed && <StatCard label="Vel. Crociera" value={`${msToKmh(activity.netSpeedMs!)} km/h`} sub={`Pause ${formatDuration(activity.pauseTimeSeconds!)}`} color="blue" />}
                  {hasCal && <StatCard label="Calorie" value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />}
                  <StatCard label="DEP" value={`${dep.toFixed(1)} km`} sub={depLabel(dep)} color="stone" />
                  {hasIev && <StatCard label="Efficienza verticale" value={`${activity.iev!.toFixed(0)} m/min`} color="forest" />}
                </div>
                {hasHRTrack && (
                  <div className="bg-white rounded-2xl border border-stone-200 p-4">
                    <h3 className="text-sm font-semibold text-stone-600 mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-red-400" /> Frequenza cardiaca</h3>
                    <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-stone-200 p-4">
                  <h3 className="text-sm font-semibold text-stone-600 mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-terra-400" /> Velocità</h3>
                  <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
                </div>
                <dl className="bg-white rounded-2xl border border-stone-200 p-4 grid grid-cols-2 gap-x-3 gap-y-1.5">
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
            )
          })()}

          {similarActivities.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-stone-700 mb-2">Percorsi simili</p>
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {similarActivities.slice(0, 5).map(({ activity: a, startDistanceM }) => (
                      <tr key={a.id} className="border-t border-stone-100 first:border-t-0 hover:bg-stone-50 cursor-pointer" onClick={() => router.push(`/resoconto/${a.id}`)}>
                        <td className="px-3 py-2 text-stone-700">{new Date(a.startTime).toLocaleDateString('it-IT')}</td>
                        <td className="px-3 py-2 text-stone-700">{(a.distanceMeters / 1000).toFixed(1)} km</td>
                        <td className="px-3 py-2 text-stone-400">{startDistanceM < 50 ? 'stesso punto' : `${startDistanceM.toFixed(0)} m`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionSplit>
    )

    if (section === 'meteo') return (
      <SectionSplit title="Meteo" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4">
          {hasGps && dateISO
            ? <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />
            : <p className="text-sm text-stone-400 italic text-center py-8">Meteo non disponibile senza un tracciato GPS.</p>}
        </div>
      </SectionSplit>
    )

    if (section === 'natura') return (
      <SectionSplit title="Natura" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
          {hasGps && heroPolyline.length > 1 && <PhenologyPanel data={s2.data} loading={s2.loading} flora={flora.data} floraLoading={flora.loading} />}
          <div className="flex gap-2">
            <button onClick={() => setShowFloraGallery(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
              <Leaf className="w-4 h-4 text-emerald-600" /> Galleria Verde
            </button>
            <button onClick={() => setShowAnimalGallery(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
              <PawPrint className="w-4 h-4 text-amber-600" /> Galleria Animali
            </button>
          </div>
        </div>
      </SectionSplit>
    )

    if (section === 'poi') return (
      <SectionSplit
        title="Punti di interesse"
        onClose={onClose}
        on3D={open3D(onClose)}
        mapContent={hasGps
          ? <MapView trackPoints={activity.trackPoints} height="100%" interactive pois={pois} highlightedPoiIndex={poiCenter.centeredIndex} />
          : <div className="absolute inset-0 bg-[#0b1a24]" />}
      >
        <div ref={poiCenter.containerRef} className="h-full overflow-y-auto px-4 py-4 space-y-3">
          {pois.length === 0 && (
            <p className="text-sm text-stone-400 italic text-center py-8">Nessun punto di interesse trovato lungo il tracciato.</p>
          )}
          {pois.map((poi, i) => {
            const meta = POI_META[poi.type]
            const highlighted = i === poiCenter.centeredIndex
            return (
              <div key={poi.id} ref={poiCenter.setItemRef(i)}
                className={`rounded-2xl border p-4 flex gap-3 transition-colors ${highlighted ? 'bg-forest-50 border-forest-300' : 'bg-white border-stone-200'}`}>
                <span className="w-12 h-12 rounded-xl bg-stone-50 flex items-center justify-center text-2xl shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{meta.label}</span>
                    <span className="text-[10px] text-stone-300 ml-auto shrink-0">{poi.distFromTrack === 0 ? 'sul tracciato' : `${poi.distFromTrack} m`}</span>
                  </div>
                  <p className="text-sm font-semibold text-stone-800 leading-tight">{poi.name ?? meta.label}</p>
                </div>
              </div>
            )
          })}
          {hasGps && <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />}
          {hasGps && (
            <button onClick={() => setShowStreetView(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
              <Images className="w-4 h-4" /> Foto zona (street view)
            </button>
          )}
        </div>
      </SectionSplit>
    )

    if (section === 'sicurezza') return (
      <SectionSplit title="Sicurezza & segnalazioni" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full flex items-center justify-center px-6">
          <p className="text-sm text-stone-400 italic text-center">
            Il punteggio sicurezza è disponibile solo per le guide pre-escursione, non per le escursioni concluse.
          </p>
        </div>
      </SectionSplit>
    )

    if (section === 'altimetria') return (
      <SectionSplit title={item.title} onClose={onClose} on3D={open3D(onClose)} mapContent={
        hasGps
          ? <MapView trackPoints={activity.trackPoints} height="100%" interactive activeIndex={altActiveIndex} />
          : <div className="absolute inset-0 bg-[#0b1a24]" />
      }>
        <div className="h-full flex flex-col px-3 pt-3.5 pb-5">
          <div className="flex items-baseline justify-between px-1.5 pb-2 shrink-0">
            <span className="text-[12px] font-semibold text-stone-300">Profilo altimetrico</span>
          </div>
          <div className="flex-1 min-h-0">
            {activity.trackPoints.length
              ? <ElevationProfileChart trackPoints={activity.trackPoints} onHover={setAltActiveIndex} />
              : <div className="h-full flex items-center justify-center text-stone-400 text-sm">Dati altimetrici non disponibili</div>}
          </div>
        </div>
      </SectionSplit>
    )

    // strumenti
    return (
      <SectionSplit title="Strumenti" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4 space-y-1">
          <ActivityPhotoManager
            activityId={activity.id} trackPoints={activity.trackPoints}
            activityTitle={activity.title ?? undefined}
            distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain}
          />
          <div className="pt-1 mt-1 border-t border-stone-100 space-y-1">
            {photos.length > 0 && (
              <button onClick={() => setShowCoverPicker(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
                <Camera className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Cambia copertina</span>
              </button>
            )}
            <button onClick={() => setShowShare(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <Share2 className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Condividi</span>
            </button>
            <button onClick={() => setShow3D(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <Box className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Vista 3D</span>
            </button>
            <button onClick={() => { setOpenVideoWizard(true); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <Film className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Crea video</span>
            </button>
            <button onClick={() => exportActivityToExcel(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <FileSpreadsheet className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Esporta Excel</span>
            </button>
            <button onClick={() => exportActivityToDoc(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <FileText className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Esporta Word</span>
            </button>
            <button onClick={() => exportActivityToGpx(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <Map className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Esporta GPX</span>
            </button>
            <button onClick={() => exportActivityPdf(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <FileDown className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Esporta PDF</span>
            </button>
          </div>

          <div className="pt-1 mt-1 border-t border-stone-100">
            {editNotes ? (
              <div className="px-2 py-2 space-y-2">
                <textarea autoFocus value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4}
                  placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm text-stone-700 bg-stone-50 outline-none focus:border-forest-400 resize-none" />
                <div className="flex gap-2">
                  <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors disabled:opacity-60">
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                  </button>
                  <button onClick={() => { setNotesVal(activity.userNotes ?? ''); setEditNotes(false) }} className="px-4 py-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">Annulla</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditNotes(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
                <Pencil className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Note personali{activity.userNotes ? '' : ' (vuote)'}</span>
              </button>
            )}
          </div>

          <div className="px-2 pt-2">
            <HikeNotesRecorder notes={activity.hikeNotes ?? []} onChange={hikeNotes => patch({ hikeNotes })} />
          </div>

          <div className="pt-1 mt-1 border-t border-stone-100">
            <button onClick={handleDelete} disabled={saving} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-red-50 transition-colors text-left text-red-600">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span className="text-sm font-medium">Elimina escursione</span>
            </button>
          </div>
        </div>
      </SectionSplit>
    )
  }

  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      <RouteHub
        mode="resoconto"
        items={displayItems}
        initialIndex={initialIndex}
        onIndexChange={(item) => { setCurrentId(item.id); router.replace(`/resoconto/${encodeURIComponent(item.id)}`, { scroll: false }) }}
        renderStageMap={renderStageMap}
        renderSection={renderSection}
        ratingBadge={ratingBadge}
        onOpenRating={() => setShowRatingPanel(true)}
        featuredLabel="Racconto"
        featuredIcon={BookOpen}
        onOpenFeatured={(routeItem) => router.push(`/resoconto/${encodeURIComponent(routeItem.id)}/leggi`)}
        weatherIcon={(routeItem) => activity && routeItem.id === activity.id ? weatherIcon : undefined}
        onOpenMap3D={() => setShow3D(true)}
        onOpenList={() => router.push('/resoconto/elenco')}
      />

      {showRatingPanel && activity && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRatingPanel(false)}>
          <div className="bg-forest-900 text-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-forest-200">{rated ? `Voto attuale: ${activity.userRating}/10` : 'Dai il tuo voto di bellezza'}</p>
              <button onClick={() => setShowRatingPanel(false)} className="text-forest-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2 mb-4">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const sel = n === ratingVal
                return (
                  <button key={n} onClick={() => setRatingVal(n)} style={sel ? { backgroundColor: ratingColor(n) } : {}}
                    className={`flex-1 aspect-square rounded-xl text-sm font-bold transition-all ${sel ? 'text-white scale-110 shadow-lg' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                    {n}
                  </button>
                )
              })}
            </div>
            <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)} placeholder="Nota (opzionale)…" rows={2}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-white/40 mb-3" />
            <div className="flex gap-2">
              <button onClick={saveRating} disabled={savingRating || ratingVal === 0}
                className="flex items-center gap-2 px-5 py-2 bg-forest-500 hover:bg-forest-400 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">
                {savingRating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {rated ? 'Aggiorna' : 'Salva voto'}
              </button>
              <button onClick={() => setShowRatingPanel(false)} className="px-4 py-2 text-sm text-forest-400 hover:text-white">Annulla</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showCoverPicker && activity && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCoverPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm">Scegli la copertina</h3>
              <button onClick={() => setShowCoverPicker(false)} className="text-stone-400 hover:text-stone-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
              <button onClick={() => setCover(null)}
                className={`aspect-square rounded-lg border-2 flex items-center justify-center text-xs text-stone-400 font-medium transition-colors ${!coverPhotoId ? 'border-forest-500 bg-forest-50' : 'border-stone-200 hover:border-forest-300'}`}>
                Predefinita
              </button>
              {photos.map(ph => (
                <button key={ph.id} onClick={() => setCover(ph.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${coverPhotoId === ph.id ? 'border-forest-500' : 'border-stone-200 hover:border-forest-300'}`}>
                  <img src={ph.url} alt={ph.caption ?? ''} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showShare && activity && (() => {
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
          routePolyline: polyline.filter((_, i) => i % step === 0),
          elevationProfile,
        }
        return <ShareModal kind="activity" activity={actMeta} onClose={() => setShowShare(false)} />
      })()}

      {show3D && activity && (
        <RouteMap3D trackPoints={activity.trackPoints} title={activity.title ?? activity.notes}
          onClose={() => { setShow3D(false); setOpenVideoWizard(false) }} plannedTrackPoints={activity.linkedPlannedTrackPoints}
          activityId={activity.id} initialVideoState={openVideoWizard ? 'config' : 'idle'}
          distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain} pois={pois} dtmProfile={dtmProfile} />
      )}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={activity?.title ?? undefined} onClose={() => setShowStreetView(false)} />
      )}

      {showFloraGallery && activity && (
        <FloraGallery
          trackPoints={activity.trackPoints}
          month={new Date(activity.startTime).getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowFloraGallery(false)}
        />
      )}
      {showAnimalGallery && activity && (
        <AnimalGallery
          trackPoints={activity.trackPoints}
          month={new Date(activity.startTime).getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowAnimalGallery(false)}
        />
      )}
    </>
  )
}
