'use client'
// Loader magro per UNA sola Guida, per le nuove pagine "a libro" del Diario (vedi
// /root/.claude/plans/logical-munching-kahan.md, Fase 1). Duplica DELIBERATAMENTE — non
// refattorizza — la parte di app/guida/GuidaHub.tsx che prepara i dati per <GuideReader>
// (righe ~148-483 lì): stessi hook già estratti come moduli standalone (useDtmProfile,
// useTerrainProfile, useProtectedAreaCheck, useDrivingDistance, useSafetyScore, useHasAiAccess,
// useEnrichmentTimeout, useCtsRecompute, useFlora, useUserPrefs), stessa colla residua per POI/
// wiki, punteggio idoneità personale e CTS. GuidaHub resta la galleria a carosello di TUTTI i
// percorsi (non toccata) — questo hook non replica nulla di quella parte (lista, driveCache per
// le altre schede, preferiti, copertine, toast di eliminazione): serve un solo percorso.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlannedById, updatePlannedMeta, type PlannedHike } from '@/lib/plannedStore'
import { getCachedGeoInfo, setCachedGeoInfo } from '@/lib/routeBuilder/geoInfoCache'
import { LS_KEYS } from '@/lib/localStore'
import type { ReturnOption } from '@/lib/routeBuilder/returnOptions'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { useHasAiAccess } from '@/app/guida/useHasAiAccess'
import { useEnrichmentTimeout } from '@/app/guida/useEnrichmentTimeout'
import { useDtmProfile } from '@/app/guida/useDtmProfile'
import { useTerrainProfile } from '@/app/guida/useTerrainProfile'
import { useProtectedAreaCheck } from '@/app/guida/useProtectedAreaCheck'
import { useDrivingDistance } from '@/app/guida/useDrivingDistance'
import { useSafetyScore } from '@/app/guida/useSafetyScore'
import { useCtsRecompute } from '@/lib/useCtsRecompute'
import { useUserPrefs } from '@/lib/useUserPrefs'
import { useFlora } from '@/lib/useFlora'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { refineSafetyWithTerrainSignals } from '@/lib/safetyScore'
import { computePersonalSafety, type PersonalFitProfile, type PersonalFitHistory, type PersonalFitRoute } from '@/lib/personalSafetyFit'
import { isHikerExperienceLevel, sanitizeHikerConcerns, type HikerExperienceLevel, type HikerConcernKey } from '@/lib/hikerProfile'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { getPersonalRecords, difficultyIndex } from '@/lib/stats'
import { computeBbox, minDistToTrack, classifyTrackShape } from '@/lib/geoUtils'
import { getUserStartingPoint, googleMapsDirectionsUrl } from '@/lib/drivingInfo'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { type PoiItem } from '@/lib/overpass'
import { isScoreFresh } from '@/lib/scoreFreshness'
import type { RouteMode } from '@/lib/routeMode'
import type { GuideSectionKey } from '@/lib/guideSections'
import type { ScoresBundle, SafetyDetailsBundle, PoiListBundle, NaturaBundle } from '@/components/guida/GuideReader'

export interface UseGuidaBookDataResult {
  loading: boolean
  /** true quando il percorso non esiste (più) — la pagina chiamante decide come reagire
   *  (redirect, 404), questo hook non naviga da solo. */
  notFound: boolean
  hike: PlannedHike | null
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  enrichmentReady: boolean
  hasAiAccess: boolean | null
  aiUnavailable: boolean
  trialExpired: boolean
  driving: { distanceMeters: number; durationSeconds: number; mapsUrl?: string } | null
  dtmProfile: ReturnType<typeof useDtmProfile>
  onRouteModeChange: (mode: RouteMode) => Promise<void>
  scores: ScoresBundle
  safetyDetails: SafetyDetailsBundle
  poiList: PoiListBundle
  natura: NaturaBundle
  weather?: { lat: number; lon: number; mode: 'planned' | 'forecast' }
  hasGps: boolean
  pois: PoiItem[]
  isLinearRoute: boolean
  endPoint: { lat: number; lon: number } | null
  returnOptions: ReturnOption[] | null
  highlightedPoiId: number | null
  onPoiTap: (poiId: number) => void
  scrollToSectionKey: GuideSectionKey | null
  onScrollToSectionConsumed: () => void
  requestScrollToSection: (key: GuideSectionKey) => void
}

export function useGuidaBookData(percorsoId: string | undefined): UseGuidaBookDataResult {
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect, setShowAspect] = useState(false)
  const [pois, setPois] = useState<PoiItem[]>([])
  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult, setCtsResult] = useState<TrailScoreResult | null>(null)
  const [ctsComputing, setCtsComputing] = useState(false)
  const [ctsSettled, setCtsSettled] = useState(false)
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)
  const [scrollToSectionKey, setScrollToSectionKey] = useState<GuideSectionKey | null>(null)
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)

  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])

  const flora = useFlora(
    hike?.routePolyline, hike?.altitudeMax,
    hike ? { plannedId: hike.id, data: hike.floraResult, trackHash: hike.floraTrackHash } : undefined,
  )

  const { hasAiAccess, aiUnavailable, trialExpired } = useHasAiAccess()
  const enrichmentTimedOut = useEnrichmentTimeout(hike?.id)
  const dtmProfile = useDtmProfile(hike)
  const terrainProfile = useTerrainProfile(hike)
  const inProtectedArea = useProtectedAreaCheck(hike)
  const drivingRaw = useDrivingDistance(hike)
  const driving = useMemo(() => {
    if (!drivingRaw) return drivingRaw
    const trailStart = hike?.routePolyline?.[0]
    const mapsUrl = userOrigin && trailStart
      ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
      : undefined
    return { ...drivingRaw, mapsUrl }
  }, [drivingRaw, userOrigin, hike?.routePolyline])
  const { safetyScore, setSafetyScore } = useSafetyScore(hike, setHike)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  // Sicurezza "per te" — stesso identico calcolo di GuidaHub (vedi il commento lì): la Sicurezza
  // Oggettiva cachata viene prima corretta con la pendenza DTM già disponibile qui, poi combinata
  // col profilo escursionista e lo storico personale.
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  useEffect(() => { getAllActivities().then(setActivities).catch(() => {}) }, [])

  const [hikerFitProfile, setHikerFitProfile] = useState<{ experienceLevel: HikerExperienceLevel | null; concerns: HikerConcernKey[]; userAge?: number }>({ experienceLevel: null, concerns: [] })
  useEffect(() => {
    getUserSettingsCached().then(d => {
      setHikerFitProfile({
        experienceLevel: isHikerExperienceLevel(d.hikerExperienceLevel) ? d.hikerExperienceLevel : null,
        concerns: sanitizeHikerConcerns(d.hikerConcerns),
        userAge: d.userAge || undefined,
      })
    }).catch(() => {})
  }, [])

  const personalRecords = useMemo(() => getPersonalRecords(activities), [activities])
  const fitHistory = useMemo<PersonalFitHistory>(() => ({
    maxAltitudeM: personalRecords.highestAlt?.altitudeMax,
    maxDifficultyIndex: personalRecords.highestDifficulty
      ? difficultyIndex(personalRecords.highestDifficulty.elevationGain, personalRecords.highestDifficulty.distanceMeters)
      : undefined,
  }), [personalRecords])

  const refinedSafety = useMemo(
    () => safetyScore ? refineSafetyWithTerrainSignals(safetyScore, { maxSlopeDeg: dtmProfile?.maxSlopeDeg ?? undefined }) : null,
    [safetyScore, dtmProfile?.avgSlopeDeg],
  )

  const personalSafety = useMemo(() => {
    if (!refinedSafety || !hike) return null
    const route: PersonalFitRoute = { altitudeMax: hike.altitudeMax, difficultyIndex: difficultyIndex(hike.elevationGain, hike.distanceMeters) }
    const profile: PersonalFitProfile = hikerFitProfile
    return computePersonalSafety(refinedSafety, profile, fitHistory, route)
  }, [refinedSafety, hike, hikerFitProfile, fitHistory])

  const enrichmentReady = enrichmentTimedOut ||
    (poisFullyLoaded && !flora.loading && safetyScore != null && ctsSettled)

  // Carica il percorso e avvia il fetch POI/wiki — stesso pattern di GuidaHub, ma per un solo id
  // fisso (percorsoId), non per l'id "corrente" di una galleria che cambia con lo swipe.
  useEffect(() => {
    if (!percorsoId) return
    setLoading(true)
    setNotFound(false)
    getPlannedById(percorsoId).then(h => {
      if (!h) { setNotFound(true); setLoading(false); return }
      setHike(h)
      const gps = (h.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      setPois([]); setPoiWikiEntries([]); setPoisFullyLoaded(false)
      if (gps.length > 0) {
        if (h.cachedPois?.length) {
          setPois(h.cachedPois as PoiItem[])
          if (h.cachedPoiWiki?.length) setPoiWikiEntries(h.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[])
          setPoisFullyLoaded(true)
        } else {
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
                .catch(() => setPoisFullyLoaded(true))
            })
            .catch(() => setPoisFullyLoaded(true))
        }
      }
      setLoading(false)
    }).catch(() => { setNotFound(true); setLoading(false) })
  }, [percorsoId])

  // Un pull in background (altro device) rimette in cache una copia più fresca — senza questo la
  // pagina resterebbe ferma sulla versione vista all'apertura fino a un reload manuale.
  useCtsUpdated(() => {
    if (!percorsoId) return
    getPlannedById(percorsoId).then(h => { if (h) setHike(h) }).catch(() => {})
  })

  useEffect(() => {
    if (!poisFullyLoaded || !hike || (hike.cachedPois?.length ?? 0) > 0 || !pois.length) return
    updatePlannedMeta(hike.id, { cachedPois: pois, cachedPoiWiki: poiWikiEntries }).catch(() => {})
  }, [poisFullyLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bs = hike?.cachedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded || !hike) return
    const computed = computeTrailScore(bs, {
      distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain,
      elevationLoss: hike.elevationLoss, altitudeMax: hike.altitudeMax,
      prefSforzo, prefDurata,
    })
    setCtsResult({ ...computed, ts: hike.cachedTrailScore ?? computed.ts })
  }, [hike?.id, hike?.cachedBeautyScore, hike?.cachedTrailScore, prefsLoaded, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setCtsSettled(false) }, [hike?.id])

  useCtsRecompute({
    entity: hike,
    entityId: hike?.id,
    isFresh: (h) => h.cachedTrailScore != null && isScoreFresh(h.cachedScoresComputedAt),
    hasEnoughGps: (h) => (h.trackPoints ?? []).filter(p => p.lat && p.lon).length >= 2,
    poisReady: poisFullyLoaded,
    dtmProfile, terrainProfile, inProtectedArea, prefsLoaded,
    pois,
    prefs: { prefSforzo, prefDurata, hrRest, hrMax },
    compute: computeCtsForHike,
    onResult: (result) => setHike(prev => prev ? { ...prev, ...result } : prev),
    setComputing: setCtsComputing,
    onSettled: () => setCtsSettled(true),
  })

  const handleComputeCts = useCallback(async () => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      const result = await computeCtsForHike(hike, {
        pois: poisFullyLoaded ? pois : undefined,
        dtmProfile, terrainProfile, inProtectedArea,
        prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
      })
      if (result) setHike(prev => prev ? { ...prev, ...result } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }, [hike, poisFullyLoaded, pois, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax])

  const onHikeUpdate = useCallback((patch: Partial<PlannedHike>) => {
    setHike(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  // Stessa logica di GuidaHub.handleRouteModeChange: persiste la scelta e rifà subito CTS+Sicurezza,
  // perché entrambi dipendono dalle cifre effettive (sola andata / andata e ritorno).
  const onRouteModeChange = useCallback(async (mode: RouteMode) => {
    if (!hike || hike.routeMode === mode) return
    const updated: PlannedHike = { ...hike, routeMode: mode }
    setHike(updated)
    setCtsComputing(true)
    try {
      await updatePlannedMeta(hike.id, { routeMode: mode })
      const [cts, safety] = await Promise.all([
        computeCtsForHike(updated, {
          pois: poisFullyLoaded ? pois : undefined,
          dtmProfile, terrainProfile, inProtectedArea,
          prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
        }).catch(() => null),
        computeSafetyForHike(updated).catch(() => null),
      ])
      if (safety) setSafetyScore(safety)
      setHike(prev => prev && prev.id === updated.id ? {
        ...prev,
        ...(cts ?? {}),
        ...(safety ? { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() } : {}),
      } : prev)
      const refreshed = await getPlannedById(updated.id)
      if (refreshed) setHike(prev => prev && prev.id === updated.id ? { ...prev, cachedTsTotal: refreshed.cachedTsTotal } : prev)
    } finally {
      setCtsComputing(false)
    }
  }, [hike, poisFullyLoaded, pois, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax, setSafetyScore])

  const gpsPoints = hike?.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps = gpsPoints.length > 0

  // isLinearRoute/endPoint/returnOptions: nel lettore continuo (GuideReader.tsx) sono calcolati
  // internamente, non passati da GuidaHub — replicati qui identici (righe 238, 774-802 lì) perché
  // il widget "luoghi" (PoiListWidget → sezione "Tornare al punto di partenza") ne ha bisogno
  // esattamente come nel lettore continuo: senza, un percorso a tratta unica perderebbe in
  // silenzio quella sottosezione nel libro.
  const isLinearRoute = useMemo(() => classifyTrackShape(hike?.routePolyline ?? []) === 'linear', [hike?.routePolyline])
  const endPoint = useMemo(() => {
    if (!hike) return null
    const fromTrack = [...(hike.trackPoints ?? [])].reverse().find(p => p.lat != null && p.lon != null)
    if (fromTrack) return { lat: fromTrack.lat!, lon: fromTrack.lon! }
    const poly = hike.routePolyline
    if (poly && poly.length > 0) return { lat: poly[poly.length - 1][0], lon: poly[poly.length - 1][1] }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.trackPoints, hike?.routePolyline])

  const [returnOptions, setReturnOptions] = useState<ReturnOption[] | null>(null)
  useEffect(() => {
    setReturnOptions(null)
    if (!hike || !isLinearRoute || !endPoint) return
    let cancelled = false
    const cacheKey = LS_KEYS.returnOptions(hike.id)
    getCachedGeoInfo<ReturnOption[]>(cacheKey).then(cached => {
      if (cached.hit) { if (!cancelled) setReturnOptions(cached.value); return }
      fetch(`/api/route-build/return-options?lat=${endPoint.lat}&lon=${endPoint.lon}`)
        .then(res => res.json())
        .then(data => {
          const options: ReturnOption[] = Array.isArray(data.options) ? data.options : []
          if (!cancelled) setReturnOptions(options)
          setCachedGeoInfo(cacheKey, options)
        })
        .catch(() => { if (!cancelled) setReturnOptions([]) })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLinearRoute, endPoint, hike?.id])

  const scores: ScoresBundle = {
    safety: refinedSafety,
    personalSafety,
    cts: { result: ctsResult, cached: hike?.cachedTrailScore, beautyScore: hike?.cachedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts },
    showAspectToggle: hasGps && dtmProfile?.source === 'dtm',
    showGradientToggle: hasGps && dtmProfile?.source === 'dtm' && !!hike?.trackPoints?.some(p => p.altitudeMeters !== undefined),
    showAspect, showGradient,
    onToggleAspect: () => setShowAspect(a => !a),
    onToggleGradient: () => setShowGradient(g => !g),
  }

  const safetyDetails: SafetyDetailsBundle = {
    assessment: hike?.assessment, hasGps, osmId: hike?.osmId, polyline: hike?.routePolyline,
    plannedId: hike?.id ?? '', markers: hike?.difficultyMarkers ?? [], highlightedMarkerIndex: null,
  }

  const poiList: PoiListBundle = {
    pois, poiWikiEntries, hasGps, centerLat: centerPt?.lat, centerLon: centerPt?.lon,
    onWikiLoaded: () => {},
  }

  const natura: NaturaBundle = {
    hasGps: hasGps && !!hike?.routePolyline && hike.routePolyline.length >= 2,
    flora: flora.data, floraLoading: flora.loading,
    trackPoints: hike?.trackPoints ?? [],
    month: hike?.plannedDate ? new Date(hike.plannedDate).getMonth() + 1 : new Date().getMonth() + 1,
  }

  const weather = hasGps && centerPt?.lat != null && centerPt?.lon != null
    ? { lat: centerPt.lat, lon: centerPt.lon, mode: (hike?.plannedDate ? 'planned' : 'forecast') as 'planned' | 'forecast' }
    : undefined

  return {
    loading, notFound, hike, onHikeUpdate, enrichmentReady, hasAiAccess, aiUnavailable, trialExpired,
    driving, dtmProfile, onRouteModeChange, scores, safetyDetails, poiList, natura, weather,
    hasGps, pois, isLinearRoute, endPoint, returnOptions,
    highlightedPoiId,
    onPoiTap: (poiId: number) => setHighlightedPoiId(prev => prev === poiId ? null : poiId),
    scrollToSectionKey,
    onScrollToSectionConsumed: () => setScrollToSectionKey(null),
    requestScrollToSection: (key: GuideSectionKey) => setScrollToSectionKey(key),
  }
}
