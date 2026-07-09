'use client'
import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import RouteHub from '@/components/routehub/RouteHub'
import { useCenteredItem } from '@/components/routehub/useCenteredItem'
import { glassTile, glassTileHover, textPrimary, textMuted, sectionHeading } from '@/components/routehub/overlayTheme'
import type { RouteHubItem, SectionKind, TabDef, PrimaryAction } from '@/components/routehub/types'
import { wmoInfo } from '@/lib/openmeteo'
import RouteMapSection from '@/components/RouteMapSection'
import { extractLeadSubtitle } from '@/lib/extractLeadSubtitle'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import { ScoreRing, MiniScoreRing } from '@/components/ScoreRing'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import {
  getActivityById, updateActivityMeta, deleteActivity, getAllActivities,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { exportActivityPdf } from '@/utils/pdfExport'
import { type PoiItem, POI_META } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeDEP, depLabel, findSimilarActivities } from '@/lib/stats'
import { computeBbox, minDistToTrack, haversineM } from '@/lib/geoUtils'
import { getUserStartingPoint } from '@/lib/drivingInfo'
import { computeCtsForActivity } from '@/lib/computeCtsForActivity'
import { isScoreFresh } from '@/lib/scoreFreshness'
import {
  FileSpreadsheet, FileText, Map, FileDown,
  Route, TrendingUp, Clock, Flame, Heart, Zap,
  Pencil, Trash2, Loader2, Share2, Layers, Box, Images, RefreshCw, BookOpen, Film, Compass, Leaf, Camera, PawPrint, X, MapPin,
  BarChart2, ShieldAlert, Wrench, Star, Mountain, Car,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'
import HikeNotesRecorder from '@/app/components/HikeNotesRecorder'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { PhenologyPanel } from '@/components/PhenologyPanel'
import { useSentinel2 } from '@/lib/cl/useCL'
import { useFlora } from '@/lib/useFlora'
import { useDtmProfile } from './useDtmProfile'
import { useTerrainProfile } from './useTerrainProfile'
import { useProtectedAreaCheck } from './useProtectedAreaCheck'
import { useDrivingDistance } from './useDrivingDistance'
import { useUserPrefs } from '@/lib/useUserPrefs'

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
    sortValues: {
      date: new Date(a.startTime).getTime(),
      km: a.distanceMeters,
      dplus: a.elevationGain,
      cts: a.trailScore,
      rating: a.userRating,
    },
    // Manual rating stands in for a computed score here — a completed hike's own vote is more
    // meaningful than an estimate, and it's already known for every item with no extra fetch.
    scorePreview: a.userRating != null ? { value: a.userRating, max: 10, color: ratingColor(a.userRating) } : undefined,
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
  const [pois,            setPois]           = useState<PoiItem[]>([])
  const [poisLoaded,      setPoisLoaded]     = useState(false)
  const [, setWikiPages] = useState<WikiPage[]>([])
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

  const dtmProfile      = useDtmProfile(activity)
  const terrainProfile  = useTerrainProfile(activity)
  const inProtectedArea = useProtectedAreaCheck(activity)
  const driving         = useDrivingDistance(activity)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)
  // Indirizzo/punto di partenza salvato nelle impostazioni — usato per la distanza in linea
  // d'aria mostrata tra i dati di ogni scheda e come filtro di ordinamento della galleria.
  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  const s2    = useSentinel2({ polyline: heroPolyline })
  const flora = useFlora(heroPolyline, activity?.altitudeMax)
  const poiCenter = useCenteredItem(pois.length)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)

  // Lightweight list of all completed hikes, most recent first — backs the carousel/gallery.
  useEffect(() => {
    // getAllActivities() is stale-while-revalidate: it resolves instantly with last visit's
    // locally cached list, then fetches the real one in the background. Without onRefresh, that
    // fresh fetch (with up-to-date trailScore/userRating) is saved to the local cache for next
    // time but never reaches this session's `items` — so the gallery stays a visit behind.
    const applyList = (list: ActivityMeta[]) => {
      const sorted = list.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      setRawActivities(sorted)
      setItems(sorted.map(metaToItem))
    }
    getAllActivities(applyList).then(applyList).catch(() => setItems([])).finally(() => setListLoaded(true))
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
      if (gps.length === 0) { setPoisLoaded(true); return }
      const bbox = computeBbox(gps)
      fetch(`/api/pois?bbox=${bbox}`)
        .then(r => r.json())
        .then((all: PoiItem[]) => {
          const nearby = all.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
            .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
          setPois(nearby)
        })
        .catch(() => {})
        .finally(() => setPoisLoaded(true))
    }
    setPois([]); setPoisLoaded(false); setPhotos([]); setCoverPhotoId(null)
    // No onRefresh callback here: getActivityById already persists the background-revalidated
    // copy to the local cache for next time. Wiring it into setActivity too would re-apply the
    // full activity (new object/array references) a second time once the network round-trip
    // completes — a visible re-render "blink" ~1s after the card already opened correctly.
    getActivityById(currentId).then(a => {
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

  // Cover subtitle for the magazine closed-card — heuristic (not AI-authored like Guida's, see
  // lib/extractLeadSubtitle.ts) lead-paragraph extraction from the resoconto narrativo, if one has
  // already been generated (app/resoconto/[id]/RacconContent.tsx owns that generation flow).
  const [coverSubtitle, setCoverSubtitle] = useState<string | undefined>(undefined)
  useEffect(() => {
    setCoverSubtitle(undefined)
    if (!currentId) return
    let cancelled = false
    fetch(`/api/resoconto?activityId=${encodeURIComponent(currentId)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setCoverSubtitle(extractLeadSubtitle(d?.content)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [currentId])

  // CTS+Beauty: computed once at import (lib/activitySave.ts) and re-verified here only if
  // missing (an older activity, saved before that policy existed) or older than
  // SCORE_STALE_DAYS — same policy as the planned-hike side in GuidaHub.
  // Waits for the POI/DTM/terrain/protected-area/prefs effects above to land, then hands their
  // results to computeCtsForActivity as `prefetched` instead of having it repeat the exact same
  // /api/pois, /api/tei-dtm, /api/tei-terrain and /api/natura2000 calls this component already
  // made for its own map/UI state (mirrors the same fix on the Guida/GuidaHub side).
  useEffect(() => {
    if (!activity) return
    const fresh = activity.trailScore != null && isScoreFresh(activity.trailScoreComputedAt)
    if (fresh) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon)
    if (gps.length < 2) return
    if (!poisLoaded || dtmProfile === undefined || terrainProfile === undefined || inProtectedArea === undefined || !prefsLoaded) return
    let cancelled = false
    setCtsComputing(true)
    computeCtsForActivity(activity, { pois, dtmProfile, terrainProfile, inProtectedArea, prefs: { prefSforzo, prefDurata, hrRest, hrMax } })
      .then(result => { if (!cancelled && result) setActivity(prev => prev ? { ...prev, ...result } : prev) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCtsComputing(false) })
    return () => { cancelled = true }
  }, [activity?.id, poisLoaded, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Distanza in linea d'aria dall'indirizzo salvato — per ogni scheda della galleria (una vera
    // chiamata di routing OSRM, via useDrivingDistance, ha senso solo per quella aperta qui sotto).
    const straightLineMetersFor = (polyline?: [number, number][]) => {
      if (!userOrigin || !polyline?.length) return undefined
      const [lat, lon] = polyline[0]
      return haversineM(userOrigin.lat, userOrigin.lon, lat, lon)
    }
    const distancePillFor = (polyline: [number, number][] | undefined, isActive: boolean) => {
      if (isActive && driving) return { icon: Car, label: `${(driving.distanceMeters / 1000).toFixed(0)} km in auto` }
      const dist = straightLineMetersFor(polyline)
      return dist != null ? { icon: MapPin, label: `~${(dist / 1000).toFixed(0)} km da te` } : null
    }
    const pillsFor = (a: StoredActivity) => {
      const polyline = a.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      const distPill = distancePillFor(polyline, true)
      return [
        { icon: Route,      label: `${(a.distanceMeters / 1000).toFixed(1)} km` },
        { icon: TrendingUp, label: `+${Math.round(a.elevationGain)} m` },
        { icon: Clock,      label: formatDuration(a.totalTimeSeconds) },
        ...((a.calories ?? 0) > 0 ? [{ icon: Flame, label: `${a.calories} kcal` }] : []),
        ...(distPill ? [distPill] : []),
      ]
    }
    const sortValuesFor = (a: StoredActivity) => ({
      date: new Date(a.startTime).getTime(), km: a.distanceMeters, dplus: a.elevationGain, cts: a.trailScore, rating: a.userRating,
      distance: straightLineMetersFor(a.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])),
    })
    const cover = (id_: string) => covers[id_] ?? (id_ === activity?.id ? photos.find(p => p.id === coverPhotoId)?.url ?? photos[0]?.url : undefined)
    // Otherwise the gallery thumbnail's rating ring stays at whatever it was when the list first
    // loaded, so voting while the hike is open never reaches its own thumbnail once the user swipes away.
    const scorePreviewFor = (a: StoredActivity) => a.userRating != null ? { value: a.userRating, max: 10, color: ratingColor(a.userRating) } : undefined
    const mapped = items.map(it => {
      if (it.id === activity?.id) {
        return { ...it, statPills: pillsFor(activity), coverPhotoUrl: cover(it.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity) }
      }
      const distPill = distancePillFor(it.polyline, false)
      const distance = straightLineMetersFor(it.polyline)
      const coverUrl = cover(it.id)
      if (!distPill && distance == null && !coverUrl) return it
      return {
        ...it,
        statPills: distPill ? [...it.statPills, distPill] : it.statPills,
        sortValues: it.sortValues ? { ...it.sortValues, distance } : it.sortValues,
        ...(coverUrl ? { coverPhotoUrl: coverUrl } : {}),
      }
    })
    if (activity && !mapped.some(it => it.id === activity.id)) {
      return [{ id: activity.id, title: activity.title ?? 'Escursione', polyline: activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]), statPills: pillsFor(activity), coverPhotoUrl: cover(activity.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity) }, ...mapped]
    }
    return mapped
  }, [items, covers, activity, photos, coverPhotoId, driving, userOrigin])

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
    const gps = activity.trackPoints.filter(p => p.lat && p.lon)
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      // Shares the pipeline (and the prefetched-data shortcut) with the automatic background
      // recompute above — reuses whatever this hub has already fetched for its own POI/DTM/
      // terrain/protected-area/prefs UI instead of asking it to fetch that all again.
      const result = await computeCtsForActivity(activity, {
        pois: poisLoaded ? pois : undefined,
        dtmProfile, terrainProfile, inProtectedArea,
        prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
      })
      if (result) setActivity(prev => prev ? { ...prev, ...result } : prev)
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

  const scoreBadges = (routeItem: RouteHubItem, onTap: () => void) => {
    if (!activity || routeItem.id !== activity.id || !rated) return null
    return (
      // The manual vote (not a computed score) is the most meaningful "how good was it" figure
      // for a hike already done — shown the same way Guida shows its Trail Score, just on a
      // 0-10 scale with its own color instead of the CTS-tier gradient.
      <button onClick={onTap} title="Voto" className="pointer-events-auto shrink-0">
        <MiniScoreRing value={activity.userRating!} max={10} color={ratingColor(activity.userRating!)} />
      </button>
    )
  }

  const heroPhotos = photos.length > 0 ? (
    <div data-hscroll className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 snap-x">
      {photos.map(ph => (
        <Image key={ph.id} src={ph.url} alt={ph.caption ?? ''} width={112} height={112} className="w-28 h-28 object-cover rounded-2xl shrink-0 snap-start border border-stone-200" />
      ))}
    </div>
  ) : undefined

  const ratingBadge = (item: RouteHubItem) => {
    if (!activity || item.id !== activity.id || !rated) return null
    return (
      <span className="flex flex-col items-center justify-center text-white leading-none">
        <span className="text-[15px] font-bold">{activity.userRating}</span>
        <span className="text-[7px] font-medium opacity-70">/10</span>
      </span>
    )
  }

  const renderSection = (section: SectionKind, item: RouteHubItem) => {
    if (!activity || item.id !== activity.id) {
      return <div className={`py-10 text-center text-sm ${textMuted}`}>Caricamento…</div>
    }

    if (section === 'dati') return (
      <div className="px-4 py-4 space-y-5">
          {(ctsResult || activity.trailScore != null) ? (
            <ScoreRing
              cl={{ notMatched: true }}
              safety={null}
              cts={{ result: ctsResult, cached: activity.trailScore, beautyScore: activity.linkedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts }}
              shadeWater={{ data: s2.data, loading: s2.loading }}
            />
          ) : (
            <div className={`${glassTile} px-5 py-4 flex items-center justify-between gap-4`}>
              <p className={`text-sm ${textMuted}`}>Il punteggio non è ancora stato calcolato.</p>
              <button onClick={handleComputeCts} disabled={ctsComputing} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-500 hover:bg-forest-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {ctsComputing ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>}
              </button>
            </div>
          )}

          {hasGps && dtmProfile?.source === 'dtm' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setShowAspect(a => !a)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-forest-500 text-white border-forest-500' : `${glassTile} ${textMuted}`}`}>
                <Compass className="w-3 h-3" /> Esposizione
              </button>
              {activity.trackPoints?.some(p => p.altitudeMeters !== undefined) && (
                <button onClick={() => setShowGradient(g => !g)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-forest-500 text-white border-forest-500' : `${glassTile} ${textMuted}`}`}>
                  <Layers className="w-3 h-3" /> Pendenza
                </button>
              )}
            </div>
          )}

          {(() => {
            const hasHR  = (activity.avgHeartRate ?? 0) > 0
            const hasCal = (activity.calories ?? 0) > 0
            const hasNetSpeed = (activity.netSpeedMs ?? 0) > 0 && (activity.pauseTimeSeconds ?? 0) > 0
            const hasIev = (activity.iev ?? 0) > 0
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
                <dl className={`${glassTile} p-4 grid grid-cols-2 gap-x-3 gap-y-1.5`}>
                  {[
                    ['Passo medio', formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
                    ['Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`],
                    ['Quota minima', `${activity.altitudeMin.toFixed(1)} m`],
                    ['Quota massima', `${activity.altitudeMax.toFixed(1)} m`],
                    ['Trackpoint', activity.trackPoints.length.toLocaleString('it')],
                    ['Sport', activity.sport],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-stone-100 py-1">
                      <dt className="text-stone-400/60 text-xs">{k}</dt>
                      <dd className={`font-mono text-xs font-medium ${textPrimary}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })()}

          {similarActivities.length > 0 && (
            <div>
              <p className={`text-sm font-semibold mb-2 ${textPrimary}`}>Percorsi simili</p>
              <div className={`${glassTile} overflow-hidden`}>
                <table className="w-full text-xs">
                  <tbody>
                    {similarActivities.slice(0, 5).map(({ activity: a, startDistanceM }) => (
                      <tr key={a.id} className="border-t border-stone-100 first:border-t-0 hover:bg-stone-50 cursor-pointer" onClick={() => router.push(`/resoconto/${a.id}`)}>
                        <td className={`px-3 py-2 ${textPrimary}`}>{new Date(a.startTime).toLocaleDateString('it-IT')}</td>
                        <td className={`px-3 py-2 ${textPrimary}`}>{(a.distanceMeters / 1000).toFixed(1)} km</td>
                        <td className="px-3 py-2 text-stone-400/60">{startDistanceM < 50 ? 'stesso punto' : `${startDistanceM.toFixed(0)} m`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    )

    if (section === 'profilo') return (
      <div className="px-4 py-4 space-y-5">
        {hasGps && activity.trackPoints.length ? (
          <RouteMapSection
            trackPoints={activity.trackPoints}
            pois={pois}
            highlightedPoiIndex={poiCenter.centeredIndex}
            onOpenMap3D={() => setShow3D(true)}
            showGradient={showGradient}
            showAspect={showAspect}
            dtmProfile={dtmProfile}
          />
        ) : (
          <p className={`text-sm italic text-center py-8 ${textMuted}`}>Profilo altimetrico non disponibile senza un tracciato GPS.</p>
        )}
        {activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0) && (
          <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
        )}
        <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
      </div>
    )

    if (section === 'meteo') return (
      <div className="px-4 py-4">
        {hasGps && dateISO
          ? <WeatherWidget mode="historical" lat={centerPt.lat!} lon={centerPt.lon!} date={dateISO} />
          : <p className={`text-sm italic text-center py-8 ${textMuted}`}>Meteo non disponibile senza un tracciato GPS.</p>}
      </div>
    )

    if (section === 'natura') return (
      <div className="px-4 py-4 space-y-5">
        {hasGps && heroPolyline.length > 1 && <PhenologyPanel data={s2.data} loading={s2.loading} flora={flora.data} floraLoading={flora.loading} />}
        <div className="flex gap-2">
          <button onClick={() => setShowFloraGallery(true)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${glassTile} ${glassTileHover} ${textPrimary}`}>
            <Leaf className="w-4 h-4 text-emerald-400" /> Galleria Verde
          </button>
          <button onClick={() => setShowAnimalGallery(true)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${glassTile} ${glassTileHover} ${textPrimary}`}>
            <PawPrint className="w-4 h-4 text-amber-500" /> Galleria Animali
          </button>
        </div>
      </div>
    )

    if (section === 'poi') return (
      <div className="px-4 py-4 space-y-3">
        <p className={sectionHeading}>Sul percorso</p>
        {pois.length === 0 && (
          <p className={`text-sm italic text-center py-8 ${textMuted}`}>Nessun punto di interesse trovato lungo il tracciato.</p>
        )}
        {pois.map((poi, i) => {
          const meta = POI_META[poi.type]
          const highlighted = i === poiCenter.centeredIndex
          return (
            <div key={poi.id} ref={poiCenter.setItemRef(i)}
              className={`${glassTile} p-4 flex gap-3 transition-colors ${highlighted ? 'bg-emerald-400/15 border-emerald-400/40' : ''}`}>
              <span className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${textMuted}`}>{meta.label}</span>
                  <span className="text-[10px] text-stone-400/50 ml-auto shrink-0">{poi.distFromTrack === 0 ? 'sul tracciato' : `${poi.distFromTrack} m`}</span>
                </div>
                <p className={`text-sm font-semibold leading-tight ${textPrimary}`}>{poi.name ?? meta.label}</p>
              </div>
            </div>
          )
        })}
        {hasGps && (
          <>
            <p className={`${sectionHeading} pt-2`}>Wikipedia nei dintorni</p>
            <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
          </>
        )}
      </div>
    )

    if (section === 'sicurezza') return (
      <div className="flex items-center justify-center px-6 py-10">
        <p className={`text-sm italic text-center ${textMuted}`}>
          Il punteggio sicurezza è disponibile solo per le guide pre-escursione, non per le escursioni concluse.
        </p>
      </div>
    )

    // strumenti
    return (
      <div className="px-4 py-4 space-y-1">
        <button onClick={() => router.push(`/resoconto/${encodeURIComponent(activity.id)}/leggi`)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <BookOpen className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Resoconto</span>
        </button>
        <button onClick={() => setShowStreetView(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <Images className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Foto zona (street view)</span>
        </button>
        <div className="pt-1 mt-1 border-t border-stone-200">
          <ActivityPhotoManager
            activityId={activity.id} trackPoints={activity.trackPoints}
            activityTitle={activity.title ?? undefined}
            distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain}
          />
        </div>
        <div className="pt-1 mt-1 border-t border-stone-200 space-y-1">
          {photos.length > 0 && (
            <button onClick={() => setShowCoverPicker(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Camera className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Cambia copertina</span>
            </button>
          )}
          <button onClick={() => setShowShare(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Share2 className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Condividi</span>
          </button>
          <button onClick={() => setShow3D(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Box className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Vista 3D</span>
          </button>
          <button onClick={() => { setOpenVideoWizard(true); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Film className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Crea video</span>
          </button>
          <button onClick={() => exportActivityToExcel(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <FileSpreadsheet className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta Excel</span>
          </button>
          <button onClick={() => exportActivityToDoc(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <FileText className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta Word</span>
          </button>
          <button onClick={() => exportActivityToGpx(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Map className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta GPX</span>
          </button>
          <button onClick={() => exportActivityPdf(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <FileDown className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta PDF</span>
          </button>
        </div>

        <div className="pt-1 mt-1 border-t border-stone-200">
          {editNotes ? (
            <div className="px-2 py-2 space-y-2">
              <textarea autoFocus value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4}
                placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                className="w-full border border-stone-300 rounded-xl p-3 text-sm text-stone-800 bg-white outline-none focus:border-forest-500 resize-none placeholder:text-stone-400" />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-500 text-white rounded-lg text-sm hover:bg-forest-400 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                </button>
                <button onClick={() => { setNotesVal(activity.userNotes ?? ''); setEditNotes(false) }} className={`px-4 py-1.5 text-sm transition-colors ${textMuted}`}>Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditNotes(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Note personali{activity.userNotes ? '' : ' (vuote)'}</span>
            </button>
          )}
        </div>

        <div className="px-2 pt-2">
          <HikeNotesRecorder notes={activity.hikeNotes ?? []} onChange={hikeNotes => patch({ hikeNotes })} />
        </div>

        <div className="pt-1 mt-1 border-t border-stone-200">
          <button onClick={handleDelete} disabled={saving} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-red-50 transition-colors text-left text-red-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="text-sm font-medium">Elimina escursione</span>
          </button>
        </div>
      </div>
    )
  }

  const tabs: TabDef[] = [
    {
      key: 'dati', label: 'Dati & punteggi', icon: BarChart2,
      badge: activity?.trailScore != null ? (
        <span className="inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full bg-sky-500 text-[9px] font-bold text-white leading-none">
          {Math.round(activity.trailScore)}
        </span>
      ) : undefined,
    },
    { key: 'profilo', label: 'Andamento', icon: Mountain },
    { key: 'natura', label: 'Natura', icon: Leaf },
    { key: 'poi', label: 'Punti di interesse', icon: MapPin },
    { key: 'sicurezza', label: 'Sicurezza & segnalazioni', icon: ShieldAlert },
    { key: 'strumenti', label: 'Strumenti', icon: Wrench },
  ]

  const primaryAction = (routeItem: RouteHubItem): PrimaryAction => ({
    label: rated ? `Voto ${activity?.userRating}/10` : 'Vota bellezza',
    icon: Star,
    onClick: () => setShowRatingPanel(true),
    variant: rated ? 'glass' : 'terra',
    badge: ratingBadge(routeItem),
  })

  const tabScrollRef = (section: SectionKind) => section === 'poi' ? poiCenter.containerRef : undefined

  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      <RouteHub
        mode="resoconto"
        items={displayItems}
        initialIndex={initialIndex}
        onIndexChange={(item) => {
          setCurrentId(item.id)
          // Plain History API, not router.replace: `/resoconto` and `/resoconto/[id]` are
          // different page components, so a Next.js navigation between them unmounts/remounts
          // this whole hub (re-running every data-loading effect) and produces a visible
          // double-render — this is a purely cosmetic address-bar sync, not a real navigation.
          window.history.replaceState(null, '', `/resoconto/${encodeURIComponent(item.id)}`)
        }}
        bodyMode="tabbed"
        tabs={tabs}
        renderSection={renderSection}
        tabScrollRef={tabScrollRef}
        primaryAction={primaryAction}
        scoreBadges={scoreBadges}
        weatherIcon={(routeItem) => activity && routeItem.id === activity.id ? weatherIcon : undefined}
        subtitle={(routeItem) => activity && routeItem.id === activity.id ? coverSubtitle : undefined}
        topOverlayVariant="magazine"
        heroPhotos={heroPhotos}
        importLabel="Carica"
        onImport={() => router.push('/upload?tab=activity')}
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
              <h3 className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm">Scegli la copertina</h3>
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
                  <Image src={ph.url} alt={ph.caption ?? ''} fill sizes="120px" className="object-cover" />
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
