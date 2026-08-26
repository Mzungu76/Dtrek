'use client'
// Loader magro per UN solo Reportage, per le nuove pagine "a libro" del Diario (vedi
// /root/.claude/plans/logical-munching-kahan.md, Fase 1). Duplica DELIBERATAMENTE — non
// refattorizza — la parte di app/resoconto/ResocontoHub.tsx che prepara i dati per <ReportReader>
// (righe ~121-329 lì): stessi hook già estratti come moduli standalone (useDtmProfile,
// useTerrainProfile, useProtectedAreaCheck, useDrivingDistance, useUserPrefs, useFlora,
// useCtsRecompute), stessa colla residua per POI/wiki, foto e "percorsi simili". A differenza di
// Guida, il Resoconto non ha una Sicurezza "per te" (nessun equivalente di useSafetyScore/
// personalSafetyFit qui — ResocontoHub stesso non lo calcola). ResocontoHub resta la galleria a
// carosello di TUTTE le attività (non toccata) — questo hook non replica la lista, le copertine
// per le altre schede, i preferiti: serve un solo Reportage.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getActivityById, getAllActivities,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { findSimilarActivities } from '@/lib/stats'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { getUserStartingPoint, googleMapsDirectionsUrl } from '@/lib/drivingInfo'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { type PoiItem } from '@/lib/overpass'
import { wmoInfo } from '@/lib/openmeteo'
import { computeCtsForActivity } from '@/lib/computeCtsForActivity'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { useCtsRecompute } from '@/lib/useCtsRecompute'
import { useUserPrefs } from '@/lib/useUserPrefs'
import { useFlora } from '@/lib/useFlora'
import { useDtmProfile } from '@/app/resoconto/useDtmProfile'
import { useTerrainProfile } from '@/app/resoconto/useTerrainProfile'
import { useProtectedAreaCheck } from '@/app/resoconto/useProtectedAreaCheck'
import { useDrivingDistance } from '@/app/resoconto/useDrivingDistance'
import type { DataSectionBundle, NaturaBundle } from '@/components/resoconto/ReportReader'

export interface UseReportageBookDataResult {
  loading: boolean
  notFound: boolean
  activity: StoredActivity | null
  driving: { distanceMeters: number; mapsUrl?: string } | null
  weatherIcon: { emoji: string; label: string } | null
  data: DataSectionBundle
  natura: NaturaBundle
  pois: PoiItem[]
  poisLoaded: boolean
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  photos: RoutePhoto[]
  photosError: boolean
  onRetryPhotos: () => void
  onPhotosChange: (photos: RoutePhoto[]) => void
  coverPhotoId: string | null
  setCoverPhotoId: (id: string | null) => void
  hasGps: boolean
}

export function useReportageBookData(activityId: string | undefined): UseReportageBookDataResult {
  const router = useRouter()
  const [activity, setActivity] = useState<StoredActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect, setShowAspect] = useState(false)
  const [pois, setPois] = useState<PoiItem[]>([])
  const [poisLoaded, setPoisLoaded] = useState(false)
  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  const [photosError, setPhotosError] = useState(false)
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null)
  const [ctsResult, setCtsResult] = useState<TrailScoreResult | null>(null)
  const [ctsComputing, setCtsComputing] = useState(false)
  const [rawActivities, setRawActivities] = useState<ActivityMeta[]>([])
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)

  const dtmProfile      = useDtmProfile(activity)
  const terrainProfile  = useTerrainProfile(activity)
  const inProtectedArea = useProtectedAreaCheck(activity)
  const drivingRaw      = useDrivingDistance(activity)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])
  useEffect(() => { getAllActivities().then(setRawActivities).catch(() => {}) }, [])

  const driving = useMemo(() => {
    if (!drivingRaw) return drivingRaw
    const trailStart = activity?.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])?.[0]
    const mapsUrl = userOrigin && trailStart
      ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
      : undefined
    return { ...drivingRaw, mapsUrl }
  }, [drivingRaw, userOrigin, activity?.trackPoints])

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  const flora = useFlora(heroPolyline, activity?.altitudeMax)

  useEffect(() => {
    if (!activityId) return
    setLoading(true)
    setNotFound(false)
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
          if (!a.poiWiki?.length) {
            fetchWikiForNamedPois(nearby).then(setPoiWikiEntries).catch(() => {})
          }
        })
        .catch(() => {})
        .finally(() => setPoisLoaded(true))
    }
    setPois([]); setPoisLoaded(false); setPoiWikiEntries([]); setPhotos([]); setPhotosError(false); setCoverPhotoId(null)
    getActivityById(activityId).then(a => {
      if (!a) { setNotFound(true); setLoading(false); return }
      setActivity(a)
      loadPoisFor(a)
      setLoading(false)
    }).catch(() => { setNotFound(true); setLoading(false) })
    fetchActivityPhotos(activityId).then(setPhotos).catch(() => setPhotosError(true))
    const savedCover = typeof window !== 'undefined' ? localStorage.getItem(`dtrek_cover_${activityId}`) : null
    if (savedCover) setCoverPhotoId(savedCover)
  }, [activityId])

  // Un pull in background (altro device) rimette in cache una copia più fresca — senza questo la
  // pagina resterebbe ferma sulla versione vista all'apertura fino a un reload manuale.
  useCtsUpdated(() => {
    if (!activityId) return
    getActivityById(activityId).then(a => { if (a) setActivity(a) }).catch(() => {})
  })

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

  const handleComputeCts = useCallback(async () => {
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
  }, [activity, poisLoaded, pois, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax])

  const retryPhotos = useCallback(() => {
    if (!activityId) return
    setPhotosError(false)
    fetchActivityPhotos(activityId).then(setPhotos).catch(() => setPhotosError(true))
  }, [activityId])

  const setCoverPhotoIdPersisted = useCallback((photoId: string | null) => {
    if (!activity) return
    setCoverPhotoId(photoId)
    if (typeof window === 'undefined') return
    if (photoId) localStorage.setItem(`dtrek_cover_${activity.id}`, photoId)
    else localStorage.removeItem(`dtrek_cover_${activity.id}`)
  }, [activity])

  const gpsPoints = activity?.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined) ?? []
  const hasGps = gpsPoints.length > 0

  const data: DataSectionBundle = {
    ctsResult, ctsComputing, onComputeCts: handleComputeCts,
    dtmProfile, showGradient, showAspect,
    onToggleGradient: () => setShowGradient(g => !g),
    onToggleAspect: () => setShowAspect(a => !a),
    // Punta ancora alla schermata classica standalone (comportamento identico a ResocontoHub oggi)
    // — un percorso simile aperto dal libro non ha ancora una pagina "a libro" propria raggiungibile
    // da qui finché la Fase 3 non collega anche questo deep link al nuovo routing.
    similarActivities, onOpenSimilar: (activityId_) => router.push(`/resoconto/${encodeURIComponent(activityId_)}`),
  }

  const natura: NaturaBundle = {
    hasGps: hasGps && heroPolyline.length > 1, flora: flora.data, floraLoading: flora.loading,
    trackPoints: activity?.trackPoints ?? [],
    month: activity ? new Date(activity.startTime).getMonth() + 1 : new Date().getMonth() + 1,
  }

  return {
    loading, notFound, activity, driving, weatherIcon, data, natura,
    pois, poisLoaded, poiWikiEntries,
    photos, photosError, onRetryPhotos: retryPhotos, onPhotosChange: setPhotos,
    coverPhotoId, setCoverPhotoId: setCoverPhotoIdPersisted,
    hasGps,
  }
}
