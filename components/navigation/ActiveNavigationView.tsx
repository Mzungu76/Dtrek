'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BatteryWarning, ArrowUp, Flag, Leaf } from 'lucide-react'
import type { PlannedHike } from '@/lib/plannedStore'
import { fetchNearbyTrailPaths, type PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { detectRouteMoments } from '@/lib/navigation/routeMoments'
import { buildElevationProfile } from '@/lib/navigation/elevationProfile'
import type { PaceUpdateResult } from '@/lib/navigation/paceAssistant'
import { altitudeTerrainMultiplier } from '@/lib/trailScore'
import { getSunTimes, daylightMarginMinutes, type SunTimes } from '@/lib/daylight'
import { fetchDayHourly } from '@/lib/openmeteo'
import { requestOrientationPermission, isOrientationSupported, needsOrientationPermissionGesture } from '@/lib/navigation/orientation'
import { haversineM, computeBbox } from '@/lib/geoUtils'
import type { Natura2000Feature } from '@/lib/natura2000/natura2000Client'
import { extractCuriosita } from '@/lib/guideText'
import type { TrackPoint, TcxActivity } from '@/lib/tcxParser'
import { buildActivityFromTrack } from '@/lib/navigation/trackToActivity'
import { saveActivityWithEnrichment } from '@/lib/activitySave'
import {
  loadNavigationSession, saveNavigationSession, newSessionSnapshot,
  queueTrackFix, drainTrackQueue, requeueTrackFixes, type NavigationSessionSnapshot,
  appendRecordedTrackPoint, loadRecordedTrack, clearRecordedTrack,
} from '@/lib/navigation/navigationStore'
import { loadManifest } from '@/lib/offline/packageManifest'
import { watchBattery } from '@/lib/navigation/battery'
import { haptics } from '@/lib/navigation/haptics'
import type { NavInstruction, NavPoi, NavState, RouteMoment } from '@/lib/navigation/types'
import type { WildlifeRisk } from '@/lib/safetyScore'
import NavigationMap from './NavigationMap'
import NavigationMapLibre from './NavigationMapLibre'
import MapModeSwitcher, { type MapMode } from './MapModeSwitcher'
import PoiCalloutSheet from './PoiCalloutSheet'
import RiddleSheet from './RiddleSheet'
import CivicReportSheet from './CivicReportSheet'
import SpeciesIdentifySheet from './SpeciesIdentifySheet'
import { PoiSpatialIndex } from '@/lib/navigation/poiProximity'
import type { TrailRiddle } from '@/lib/riddles'
import { EPOCH_LABELS, type Epoch, type EpochPoi } from '@/lib/epochPois'
import InstructionBanner from './InstructionBanner'
import NavBottomSheet from './NavBottomSheet'
import ConfirmEndDialog from './ConfirmEndDialog'
import EndHikeReviewDialog from './EndHikeReviewDialog'
import { speak } from '@/lib/navigation/speech'

interface Props {
  hike: PlannedHike
}

const FIX_STALE_MS = 20000 // if no fix arrives for this long, "moving time" stops accruing

export default function ActiveNavigationView({ hike }: Props) {
  const router = useRouter()
  const engineRef = useRef<NavigationEngine | null>(null)
  const sessionRef = useRef<NavigationSessionSnapshot | null>(null)
  const remoteSessionId = useRef<string | null>(null)
  const pendingEvents = useRef<{ type: string; payload?: Record<string, unknown>; createdAt: string }[]>([])
  const speechEnabledRef = useRef(true)
  const timerRunningRef = useRef(false)
  const lastFixAtRef = useRef<number | null>(null)
  const endConfirmedRef = useRef(false)
  // Raw fixes recorded while the timer is running (paused stretches are
  // excluded, same gate as the displayed distance/time stats) — the source
  // for the optional "save as a completed activity" step when navigation ends.
  const recordedTrackRef = useRef<TrackPoint[]>([])

  const [state, setState] = useState<NavState>('idle')
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ distanceAlongRouteM: number; totalRouteM: number } | null>(null)
  const [traveledDistanceM, setTraveledDistanceM] = useState(0)
  const [currentSpeedMs, setCurrentSpeedMs] = useState<number | null>(null)
  const [movingTimeMs, setMovingTimeMs] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [mapFallbackNotice, setMapFallbackNotice] = useState(false)
  const [instruction, setInstruction] = useState<{ current: NavInstruction; next: NavInstruction | null; distanceToNextM: number | null } | null>(null)
  const [callout, setCallout] = useState<{ title: string; extract?: string; imageUrl?: string } | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [mapMode, setMapMode] = useState<MapMode>('offline')
  const [is3D, setIs3D] = useState(false)
  const [nearbyTrails, setNearbyTrails] = useState<[number, number][][]>([])
  const [pendingActivity, setPendingActivity] = useState<TcxActivity | null>(null)
  const [gpsLostPermissionDenied, setGpsLostPermissionDenied] = useState(false)
  const [offRouteBearingDeg, setOffRouteBearingDeg] = useState<number | null>(null)
  const [lowBatteryNotice, setLowBatteryNotice] = useState(false)
  const [offlinePackageWarning, setOfflinePackageWarning] = useState(false)
  const [showNatura2000, setShowNatura2000] = useState(false)
  const [showGeologia, setShowGeologia] = useState(false)
  const [geologiaUnavailable, setGeologiaUnavailable] = useState(false)
  const [geologiaUnavailableDismissed, setGeologiaUnavailableDismissed] = useState(false)
  const [natura2000Features, setNatura2000Features] = useState<Natura2000Feature[]>([])
  const [wildlifeAlertDismissed, setWildlifeAlertDismissed] = useState(false)
  const [pace, setPace] = useState<PaceUpdateResult | null>(null)
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null)
  const [turnBackDismissed, setTurnBackDismissed] = useState(false)
  const turnBackAlertedRef = useRef(false)
  const [activeRiddle, setActiveRiddle] = useState<TrailRiddle | null>(null)
  const shownRiddleIdsRef = useRef<Set<string>>(new Set())
  const [showCivicReport, setShowCivicReport] = useState(false)
  const [showSpeciesIdentify, setShowSpeciesIdentify] = useState(false)

  // Already computed and cached pre-trip (region table + real GBIF occurrences + guardian-dog
  // OSM heuristic merged in lib/safetyScore.ts's getWildlifeRisks) — an area-wide, season/region
  // signal, not a point sighting feed, so this surfaces once per hike rather than as a
  // GPS-proximity trigger like POI callouts. Only shown when there's an actual elevated risk.
  const relevantWildlifeRisks = useMemo<WildlifeRisk[]>(() => {
    return (hike.cachedSafetyScore?.wildlifeRisks ?? []).filter((w) => w.dangerLevel === 'alto' || w.dangerLevel === 'moderato')
  }, [hike.cachedSafetyScore])

  const pois = useMemo<NavPoi[]>(() => {
    const raw = (hike.cachedPois ?? []) as PoiItem[]
    return raw.filter((p) => p.lat != null && p.lon != null).map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, name: p.name }))
  }, [hike.cachedPois])

  const poiWikiById = useMemo(() => {
    const map = new Map<string | number, WikiPage>()
    const raw = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
    for (const entry of raw) if (entry?.poi?.id != null) map.set(entry.poi.id, entry.wiki)
    return map
  }, [hike.cachedPoiWiki])

  const moments = useMemo<RouteMoment[]>(() => detectRouteMoments(hike.trackPoints ?? []), [hike.trackPoints])
  const elevationProfile = useMemo(() => buildElevationProfile(hike.trackPoints ?? []), [hike.trackPoints])
  // sacScale/surfaces/avgSlopeDeg aren't available on PlannedHike at navigation time (only
  // computed at trail-detail time) — only the altitude-physiology term applies live, terrain
  // multiplier defaults to 1 until those fields are cached onto the hike object too.
  const terrainMultiplier = useMemo(() => altitudeTerrainMultiplier(hike.altitudeMax).altPhysioMult, [hike.altitudeMax])
  const routePolyline = hike.routePolyline ?? []

  // Riddles ("indovinelli per tappa") use the same proximity-index mechanism as POIs
  // (lib/navigation/poiProximity.ts), but kept separate from the engine's own POI index —
  // they're a content/gamification concern, not a navigation-state one, and don't need to
  // participate in the poi_near state transition or the enteredPoi/leftPoi event pair.
  const riddles = useMemo<TrailRiddle[]>(() => hike.cachedRiddles ?? [], [hike.cachedRiddles])
  const riddleIndex = useMemo(
    () => new PoiSpatialIndex(riddles.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, notifyRadiusM: 60 }))),
    [riddles],
  )

  // Stratigrafia temporale: "oggi" means no historical overlay (normal navigation), the
  // slider only ever offers epochs this specific hike actually has content for — never a
  // fixed etrusca/romana/medievale set regardless of what was generated for the guide.
  const epochPois = useMemo<EpochPoi[]>(() => hike.cachedEpochPois ?? [], [hike.cachedEpochPois])
  const availableEpochs = useMemo<Epoch[]>(() => {
    const historical = (['etrusca', 'romana', 'medievale'] as const).filter((e) => epochPois.some((p) => p.epoch === e))
    return historical.length > 0 ? [...historical, 'oggi'] : []
  }, [epochPois])
  const [selectedEpoch, setSelectedEpoch] = useState<Epoch>('oggi')
  const filteredEpochPois = useMemo(() => epochPois.filter((p) => p.epoch === selectedEpoch), [epochPois, selectedEpoch])
  const epochPoiIndex = useMemo(
    () => new PoiSpatialIndex(filteredEpochPois.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, notifyRadiusM: 60 }))),
    [filteredEpochPois],
  )
  const shownEpochPoiIdsRef = useRef<Set<string>>(new Set())
  const [activeEpochCallout, setActiveEpochCallout] = useState<EpochPoi | null>(null)
  const guideExcerpts = useMemo(() => extractCuriosita(hike.cachedGuide ?? ''), [hike.cachedGuide])

  // Best-effort, non-blocking: gives the offline basemap some sense of
  // "what other paths pass near here" instead of just a bare tile layer
  // with one highlighted line — an explicit complaint ("la mappa offline
  // mi sembra troppo generica"). Silently does nothing if offline or if
  // Overpass is unreachable; the route/POIs already on the map still work.
  useEffect(() => {
    if (routePolyline.length < 2) return
    fetchNearbyTrailPaths(routePolyline).then(setNearbyTrails).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  // Same "fetch once for the route's bbox" pattern as lib/natura2000/checkProtectedArea.ts,
  // minus the point-in-polygon step — the raw polygons are drawn as a map overlay here, not
  // reduced to a boolean. Best-effort: an empty/failed fetch just means the toggle shows nothing.
  useEffect(() => {
    if (routePolyline.length < 2) return
    const bbox = computeBbox(routePolyline)
    fetch(`/api/natura2000?bbox=${bbox}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((features) => setNatura2000Features(Array.isArray(features) ? features : []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  const positionRef = useRef(position)
  positionRef.current = position

  // Feeds PaceAssistant's weather correction (lib/navigation/paceAssistant.ts) — the engine
  // itself makes no network calls, so this owns the periodic Open-Meteo refresh and pushes
  // the result in. Refreshed every 20min, not per GPS fix: hourly weather doesn't need
  // finer granularity, and re-fetching on every fix would hammer the API for no benefit.
  useEffect(() => {
    if (routePolyline.length === 0) return
    let cancelled = false
    const WEATHER_REFRESH_MS = 20 * 60 * 1000

    function refreshWeather() {
      const [lat, lon] = positionRef.current ? [positionRef.current.lat, positionRef.current.lon] : routePolyline[0]
      const today = new Date().toISOString().slice(0, 10)
      fetchDayHourly(lat, lon, today).then((hours) => {
        if (cancelled || !hours.length) return
        const nowMs = Date.now()
        const closest = hours.reduce((best, h) =>
          Math.abs(new Date(h.time).getTime() - nowMs) < Math.abs(new Date(best.time).getTime() - nowMs) ? h : best)
        engineRef.current?.setWeatherConditions({ tempC: closest.temperature, windKmh: closest.windspeed, precipMm: closest.precipitation })
      }).catch(() => {})
    }

    refreshWeather()
    const id = setInterval(refreshWeather, WEATHER_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  // Sunset/dusk for the daylight countdown + turn-back advisory — recomputed every 10min
  // (stable to the minute over small position deltas, no need for per-fix precision).
  useEffect(() => {
    if (routePolyline.length === 0) return
    let cancelled = false
    const SUN_REFRESH_MS = 10 * 60 * 1000

    function refreshSunTimes() {
      const [lat, lon] = positionRef.current ? [positionRef.current.lat, positionRef.current.lon] : routePolyline[0]
      const times = getSunTimes(lat, lon, new Date())
      if (!cancelled) setSunTimes(times)
    }

    refreshSunTimes()
    const id = setInterval(refreshSunTimes, SUN_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  const remainingPois = useMemo(() => {
    if (!position) return pois.map((p) => ({ id: p.id, name: p.name, distanceM: 0 }))
    return pois
      .map((p) => ({ id: p.id, name: p.name, distanceM: haversineM(position.lat, position.lon, p.lat, p.lon) }))
      .sort((a, b) => a.distanceM - b.distanceM)
  }, [pois, position])

  const logEvent = (type: string, payload?: Record<string, unknown>) => {
    pendingEvents.current.push({ type, payload, createdAt: new Date().toISOString() })
  }

  const speakIfEnabled = (text: string) => { if (speechEnabledRef.current) speak(text) }

  const flushToServer = async () => {
    if (!remoteSessionId.current) return
    const track = await drainTrackQueue(sessionRef.current!.sessionId)
    const events = pendingEvents.current.splice(0, pendingEvents.current.length)
    if (!track.length && !events.length) return
    try {
      const res = await fetch('/api/navigation/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, events, track }),
      })
      // A non-throwing non-OK response (401 expired session, 500, 413 batch
      // too large...) used to be treated as delivered and the batch was
      // dropped for good — only a fetch() that itself threw got requeued.
      // Put both events and track fixes back so the next flush retries them.
      if (!res.ok) {
        pendingEvents.current.unshift(...events)
        await requeueTrackFixes(sessionRef.current!.sessionId, track)
      }
    } catch {
      // best-effort: keep the events for the next flush attempt if the request itself throws before sending
      pendingEvents.current.unshift(...events)
      await requeueTrackFixes(sessionRef.current!.sessionId, track)
    }
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const restored = await loadNavigationSession(hike.id)
      const snapshot = restored ?? newSessionSnapshot(hike.id, crypto.randomUUID())
      sessionRef.current = snapshot

      // Restore any recorded points from a previous run that crashed/was
      // killed before confirmEnd() got to run — otherwise a tab crash right
      // before the end-of-hike review step silently loses the chance to
      // save the completed activity, even though the raw fixes made it into
      // the offline sync queue.
      recordedTrackRef.current = await loadRecordedTrack(hike.id)

      fetch('/api/navigation/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedHikeId: hike.id }),
      }).then((r) => r.ok ? r.json() : null).then((data) => { if (data?.sessionId) remoteSessionId.current = data.sessionId }).catch(() => {})

      const engine = new NavigationEngine({ routePolyline, pois, moments, elevationProfile, terrainMultiplier })
      engineRef.current = engine

      engine.on('stateChanged', ({ to }) => { if (!cancelled) setState(to) })
      engine.on('paceUpdated', (result) => { if (!cancelled) setPace(result) })
      engine.on('positionUpdated', ({ raw, smoothed, progress, traveledDistanceM, instantSpeedMs }) => {
        if (cancelled) return
        lastFixAtRef.current = Date.now()
        setPosition({ lat: smoothed.lat, lon: smoothed.lon })
        setAccuracyM(raw.accuracyM ?? null)
        // Position keeps updating even while the stats timer is paused (the
        // hiker still wants to see themselves on the map) — only the
        // recorded distance/speed stats freeze.
        if (timerRunningRef.current) {
          setProgress({ distanceAlongRouteM: progress.distanceAlongRouteM, totalRouteM: progress.totalRouteM })
          setTraveledDistanceM(traveledDistanceM)
          setCurrentSpeedMs(instantSpeedMs)
          const point: TrackPoint = {
            time: new Date(raw.ts).toISOString(),
            lat: raw.lat,
            lon: raw.lon,
            altitudeMeters: raw.altitudeM ?? undefined,
            speedMs: raw.speedMs ?? undefined,
          }
          recordedTrackRef.current.push(point)
          appendRecordedTrackPoint(hike.id, point).catch(() => {})
        }
        queueTrackFix(snapshot.sessionId, { ts: raw.ts, lat: raw.lat, lon: raw.lon, altitudeM: raw.altitudeM, speedMs: raw.speedMs, accuracyM: raw.accuracyM })
      })
      engine.on('bearingUpdated', ({ bearingDeg }) => { if (!cancelled) setBearing(bearingDeg) })
      engine.on('instructionUpdated', (payload) => { if (!cancelled) setInstruction(payload) })
      engine.on('enteredPoi', ({ poi }) => {
        if (cancelled) return
        logEvent('poi_reached', { poiId: poi.id })
        const wiki = poiWikiById.get(poi.id)
        setCallout({ title: poi.name ?? 'Punto di interesse', extract: wiki?.extract, imageUrl: wiki?.thumbnail })
        speakIfEnabled(`${poi.name ?? 'Sei vicino a un punto di interesse'}. ${wiki?.extract ?? ''}`.trim())
        haptics.notify()
      })
      engine.on('momentReached', ({ moment }) => {
        if (cancelled) return
        logEvent('moment_reached', { momentId: moment.id, kind: moment.kind })
        setCallout({ title: 'Giulia', extract: moment.text })
        speakIfEnabled(moment.text)
        haptics.notify()
      })
      engine.on('offRoute', ({ distanceToRouteM, bearingToRouteDeg }) => {
        if (cancelled) return
        logEvent('off_route', { distanceToRouteM })
        setOffRouteBearingDeg(bearingToRouteDeg)
        speakIfEnabled('Sei fuori dal percorso pianificato')
        haptics.alert()
      })
      engine.on('backOnRoute', () => {
        if (cancelled) return
        logEvent('on_route_again')
        setOffRouteBearingDeg(null)
      })
      engine.on('gpsLost', ({ permissionDenied }) => {
        if (cancelled) return
        logEvent('gps_lost', { permissionDenied })
        setGpsLostPermissionDenied(permissionDenied)
        speakIfEnabled(permissionDenied ? 'Permesso di localizzazione negato' : 'Segnale GPS assente')
        haptics.alert()
      })
      engine.on('gpsRecovered', () => {
        if (cancelled) return
        logEvent('gps_recovered')
        setGpsLostPermissionDenied(false)
      })

      engine.start()
    })()

    const onlineListener = () => { setIsOnline(navigator.onLine); if (navigator.onLine) flushToServer() }
    window.addEventListener('online', onlineListener)
    window.addEventListener('offline', onlineListener)
    setIsOnline(navigator.onLine)

    // A dead phone mid-hike means no map and no GPS — warn once while
    // there's still time to react (power bank, screen brightness), and log
    // it so it shows up alongside the other navigation events.
    const stopBatteryWatch = watchBattery((level) => {
      if (cancelled) return
      setLowBatteryNotice(true)
      logEvent('low_battery', { level })
      speakIfEnabled('Batteria del telefono scarica')
      haptics.alert()
    })

    // If we're starting offline (or go offline before this resolves) with no
    // fully-downloaded offline map package for this hike, some areas of the
    // route may not be covered by cached tiles — worth a one-time heads-up
    // instead of the hiker discovering blank map tiles mid-trail.
    loadManifest(hike.id).then((manifest) => {
      if (cancelled) return
      if (!navigator.onLine && manifest?.status !== 'ready') setOfflinePackageWarning(true)
    }).catch(() => {})

    const flushInterval = setInterval(() => { if (navigator.onLine) flushToServer() }, 30000)
    // "Moving time" ticks once a second while fixes keep arriving and the
    // timer isn't paused — a rough stand-in for Komoot's moving-vs-stopped
    // distinction without needing a separate speed-threshold state machine.
    const movingTimeInterval = setInterval(() => {
      if (timerRunningRef.current && lastFixAtRef.current != null && Date.now() - lastFixAtRef.current < FIX_STALE_MS) {
        setMovingTimeMs((prev) => prev + 1000)
      }
    }, 1000)

    return () => {
      cancelled = true
      engineRef.current?.stop()
      window.removeEventListener('online', onlineListener)
      window.removeEventListener('offline', onlineListener)
      stopBatteryWatch()
      clearInterval(flushInterval)
      clearInterval(movingTimeInterval)
      if (sessionRef.current) saveNavigationSession({ ...sessionRef.current, state, lastFix: null, lastBearingDeg: bearing }).catch(() => {})
      flushToServer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  // The MapTiler-backed 3D styles need connectivity — fall back to the offline-safe map the moment the network drops.
  useEffect(() => {
    if (!isOnline && mapMode !== 'offline') setMapMode('offline')
  }, [isOnline, mapMode])

  const handleMapStyleFailed = (reason: string) => {
    // NavigationMapLibre already console.error's the detailed reason (key
    // missing/rejected, network, timeout...) — kept out of this user-facing
    // notice on purpose, but surfaced here too in case this handler is ever
    // reached without that log (e.g. future callers).
    console.error('[ActiveNavigationView] falling back to offline map:', reason)
    setMapMode('offline')
    setMapFallbackNotice(true)
    setTimeout(() => setMapFallbackNotice(false), 5000)
  }

  // Ending navigation must be a deliberate action: a stray tap on the close
  // button, the browser/phone back gesture, or an accidental tab close
  // should never silently drop a session mid-hike. We push a guard history
  // entry so a back-navigation is caught by popstate instead of leaving the
  // page, and warn on tab close/refresh via beforeunload (best-effort only —
  // iOS Safari ignores the custom message and sometimes the prompt itself).
  useEffect(() => {
    history.pushState({ dtrekNavGuard: true }, '')

    const onPopState = () => {
      if (endConfirmedRef.current) return
      history.pushState({ dtrekNavGuard: true }, '')
      setShowConfirmEnd(true)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (endConfirmedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('popstate', onPopState)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  // Only iOS Safari gates the compass behind an explicit tap. Everywhere
  // else, requestOrientationPermission() resolves true with no native
  // prompt at all — silently enable it on mount instead of showing a button
  // that, on those platforms, does nothing visible when tapped (reported
  // as a confusing/"useless" control).
  useEffect(() => {
    if (isOrientationSupported() && !needsOrientationPermissionGesture()) {
      requestOrientationPermission().then(setCompassEnabled)
    }
  }, [])

  const handleEnableCompass = async () => {
    const granted = await requestOrientationPermission()
    setCompassEnabled(granted)
  }

  const handleToggleSpeech = () => {
    speechEnabledRef.current = !speechEnabledRef.current
    setSpeechEnabled(speechEnabledRef.current)
  }

  const handleTogglePlayPause = () => {
    timerRunningRef.current = !timerRunningRef.current
    setTimerRunning(timerRunningRef.current)
  }

  const requestEnd = () => setShowConfirmEnd(true)

  const goToPlannedHike = () => router.push(`/programma/${hike.id}`)

  const confirmEnd = async () => {
    endConfirmedRef.current = true
    setShowConfirmEnd(false)
    haptics.success()
    if (remoteSessionId.current) {
      fetch('/api/navigation/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, status: 'completed' }),
      }).catch(() => {})
    }
    engineRef.current?.stop()

    // Enough of a recorded track to be worth offering a save — same review
    // step as importing an external GPX/FIT/TCX, instead of silently
    // discarding what was just walked.
    if (recordedTrackRef.current.length >= 2) {
      try {
        setPendingActivity(buildActivityFromTrack(recordedTrackRef.current))
        return
      } catch {
        // fall through to the original close behavior if the track can't be turned into an activity
      }
    }
    clearRecordedTrack(hike.id).catch(() => {})
    goToPlannedHike()
  }

  const cancelEnd = () => setShowConfirmEnd(false)

  const handleSaveRecordedActivity = async (title: string) => {
    if (!pendingActivity) return
    const saved = await saveActivityWithEnrichment(pendingActivity, {
      title,
      linkedPlannedId: hike.id,
      linkedPlannedTrackPoints: (hike.trackPoints ?? []).filter((p) => p.lat && p.lon),
      hikeNotes: hike.hikeNotes,
      deleteLinkedPlanned: true,
    })
    clearRecordedTrack(hike.id).catch(() => {})
    router.push(`/escursione/${encodeURIComponent(saved.id)}`)
  }

  const handleDiscardRecordedActivity = () => {
    setPendingActivity(null)
    clearRecordedTrack(hike.id).catch(() => {})
    goToPlannedHike()
  }

  const distanceRemainingM = progress ? Math.max(0, progress.totalRouteM - progress.distanceAlongRouteM) : 0
  const avgSpeedMs = movingTimeMs > 0 ? traveledDistanceM / (movingTimeMs / 1000) : null
  const legacyEtaDate = avgSpeedMs && avgSpeedMs > 0.05 && distanceRemainingM > 0
    ? new Date(Date.now() + (distanceRemainingM / avgSpeedMs) * 1000)
    : null
  // PaceAssistant's live estimate (Naismith + weather + observed-pace blend) once it has
  // enough signal; falls back to the flat average-speed formula for the first stretch of
  // the hike (low confidence) rather than showing nothing.
  const etaDate = pace?.liveEtaDate ?? legacyEtaDate

  const daylightMarginMin = sunTimes?.sunset && etaDate ? daylightMarginMinutes(etaDate, sunTimes.sunset) : null

  // Turn-back advisory: even retracing the already-hiked portion starting right now, would
  // the hiker beat usable light (civil twilight end, minus a safety buffer)? Warning-only —
  // no alternate route is computed, matching the "avviso tempo insufficiente" scope.
  const TURN_BACK_SAFETY_BUFFER_MS = 30 * 60 * 1000
  const turnBackNow = !!(pace?.returnTripTimeSec != null && sunTimes?.dusk &&
    (Date.now() + pace.returnTripTimeSec * 1000) > (sunTimes.dusk.getTime() - TURN_BACK_SAFETY_BUFFER_MS))

  useEffect(() => {
    if (!position || riddles.length === 0 || activeRiddle || callout) return
    const nearby = riddleIndex.nearby(position.lat, position.lon)
    const next = nearby.find((n) => !shownRiddleIdsRef.current.has(String(n.poi.id)))
    if (next) {
      const riddle = riddles.find((r) => r.id === next.poi.id)
      if (riddle) {
        shownRiddleIdsRef.current.add(riddle.id)
        setActiveRiddle(riddle)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, activeRiddle, callout])

  // Switching epoch is a deliberate "look back in time" action — re-arm every epoch poi as
  // unshown so the hiker sees the relevant callouts again for the newly selected period.
  useEffect(() => {
    shownEpochPoiIdsRef.current = new Set()
    setActiveEpochCallout(null)
  }, [selectedEpoch])

  useEffect(() => {
    if (!position || selectedEpoch === 'oggi' || filteredEpochPois.length === 0 || activeEpochCallout || callout || activeRiddle) return
    const nearby = epochPoiIndex.nearby(position.lat, position.lon)
    const next = nearby.find((n) => !shownEpochPoiIdsRef.current.has(String(n.poi.id)))
    if (next) {
      const epochPoi = filteredEpochPois.find((p) => p.id === next.poi.id)
      if (epochPoi) {
        shownEpochPoiIdsRef.current.add(epochPoi.id)
        setActiveEpochCallout(epochPoi)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, selectedEpoch, activeEpochCallout, callout, activeRiddle])

  useEffect(() => {
    if (turnBackNow && !turnBackAlertedRef.current) {
      turnBackAlertedRef.current = true
      logEvent('turnback_warning')
      if (speechEnabledRef.current) speak('Attenzione: potresti non avere abbastanza luce per rientrare. Valuta di tornare indietro ora.')
      haptics.alert()
    } else if (!turnBackNow) {
      turnBackAlertedRef.current = false
      setTurnBackDismissed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnBackNow])

  return (
    <div className="fixed inset-0 z-[2000] bg-stone-900 font-body">
      {mapMode === 'offline' ? (
        <NavigationMap routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state} nearbyTrails={nearbyTrails} accuracyM={accuracyM} />
      ) : (
        <NavigationMapLibre
          routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state}
          styleId={mapMode} is3D={is3D} onStyleFailed={handleMapStyleFailed} accuracyM={accuracyM}
          natura2000Features={natura2000Features} showNatura2000={showNatura2000} showGeologia={showGeologia}
          onGeologiaUnavailable={() => setGeologiaUnavailable(true)}
        />
      )}

      {geologiaUnavailable && !geologiaUnavailableDismissed && (
        <div className="absolute top-[210px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg z-10 font-body flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          Layer geologico non disponibile (servizio esterno momentaneamente giù)
          <button onClick={() => setGeologiaUnavailableDismissed(true)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
        </div>
      )}

      {availableEpochs.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-white/95 rounded-full shadow-lg p-1">
          {availableEpochs.map((epoch) => (
            <button
              key={epoch}
              onClick={() => setSelectedEpoch(epoch)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
                selectedEpoch === epoch ? 'bg-terra-500 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {EPOCH_LABELS[epoch]}
            </button>
          ))}
        </div>
      )}

      {mapFallbackNotice && (
        <div className="absolute top-[210px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg z-10 font-body">
          Mappa online non disponibile, uso la mappa offline
        </div>
      )}

      {offlinePackageWarning && (
        <div className="absolute top-[210px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg z-10 font-body flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          Mappa offline incompleta per questo percorso
          <button onClick={() => setOfflinePackageWarning(false)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
        </div>
      )}

      {state !== 'idle' && relevantWildlifeRisks.length > 0 && !wildlifeAlertDismissed && (
        <div className="absolute top-[210px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm px-4 py-3 rounded-xl bg-stone-800 text-white text-xs shadow-lg z-10 font-body">
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">🐾</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold mb-1">Fauna nella zona: {relevantWildlifeRisks.map((w) => w.animal).join(', ')}</p>
              <p className="text-stone-300 leading-snug">{relevantWildlifeRisks[0].tip}</p>
            </div>
            <button onClick={() => setWildlifeAlertDismissed(true)} className="text-stone-400 hover:text-white shrink-0" aria-label="Chiudi avviso">✕</button>
          </div>
        </div>
      )}

      <div className="absolute right-3 z-10" style={{ top: 'calc(50% + 60px)' }}>
        <MapModeSwitcher
          mode={mapMode} onModeChange={setMapMode} is3D={is3D} onToggle3D={() => setIs3D((v) => !v)} isOnline={isOnline}
          showNatura2000={showNatura2000} onToggleNatura2000={() => setShowNatura2000((v) => !v)}
          showGeologia={showGeologia} onToggleGeologia={() => setShowGeologia((v) => !v)}
        />
      </div>

      <button
        onClick={() => setShowCivicReport(true)}
        className="absolute right-3 z-10 w-11 h-11 rounded-full bg-white text-stone-700 shadow-lg flex items-center justify-center"
        style={{ top: 'calc(50% + 118px)' }}
        aria-label="Segnala qualcosa lungo il percorso"
      >
        <Flag className="w-5 h-5" />
      </button>

      {isOnline && (
        <button
          onClick={() => setShowSpeciesIdentify(true)}
          className="absolute right-3 z-10 w-11 h-11 rounded-full bg-white text-stone-700 shadow-lg flex items-center justify-center"
          style={{ top: 'calc(50% + 176px)' }}
          aria-label="Riconosci pianta o animale da una foto"
        >
          <Leaf className="w-5 h-5" />
        </button>
      )}

      {showCivicReport && (
        <CivicReportSheet position={position} plannedHikeId={hike.id} onClose={() => setShowCivicReport(false)} />
      )}

      {showSpeciesIdentify && (
        <SpeciesIdentifySheet position={position} onClose={() => setShowSpeciesIdentify(false)} />
      )}

      <InstructionBanner
        current={instruction?.current ?? null}
        next={instruction?.next ?? null}
        distanceToNextM={instruction?.distanceToNextM ?? null}
        speechEnabled={speechEnabled}
        onToggleSpeech={handleToggleSpeech}
        onClose={requestEnd}
        isOnline={isOnline}
        compassSupported={isOrientationSupported() && needsOrientationPermissionGesture()}
        compassEnabled={compassEnabled}
        onEnableCompass={handleEnableCompass}
      />

      {state === 'off_route' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-terra-500 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2 z-10">
          {offRouteBearingDeg != null && (
            <ArrowUp size={16} className="shrink-0" style={{ transform: `rotate(${offRouteBearingDeg}deg)` }} />
          )}
          <AlertTriangle size={16} className="shrink-0" /> Sei fuori dal percorso{offRouteBearingDeg != null ? ' — torna verso la freccia' : ' pianificato'}
        </div>
      )}
      {state === 'gps_lost' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2 z-10 text-center">
          <AlertTriangle size={16} className="shrink-0" />
          {gpsLostPermissionDenied
            ? 'Permesso di localizzazione negato — attivalo nelle impostazioni del browser/telefono'
            : 'Segnale GPS assente'}
        </div>
      )}
      {lowBatteryNotice && (
        // Stacked above the off-route/gps-lost banners (both mutually
        // exclusive with each other, but not with a low battery, which can
        // happen at the same time), so the two never overlap.
        <div className={`absolute ${state === 'off_route' || state === 'gps_lost' ? 'bottom-40' : 'bottom-24'} left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2 z-10`}>
          <BatteryWarning size={16} className="shrink-0 text-amber-400" /> Batteria scarica
          <button onClick={() => setLowBatteryNotice(false)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
        </div>
      )}
      {turnBackNow && !turnBackDismissed && (() => {
        // A 3rd stacked tier: off-route/gps-lost (tier 0) + low battery (its own tier when
        // either of those is also active) can both coexist with this one.
        const tierBelow = (state === 'off_route' || state === 'gps_lost' ? 1 : 0) + (lowBatteryNotice ? 1 : 0)
        const bottomClass = tierBelow >= 2 ? 'bottom-56' : tierBelow === 1 ? 'bottom-40' : 'bottom-24'
        return (
          <div className={`absolute ${bottomClass} left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2 z-10 text-center`}>
            <AlertTriangle size={16} className="shrink-0" />
            Luce insufficiente per rientrare — valuta di tornare indietro ora
            <button onClick={() => setTurnBackDismissed(true)} className="text-red-200 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
          </div>
        )
      })()}

      <NavBottomSheet
        distanceCoveredM={traveledDistanceM}
        distanceRemainingM={distanceRemainingM}
        currentSpeedMs={currentSpeedMs}
        avgSpeedMs={avgSpeedMs}
        movingTimeMs={movingTimeMs}
        etaDate={etaDate}
        paceStatus={pace?.paceStatus ?? 'estimating'}
        daylightMarginMin={daylightMarginMin}
        timerRunning={timerRunning}
        onTogglePlayPause={handleTogglePlayPause}
        onStop={requestEnd}
        trackPoints={hike.trackPoints ?? []}
        currentDistanceM={progress?.distanceAlongRouteM ?? 0}
        remainingPois={remainingPois}
        guideExcerpts={guideExcerpts}
      />

      {callout && (
        <PoiCalloutSheet title={callout.title} extract={callout.extract} imageUrl={callout.imageUrl} onClose={() => setCallout(null)} />
      )}

      {activeRiddle && (
        <RiddleSheet question={activeRiddle.question} answer={activeRiddle.answer} onClose={() => setActiveRiddle(null)} />
      )}

      {activeEpochCallout && (
        <PoiCalloutSheet
          title={`${activeEpochCallout.poiName} — ${EPOCH_LABELS[activeEpochCallout.epoch]}`}
          extract={activeEpochCallout.text}
          onClose={() => setActiveEpochCallout(null)}
        />
      )}

      {showConfirmEnd && <ConfirmEndDialog onConfirm={confirmEnd} onCancel={cancelEnd} />}

      {pendingActivity && (
        <EndHikeReviewDialog
          activity={pendingActivity}
          defaultTitle={hike.title}
          onSave={handleSaveRecordedActivity}
          onDiscard={handleDiscardRecordedActivity}
        />
      )}
    </div>
  )
}
