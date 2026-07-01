'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { detectRouteMoments } from '@/lib/navigation/routeMoments'
import { requestOrientationPermission, isOrientationSupported } from '@/lib/navigation/orientation'
import {
  loadNavigationSession, saveNavigationSession, newSessionSnapshot,
  queueTrackFix, drainTrackQueue, type NavigationSessionSnapshot,
} from '@/lib/navigation/navigationStore'
import type { NavInstruction, NavPoi, NavState, RouteMoment } from '@/lib/navigation/types'
import NavigationMap from './NavigationMap'
import NavigationMapLibre from './NavigationMapLibre'
import MapModeSwitcher, { type MapMode } from './MapModeSwitcher'
import PoiCalloutSheet from './PoiCalloutSheet'
import InstructionBanner from './InstructionBanner'
import NavStatsPanel from './NavStatsPanel'
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
  const timerRunningRef = useRef(true)
  const lastFixAtRef = useRef<number | null>(null)

  const [state, setState] = useState<NavState>('idle')
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ distanceAlongRouteM: number; totalRouteM: number } | null>(null)
  const [traveledDistanceM, setTraveledDistanceM] = useState(0)
  const [currentSpeedMs, setCurrentSpeedMs] = useState<number | null>(null)
  const [movingTimeMs, setMovingTimeMs] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const [statsExpanded, setStatsExpanded] = useState(true)
  const [instruction, setInstruction] = useState<{ current: NavInstruction; next: NavInstruction | null; distanceToNextM: number | null } | null>(null)
  const [callout, setCallout] = useState<{ title: string; extract?: string; imageUrl?: string } | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [mapMode, setMapMode] = useState<MapMode>('offline')
  const [is3D, setIs3D] = useState(false)

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
  const routePolyline = hike.routePolyline ?? []

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
      await fetch('/api/navigation/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, events, track }),
      })
    } catch {
      // best-effort: keep the events for the next flush attempt if the request itself throws before sending
      pendingEvents.current.unshift(...events)
    }
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const restored = await loadNavigationSession(hike.id)
      const snapshot = restored ?? newSessionSnapshot(hike.id, crypto.randomUUID())
      sessionRef.current = snapshot

      fetch('/api/navigation/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedHikeId: hike.id }),
      }).then((r) => r.ok ? r.json() : null).then((data) => { if (data?.sessionId) remoteSessionId.current = data.sessionId }).catch(() => {})

      const engine = new NavigationEngine({ routePolyline, pois, moments })
      engineRef.current = engine

      engine.on('stateChanged', ({ to }) => { if (!cancelled) setState(to) })
      engine.on('positionUpdated', ({ raw, smoothed, progress, traveledDistanceM, instantSpeedMs }) => {
        if (cancelled) return
        lastFixAtRef.current = Date.now()
        setPosition({ lat: smoothed.lat, lon: smoothed.lon })
        // Position keeps updating even while the stats timer is paused (the
        // hiker still wants to see themselves on the map) — only the
        // recorded distance/speed stats freeze.
        if (timerRunningRef.current) {
          setProgress({ distanceAlongRouteM: progress.distanceAlongRouteM, totalRouteM: progress.totalRouteM })
          setTraveledDistanceM(traveledDistanceM)
          setCurrentSpeedMs(instantSpeedMs)
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
      })
      engine.on('momentReached', ({ moment }) => {
        if (cancelled) return
        logEvent('moment_reached', { momentId: moment.id, kind: moment.kind })
        setCallout({ title: 'Giulia', extract: moment.text })
        speakIfEnabled(moment.text)
      })
      engine.on('offRoute', ({ distanceToRouteM }) => { if (!cancelled) logEvent('off_route', { distanceToRouteM }) })
      engine.on('backOnRoute', () => { if (!cancelled) logEvent('on_route_again') })
      engine.on('gpsLost', () => { if (!cancelled) logEvent('gps_lost') })
      engine.on('gpsRecovered', () => { if (!cancelled) logEvent('gps_recovered') })

      engine.start()
    })()

    const onlineListener = () => { setIsOnline(navigator.onLine); if (navigator.onLine) flushToServer() }
    window.addEventListener('online', onlineListener)
    window.addEventListener('offline', onlineListener)
    setIsOnline(navigator.onLine)

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

  const handleEnd = async () => {
    if (remoteSessionId.current) {
      fetch('/api/navigation/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, status: 'completed' }),
      }).catch(() => {})
    }
    engineRef.current?.stop()
    router.push(`/programma/${hike.id}`)
  }

  const distanceRemainingM = progress ? Math.max(0, progress.totalRouteM - progress.distanceAlongRouteM) : 0
  const avgSpeedMs = movingTimeMs > 0 ? traveledDistanceM / (movingTimeMs / 1000) : null

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900">
      {mapMode === 'offline' ? (
        <NavigationMap routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state} />
      ) : (
        <NavigationMapLibre routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state} styleId={mapMode} is3D={is3D} />
      )}

      <MapModeSwitcher mode={mapMode} onModeChange={setMapMode} is3D={is3D} onToggle3D={() => setIs3D((v) => !v)} isOnline={isOnline} />

      <InstructionBanner
        current={instruction?.current ?? null}
        next={instruction?.next ?? null}
        distanceToNextM={instruction?.distanceToNextM ?? null}
        speechEnabled={speechEnabled}
        onToggleSpeech={handleToggleSpeech}
        onClose={handleEnd}
        isOnline={isOnline}
        compassSupported={isOrientationSupported()}
        compassEnabled={compassEnabled}
        onEnableCompass={handleEnableCompass}
      />

      {state === 'off_route' && (
        <div className="absolute bottom-[280px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold shadow-lg flex items-center gap-2 z-10">
          <AlertTriangle size={16} /> Sei fuori dal percorso pianificato
        </div>
      )}
      {state === 'gps_lost' && (
        <div className="absolute bottom-[280px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold shadow-lg flex items-center gap-2 z-10">
          <AlertTriangle size={16} /> Segnale GPS assente
        </div>
      )}

      <NavStatsPanel
        distanceCoveredM={traveledDistanceM}
        distanceRemainingM={distanceRemainingM}
        currentSpeedMs={currentSpeedMs}
        avgSpeedMs={avgSpeedMs}
        movingTimeMs={movingTimeMs}
        timerRunning={timerRunning}
        onTogglePlayPause={handleTogglePlayPause}
        onStop={handleEnd}
        expanded={statsExpanded}
        onToggleExpanded={() => setStatsExpanded((v) => !v)}
      />

      {callout && (
        <PoiCalloutSheet title={callout.title} extract={callout.extract} imageUrl={callout.imageUrl} onClose={() => setCallout(null)} />
      )}
    </div>
  )
}
