'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle, WifiOff, Navigation as NavigationIcon } from 'lucide-react'
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
import type { NavPoi, NavState, RouteMoment } from '@/lib/navigation/types'
import NavigationMap from './NavigationMap'
import PoiCalloutSheet from './PoiCalloutSheet'
import { speak } from '@/lib/navigation/speech'

interface Props {
  hike: PlannedHike
}

const STATE_LABEL: Record<NavState, string> = {
  idle: '',
  navigating: 'In cammino',
  poi_near: 'Punto di interesse vicino',
  off_route: 'Fuori percorso',
  gps_lost: 'Segnale GPS assente',
  finished: 'Escursione conclusa',
}

export default function ActiveNavigationView({ hike }: Props) {
  const router = useRouter()
  const engineRef = useRef<NavigationEngine | null>(null)
  const sessionRef = useRef<NavigationSessionSnapshot | null>(null)
  const remoteSessionId = useRef<string | null>(null)
  const pendingEvents = useRef<{ type: string; payload?: Record<string, unknown>; createdAt: string }[]>([])

  const [state, setState] = useState<NavState>('idle')
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ distanceAlongRouteM: number; totalRouteM: number } | null>(null)
  const [callout, setCallout] = useState<{ title: string; extract?: string; imageUrl?: string } | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

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
      engine.on('positionUpdated', ({ raw, smoothed, progress }) => {
        if (cancelled) return
        setPosition({ lat: smoothed.lat, lon: smoothed.lon })
        setProgress({ distanceAlongRouteM: progress.distanceAlongRouteM, totalRouteM: progress.totalRouteM })
        queueTrackFix(snapshot.sessionId, { ts: raw.ts, lat: raw.lat, lon: raw.lon, altitudeM: raw.altitudeM, speedMs: raw.speedMs, accuracyM: raw.accuracyM })
      })
      engine.on('bearingUpdated', ({ bearingDeg }) => { if (!cancelled) setBearing(bearingDeg) })
      engine.on('enteredPoi', ({ poi }) => {
        if (cancelled) return
        logEvent('poi_reached', { poiId: poi.id })
        const wiki = poiWikiById.get(poi.id)
        setCallout({ title: poi.name ?? 'Punto di interesse', extract: wiki?.extract, imageUrl: wiki?.thumbnail })
        speak(`${poi.name ?? 'Sei vicino a un punto di interesse'}. ${wiki?.extract ?? ''}`.trim())
      })
      engine.on('momentReached', ({ moment }) => {
        if (cancelled) return
        logEvent('moment_reached', { momentId: moment.id, kind: moment.kind })
        setCallout({ title: 'Giulia', extract: moment.text })
        speak(moment.text)
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

    return () => {
      cancelled = true
      engineRef.current?.stop()
      window.removeEventListener('online', onlineListener)
      window.removeEventListener('offline', onlineListener)
      clearInterval(flushInterval)
      if (sessionRef.current) saveNavigationSession({ ...sessionRef.current, state, lastFix: null, lastBearingDeg: bearing }).catch(() => {})
      flushToServer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  const handleEnableCompass = async () => {
    const granted = await requestOrientationPermission()
    setCompassEnabled(granted)
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

  const remainingM = progress ? Math.max(0, progress.totalRouteM - progress.distanceAlongRouteM) : null

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900">
      <NavigationMap routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state} />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 p-3 flex items-center justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={handleEnd} className="p-2 rounded-full bg-white/90 text-slate-800" aria-label="Termina navigazione">
          <X size={20} />
        </button>
        <div className="flex-1 text-center text-white text-sm font-medium drop-shadow">
          {STATE_LABEL[state]}
        </div>
        {!isOnline && (
          <span className="p-2 rounded-full bg-amber-500/90 text-white" title="Offline"><WifiOff size={16} /></span>
        )}
        {isOrientationSupported() && !compassEnabled && (
          <button onClick={handleEnableCompass} className="p-2 rounded-full bg-white/90 text-slate-800" aria-label="Attiva bussola">
            <NavigationIcon size={18} />
          </button>
        )}
      </div>

      {/* HUD: remaining distance */}
      {remainingM != null && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/95 shadow-lg text-sm font-semibold text-slate-800">
          {(remainingM / 1000).toFixed(1)} km rimanenti
        </div>
      )}

      {state === 'off_route' && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold shadow-lg flex items-center gap-2">
          <AlertTriangle size={16} /> Sei fuori dal percorso pianificato
        </div>
      )}
      {state === 'gps_lost' && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold shadow-lg flex items-center gap-2">
          <AlertTriangle size={16} /> Segnale GPS assente
        </div>
      )}

      {callout && (
        <PoiCalloutSheet title={callout.title} extract={callout.extract} imageUrl={callout.imageUrl} onClose={() => setCallout(null)} />
      )}
    </div>
  )
}
