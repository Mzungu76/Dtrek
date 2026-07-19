'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import RouteHub from '@/components/routehub/RouteHub'
import HubSkeleton from '@/components/routehub/HubSkeleton'
import ReportReader from '@/components/resoconto/ReportReader'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'
import type { RouteHubItem, SectionKind, PrimaryAction } from '@/components/routehub/types'
import { wmoInfo } from '@/lib/openmeteo'
import { RatingGaugeBadge, ratingColor } from '@/components/resoconto/RatingGaugeBadge'
import {
  getActivityById, updateActivityMeta, deleteActivity, getAllActivities,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { exportActivityToExcel } from '@/utils/exportExcel'
import { exportActivityToDoc } from '@/utils/exportDoc'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { exportActivityPdf } from '@/utils/pdfExport'
import { type PoiItem } from '@/lib/overpass'
import { findSimilarActivities } from '@/lib/stats'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { getUserStartingPoint, googleMapsDirectionsUrl } from '@/lib/drivingInfo'
import { computeCtsForActivity } from '@/lib/computeCtsForActivity'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import {
  FileSpreadsheet, FileText, Map, FileDown,
  Route, TrendingUp, Clock, Flame,
  Pencil, Trash2, Loader2, Share2, Box, Images, Film, Camera, X,
  Star, Car,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import HikeNotesRecorder from '@/app/components/HikeNotesRecorder'
import { fetchActivityPhotos, pickBestCoverPhoto, type RoutePhoto } from '@/lib/activityPhotos'
import { useFlora } from '@/lib/useFlora'
import { useDtmProfile } from './useDtmProfile'
import { useTerrainProfile } from './useTerrainProfile'
import { useProtectedAreaCheck } from './useProtectedAreaCheck'
import { useDrivingDistance } from './useDrivingDistance'
import { useUserPrefs } from '@/lib/useUserPrefs'
import { useCtsRecompute } from '@/lib/useCtsRecompute'

const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const FloraGallery    = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery   = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

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
    favorite: a.favorite,
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
  const [ratingVal,       setRatingVal]      = useState(0)
  const [ratingNote,      setRatingNote]     = useState('')
  const [savingRating,    setSavingRating]   = useState(false)
  const [showRatingPanel, setShowRatingPanel] = useState(false)
  const [show3D,          setShow3D]          = useState(false)
  const [openVideoWizard, setOpenVideoWizard] = useState(false)
  const [showStreetView,  setShowStreetView]  = useState(false)
  const [photos,          setPhotos]          = useState<RoutePhoto[]>([])
  const [photosError,     setPhotosError]     = useState(false)
  const [coverPhotoId,    setCoverPhotoId]    = useState<string | null>(null)
  const [showShare,       setShowShare]       = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [ctsResult,       setCtsResult]       = useState<TrailScoreResult | null>(null)
  const [ctsComputing,    setCtsComputing]    = useState(false)
  const [favoritesFilter, setFavoritesFilter] = useState(false)
  const [pendingScrollSection, setPendingScrollSection] = useState<'dati_punteggi' | null>(null)

  const dtmProfile      = useDtmProfile(activity)
  const terrainProfile  = useTerrainProfile(activity)
  const inProtectedArea = useProtectedAreaCheck(activity)
  const driving         = useDrivingDistance(activity)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)
  // Indirizzo/punto di partenza salvato nelle impostazioni — usato per la distanza in auto
  // mostrata nell'hero e come filtro di ordinamento della galleria.
  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])

  const drivingWithMaps = useMemo(() => {
    if (!driving) return driving
    const trailStart = activity?.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])?.[0]
    const mapsUrl = userOrigin && trailStart
      ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
      : undefined
    return { ...driving, mapsUrl }
  }, [driving, userOrigin, activity?.trackPoints])

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  const flora = useFlora(heroPolyline, activity?.altitudeMax)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)

  // Lightweight list of all completed hikes, most recent first — backs the carousel/gallery.
  // getAllActivities() is stale-while-revalidate: it resolves instantly with last visit's
  // locally cached list, then fetches the real one in the background. Without onRefresh, that
  // fresh fetch (with up-to-date trailScore/userRating) is saved to the local cache for next
  // time but never reaches this session's `items` — so the gallery stays a visit behind.
  const applyList = useCallback((list: ActivityMeta[]) => {
    const sorted = list.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    setRawActivities(sorted)
    setItems(sorted.map(metaToItem))
  }, [])

  useEffect(() => {
    getAllActivities(applyList).then(applyList).catch(() => setItems([])).finally(() => setListLoaded(true))
  }, [applyList])

  // A background pull (another device added/edited/deleted an activity, or this device just
  // caught up after being offline) lands in the local cache without any user action on this page —
  // without this, the gallery would stay frozen on the pre-pull list until a manual reload.
  useCtsUpdated(() => { getAllActivities().then(applyList).catch(() => {}) })

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
    setPois([]); setPoisLoaded(false); setPhotos([]); setPhotosError(false); setCoverPhotoId(null)
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
    fetchActivityPhotos(currentId).then(setPhotos).catch(() => setPhotosError(true))
    const savedCover = localStorage.getItem(`dtrek_cover_${currentId}`)
    if (savedCover) setCoverPhotoId(savedCover)
  }, [currentId, router])

  // CTS+Beauty: computed once at import (lib/activitySave.ts) and re-verified here only if
  // missing (an older activity, saved before that policy existed) or older than
  // SCORE_STALE_DAYS — same policy as the planned-hike side in GuidaHub.
  useCtsRecompute({
    entity: activity,
    entityId: activity?.id,
    isFresh: (a) => a.trailScore != null && isScoreFresh(a.trailScoreComputedAt),
    hasEnoughGps: (a) => a.trackPoints.filter(p => p.lat && p.lon).length >= 2,
    poisReady: poisLoaded,
    dtmProfile, terrainProfile, inProtectedArea, prefsLoaded,
    pois,
    prefs: { prefSforzo, prefDurata, hrRest, hrMax },
    compute: computeCtsForActivity,
    onResult: (result) => setActivity(prev => prev ? { ...prev, ...result } : prev),
    setComputing: setCtsComputing,
  })

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
    // Distanza in auto REALE (OSRM, via useDrivingDistance) — non in linea d'aria. A differenza
    // di planned_hikes, un'activity completata non ha una colonna cache per questo valore (vedi
    // app/resoconto/useDrivingDistance.ts), quindi qui è disponibile solo per quella aperta ora;
    // le altre schede semplicemente non mostrano la pillola finché non vengono aperte a loro volta.
    const distancePillFor = (polyline: [number, number][] | undefined, isActive: boolean) => {
      if (!isActive || !driving) return null
      const trailStart = polyline?.[0]
      const href = userOrigin && trailStart
        ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
        : undefined
      return { icon: Car, label: `${Math.round(driving.distanceMeters / 1000)} km in auto`, href }
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
      distance: driving?.distanceMeters,
    })
    // Per il percorso aperto la copertina scelta a mano (o quella "intelligente" di riserva) deve
    // vincere sempre sulla cache generica `covers` (un solo scatto per galleria, presa in
    // background per le altre schede) — altrimenti la scelta fatta in Strumenti veniva ignorata
    // sulla copertina a percorso chiuso non appena quella cache si popolava. Nessuna foto ⇒
    // undefined, così RouteHub ricade sulla mappa (CoverMap), come per Guida.
    const cover = (id_: string) => id_ === activity?.id
      ? photos.find(p => p.id === coverPhotoId)?.url ?? pickBestCoverPhoto(photos)?.url ?? covers[id_]
      : covers[id_]
    const scorePreviewFor = (a: StoredActivity) => a.userRating != null ? { value: a.userRating, max: 10, color: ratingColor(a.userRating) } : undefined
    const mapped = items.map(it => {
      if (it.id === activity?.id) {
        // Il percorso aperto ha già il tracciato completo (activity.trackPoints): ricalcolare la
        // polyline da qui invece di tenere quella (a volte assente/obsoleta) della lista leggera
        // evita che la copertina/miniatura restino senza mappa di riserva quando non c'è una foto.
        const polyline = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        return { ...it, polyline, statPills: pillsFor(activity), coverPhotoUrl: cover(it.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity), favorite: activity.favorite }
      }
      const coverUrl = cover(it.id)
      return coverUrl ? { ...it, coverPhotoUrl: coverUrl } : it
    })
    if (activity && !mapped.some(it => it.id === activity.id)) {
      return [{ id: activity.id, title: activity.title ?? 'Escursione', polyline: activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]), statPills: pillsFor(activity), coverPhotoUrl: cover(activity.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity), favorite: activity.favorite }, ...mapped]
    }
    return mapped
  }, [items, covers, activity, photos, coverPhotoId, driving, userOrigin])

  if (!listLoaded) {
    return <HubSkeleton />
  }
  if (!currentId) {
    if (items.length > 0) return <HubSkeleton />
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
    return <HubSkeleton />
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

  // Non legata a `activity` (a differenza di patch sopra) — la stella va toccabile su qualunque
  // scheda della galleria, anche quella non ancora "aperta" — stesso meccanismo di GuidaHub.
  const handleToggleFavorite = (routeItem: RouteHubItem) => {
    const next = !routeItem.favorite
    setItems(prev => prev.map(it => it.id === routeItem.id ? { ...it, favorite: next } : it))
    setActivity(prev => prev && prev.id === routeItem.id ? { ...prev, favorite: next } : prev)
    updateActivityMeta(routeItem.id, { favorite: next })
  }

  const gpsPoints = activity?.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const rated     = (activity?.userRating ?? 0) > 0

  // Anello del voto, mostrato sotto il sottotitolo (stessa posizione del badge a doppio anello di
  // Guida) invece che nella fila di chip sopra il titolo — stesso principio, un dato diverso (il
  // voto manuale non è un punteggio calcolato, quindi resta un anello singolo, non a doppio anello).
  const scoreGaugeBadge = (routeItem: RouteHubItem, onTap: () => void) => {
    if (!activity || routeItem.id !== activity.id || !rated) return null
    return (
      <button onClick={() => { setPendingScrollSection('dati_punteggi'); onTap() }} title="Voto" className="pointer-events-auto shrink-0">
        <RatingGaugeBadge value={activity.userRating!} size={72} note={activity.userRatingNote} />
      </button>
    )
  }

  const retryPhotos = () => {
    if (!currentId) return
    setPhotosError(false)
    fetchActivityPhotos(currentId).then(setPhotos).catch(() => setPhotosError(true))
  }

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
      return <div className={`py-10 text-center text-sm ${textMuted}`}>Caricamento…</div>
    }

    if (section === 'featured') {
      return (
        <ReportReader
          activity={activity}
          photos={photos}
          photosError={photosError}
          onRetryPhotos={retryPhotos}
          onPhotosChange={setPhotos}
          coverPhotoId={coverPhotoId}
          onOpenCoverPicker={() => setShowCoverPicker(true)}
          pois={pois}
          poisLoaded={poisLoaded}
          driving={drivingWithMaps}
          weatherIcon={weatherIcon}
          data={{
            ctsResult, ctsComputing, onComputeCts: handleComputeCts,
            dtmProfile, showGradient, showAspect,
            onToggleGradient: () => setShowGradient(g => !g),
            onToggleAspect: () => setShowAspect(a => !a),
            similarActivities, onOpenSimilar: (activityId) => router.push(`/resoconto/${activityId}`),
          }}
          natura={{
            hasGps: hasGps && heroPolyline.length > 1, flora: flora.data, floraLoading: flora.loading,
            onOpenFloraGallery: () => setShowFloraGallery(true), onOpenAnimalGallery: () => setShowAnimalGallery(true),
          }}
          onOpenMap3D={() => setShow3D(true)}
          onOpenVideoWizard={() => { setOpenVideoWizard(true); setShow3D(true) }}
          scrollToSectionKey={pendingScrollSection}
          onScrollToSectionConsumed={() => setPendingScrollSection(null)}
        />
      )
    }

    // strumenti
    return (
      <div className="px-4 py-4 space-y-1">
        <button onClick={() => { onClose(); setShowStreetView(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <Images className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Foto zona (street view)</span>
        </button>
        <div className="pt-1 mt-1 border-t border-stone-200 space-y-1">
          {photos.length > 0 && (
            <button onClick={() => { onClose(); setShowCoverPicker(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Camera className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Cambia copertina</span>
            </button>
          )}
          <button onClick={() => { onClose(); setShowShare(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Share2 className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Condividi</span>
          </button>
          <button onClick={() => { onClose(); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Box className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Vista 3D</span>
          </button>
          <button onClick={() => { onClose(); setOpenVideoWizard(true); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
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

  const primaryAction = (routeItem: RouteHubItem): PrimaryAction => ({
    label: rated ? `Voto ${activity?.userRating}/10` : 'Vota bellezza',
    icon: Star,
    onClick: () => setShowRatingPanel(true),
    variant: rated ? 'glass' : 'terra',
    badge: ratingBadge(routeItem),
  })

  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      <RouteHub
        mode="resoconto"
        items={displayItems}
        initialIndex={initialIndex}
        favoritesFilter={favoritesFilter}
        onToggleFavoritesFilter={() => setFavoritesFilter(v => !v)}
        onToggleFavorite={handleToggleFavorite}
        onIndexChange={(item) => {
          setCurrentId(item.id)
          // Plain History API, not router.replace: `/resoconto` and `/resoconto/[id]` are
          // different page components, so a Next.js navigation between them unmounts/remounts
          // this whole hub (re-running every data-loading effect) and produces a visible
          // double-render — this is a purely cosmetic address-bar sync, not a real navigation.
          window.history.replaceState(null, '', `/resoconto/${encodeURIComponent(item.id)}`)
        }}
        bodyMode="continuous"
        renderSection={renderSection}
        primaryAction={primaryAction}
        scoreGaugeBadge={scoreGaugeBadge}
        scoreBadgesTargetSection="featured"
        weatherIcon={(routeItem) => activity && routeItem.id === activity.id ? weatherIcon : undefined}
        onCompare={(routeItem) => router.push(`/statistiche?tab=confronta&pre=${encodeURIComponent(`c:${routeItem.id}`)}`)}
        topOverlayVariant="magazine"
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
