import { haversineM } from '@/lib/geoUtils'
import { LocationSource, type LocationMode, type LocationSourceError, type LocationProvider, type LocationProviderFactory } from '@/lib/native/locationSource'
import { PositionEngine } from './positionEngine'
import { RouteTracker } from './routeDeviation'
import { OffRouteEngine } from './offRouteEngine'
import { PoiSpatialIndex } from './poiProximity'
import { watchDeviceCompass, bearingDeg } from './orientation'
import { NavStateMachine } from './stateMachine'
import { buildRouteInstructions } from './routeInstructions'
import { PaceAssistant, type WeatherConditions } from './paceAssistant'
import type { ElevationProfilePoint } from './elevationProfile'
import type { GeoFix, NavEventMap, NavEventName, NavInstruction, NavPoi, RouteMoment } from './types'

const GPS_LOST_MS = 15000
const COMPASS_STALE_MS = 3000 // fall back to GPS-derived bearing if no sensor event this recently
const MOMENT_TRIGGER_RADIUS_M = 60
const RENDER_TICK_MS = 100 // ~10Hz render-only interpolation cadence — see renderTick in types.ts
const MAX_PLAUSIBLE_HIKING_SPEED_MS = 8 // ~29 km/h — generous even for trail running; beyond this a fix jump is treated as GPS noise, not real movement
// How long after the WebView regains visibility (watchVisibilityForCatchUp) to force RouteTracker's
// full-track rescan, not just its usual windowed search — a wall-clock window, not a one-shot flag,
// so a fix that happens to arrive between the resume and the actual delivery of catchUp()'s
// buffered fixes doesn't consume the protection meant for the real (possibly jumped) one. Generous
// relative to how quickly buffered fixes are typically replayed in a burst, small relative to the
// 15s gps_lost watchdog above.
const CATCH_UP_FULL_SCAN_GRACE_MS = 2000

type Listener<K extends NavEventName> = (payload: NavEventMap[K]) => void

export interface NavigationEngineOptions {
  routePolyline: [number, number][]
  pois: NavPoi[]
  moments?: RouteMoment[]
  /** Cumulative distance/altitude profile (lib/navigation/elevationProfile.ts), for the live pace assistant's remaining/return-trip elevation lookups. Omit to disable elevation-aware pace estimation (falls back to a flat-terrain Naismith estimate). */
  elevationProfile?: ElevationProfilePoint[]
  /** Precomputed altitude/terrain multiplier (lib/trailScore.ts's altitudeTerrainMultiplier), applied to the live Naismith estimate. Defaults to 1 (no correction). */
  terrainMultiplier?: number
  /** Simplified Tranter-style fitness scalar — see paceAssistant.ts. Defaults to 1 (neutral). */
  fitnessMult?: number
  /** Initial battery-aware tracking profile (spec §12) passed to the native Location Engine; ignored on web. Defaults to 'trekking'. */
  locationMode?: LocationMode
  /**
   * Constructs the GPS source this engine drives itself with — defaults to
   * the real native/web LocationSource. Tests/dev tooling pass a factory
   * that builds a SimulationLocationProvider instead (GPX replay or a
   * scripted scenario, lib/navigation/simulation/), so the whole engine —
   * Position Engine, Off-Route Engine, Escape Engine, pace, POIs — can be
   * exercised without a real GPS fix ever happening. NavigationEngine
   * itself never imports anything Android/browser-geolocation-specific;
   * this factory indirection is what keeps that true.
   */
  locationProviderFactory?: LocationProviderFactory
}

/**
 * Pure TypeScript navigation engine — no React, no DOM assumptions beyond
 * the browser geolocation/orientation APIs. Consumes raw GPS fixes, runs
 * them through smoothing/deviation/proximity/compass, drives a state
 * machine, and emits typed events. UI layers only subscribe; they hold no
 * navigation decision logic themselves. This separation is what makes the
 * engine mockable (synthetic fixes for demos/tests) and replayable
 * (feeding it a recorded hike_navigation_track instead of live GPS).
 */
export class NavigationEngine {
  private readonly tracker: RouteTracker
  private readonly poiIndex: PoiSpatialIndex
  private readonly moments: RouteMoment[]
  private readonly pace: PaceAssistant
  private readonly instructions: NavInstruction[]
  private lastInstructionIndex = -1
  private readonly position = new PositionEngine()
  private readonly offRoute = new OffRouteEngine()
  private readonly stateMachine = new NavStateMachine()
  private readonly gps: LocationProvider
  private readonly locationMode: LocationMode
  private readonly listeners = new Map<NavEventName, Set<Listener<any>>>()
  private readonly activePoiIds = new Set<string | number>()
  private readonly reachedMomentIds = new Set<string>()

  private stopCompass: (() => void) | null = null
  private stopVisibilityWatch: (() => void) | null = null
  private lastCompassAt = 0
  private lastFixAt = 0
  private gpsLostTimer: ReturnType<typeof setTimeout> | null = null
  private traveledDistanceM = 0
  private forceFullScanUntilMs = 0
  private lastAcceptedFix: GeoFix | null = null
  private renderLoopHandle: number | null = null
  private lastRenderTickAt = 0

  constructor(opts: NavigationEngineOptions) {
    this.tracker = new RouteTracker(opts.routePolyline)
    this.poiIndex = new PoiSpatialIndex(opts.pois)
    this.moments = opts.moments ?? []
    this.instructions = buildRouteInstructions(opts.routePolyline)
    this.pace = new PaceAssistant({
      totalRouteM: this.tracker.totalRouteM,
      elevationProfile: opts.elevationProfile ?? [],
      terrainMultiplier: opts.terrainMultiplier,
      fitnessMult: opts.fitnessMult,
    })
    this.locationMode = opts.locationMode ?? 'trekking'
    const buildProvider = opts.locationProviderFactory ?? ((onFix, onError) => new LocationSource(onFix, onError))
    this.gps = buildProvider(
      (fix) => this.handleFix(fix),
      (err) => this.handleGpsError(err),
    )
  }

  /** Battery-aware mode switch (spec §12) — a no-op on web, forwarded to the native foreground service otherwise. */
  setLocationMode(mode: LocationMode): void {
    void this.gps.setMode(mode)
  }

  /** Pushed in by the caller (e.g. from an Open-Meteo fetch), not fetched by the engine itself — keeps this class free of network calls, same "pure, mockable, replayable" property the rest of it already has. */
  setWeatherConditions(w: WeatherConditions): void {
    this.pace.setWeather(w)
  }

  on<K extends NavEventName>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return () => this.listeners.get(event)?.delete(listener)
  }

  private emit<K extends NavEventName>(event: K, payload: NavEventMap[K]): void {
    this.listeners.get(event)?.forEach((l) => l(payload))
  }

  start(): void {
    this.setState('navigating')
    void this.gps.start(this.locationMode)
    this.stopCompass = watchDeviceCompass((deg) => {
      this.lastCompassAt = Date.now()
      this.emit('bearingUpdated', { bearingDeg: deg, source: 'sensor' })
    })
    this.armGpsLostWatchdog()
    this.stopVisibilityWatch = this.watchVisibilityForCatchUp()
    this.armRenderLoop()
  }

  stop(): void {
    this.gps.stop()
    this.stopCompass?.()
    this.stopVisibilityWatch?.()
    this.stopVisibilityWatch = null
    if (this.gpsLostTimer) clearTimeout(this.gpsLostTimer)
    if (this.renderLoopHandle != null) cancelAnimationFrame(this.renderLoopHandle)
    this.renderLoopHandle = null
    this.setState('finished')
  }

  /**
   * Drives PositionEngine.sample() on every animation frame (throttled to RENDER_TICK_MS) so the
   * map marker glides smoothly between real GPS fixes instead of jumping once per fix — the "60 FPS
   * interpolation/rendering" stage positionEngine.ts's own doc comment describes, which nothing
   * previously actually called on a timer. Deliberately separate from handleFix()'s pipeline: this
   * only reads the filter's current extrapolated estimate, it never re-runs route deviation/
   * instructions/POI logic, so a stationary hiker (no real fixes) can't accidentally flicker those
   * off synthetic data. requestAnimationFrame also means this auto-pauses when the screen/app is
   * backgrounded, at no extra battery cost.
   */
  private armRenderLoop(): void {
    if (typeof window === 'undefined') return
    const tick = () => {
      this.renderLoopHandle = requestAnimationFrame(tick)
      const now = Date.now()
      if (now - this.lastRenderTickAt < RENDER_TICK_MS) return
      this.lastRenderTickAt = now
      const estimate = this.position.sample(now)
      if (!estimate) return
      this.emit('renderTick', { lat: estimate.lat, lon: estimate.lon, accuracyM: estimate.accuracyM, interpolated: estimate.interpolated })
    }
    this.renderLoopHandle = requestAnimationFrame(tick)
  }

  /**
   * When the WebView regains visibility after being backgrounded/suspended
   * (screen back on, app switched back to), replays whatever fixes the
   * native foreground service buffered in the meantime — otherwise a hiker
   * who locked their phone for twenty minutes would come back to a
   * position/track that silently jumped straight to "now" (spec §13).
   * No-op on web, where `document` visibility already tracks the tab that's
   * running the engine itself.
   */
  private watchVisibilityForCatchUp(): (() => void) | null {
    if (typeof document === 'undefined') return null
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Whatever fixes catchUp() delivers next may not be in spatial continuity with the last
        // one seen before backgrounding — same reasoning as the gps_lost→navigating transition in
        // handleFix(), just not gated on that specific state (the native foreground service may
        // have kept updating lastFixAt without the gps_lost watchdog ever firing).
        this.forceFullScanUntilMs = Date.now() + CATCH_UP_FULL_SCAN_GRACE_MS
        void this.gps.catchUp()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }

  private setState(to: import('./types').NavState): void {
    const from = this.stateMachine.state
    const applied = this.stateMachine.transition(to)
    if (applied) this.emit('stateChanged', { from, to: applied })
  }

  private armGpsLostWatchdog(): void {
    if (this.gpsLostTimer) clearTimeout(this.gpsLostTimer)
    this.gpsLostTimer = setTimeout(() => {
      if (Date.now() - this.lastFixAt >= GPS_LOST_MS) {
        this.setState('gps_lost')
        this.emit('gpsLost', { permissionDenied: false })
      }
    }, GPS_LOST_MS)
  }

  /** err.code === 1 (PERMISSION_DENIED) means the browser/OS location permission was denied — unrecoverable until the user changes it in settings, unlike a plain signal loss (code 2/3), so the UI needs to tell the two apart. Same shape whether the fix source was native or web (see LocationSourceError). */
  private handleGpsError(err?: LocationSourceError): void {
    this.setState('gps_lost')
    this.emit('gpsLost', { permissionDenied: err?.code === 1 })
  }

  private handleFix(raw: GeoFix): void {
    const wasLost = this.stateMachine.state === 'gps_lost'
    this.lastFixAt = Date.now()
    this.armGpsLostWatchdog()
    if (wasLost) {
      this.emit('gpsRecovered', {})
      this.setState('navigating')
    }

    // ingest() runs the fix through the quality gate/spike rejection/Kalman filter but can reject
    // it outright (returns null); sample() always returns the engine's current best estimate
    // regardless — extrapolated from the last accepted fix if this one was rejected — so a single
    // noisy fix degrades to "position hasn't moved much" instead of freezing the UI or, worse,
    // briefly showing the spike itself. Guard only covers the very first fix ever, before the
    // filter has anything to extrapolate from.
    this.position.ingest(raw)
    const estimate = this.position.sample(raw.ts)
    if (!estimate) return

    const smoothed: GeoFix = {
      lat: estimate.lat,
      lon: estimate.lon,
      altitudeM: estimate.altitudeM,
      accuracyM: estimate.accuracyM,
      speedMs: estimate.speedMs,
      bearingDeg: estimate.bearingDeg,
      ts: estimate.ts,
      source: raw.source,
    }

    // forceFullScan: either we just came back from gps_lost (wasLost, computed above), or we're
    // still inside the post-visibility-resume grace window — both are evidence this fix might not
    // be in continuity with the last one RouteTracker saw. See routeDeviation.ts's own doc
    // comments for why a windowed search alone can't safely recover from that on its own.
    const progress = this.tracker.update(smoothed.lat, smoothed.lon, {
      forceFullScan: wasLost || Date.now() < this.forceFullScanUntilMs,
    })
    const instantSpeedMs = this.updateTraveledDistance(smoothed)
    this.emit('positionUpdated', { raw, smoothed, progress, traveledDistanceM: this.traveledDistanceM, instantSpeedMs })
    this.emit('paceUpdated', this.pace.update(progress.distanceAlongRouteM, this.traveledDistanceM, instantSpeedMs, raw.ts))

    this.updateBearingFallback(smoothed)
    this.updateRouteDeviation(smoothed, progress)
    this.updatePois(smoothed)
    this.updateMoments(progress.distanceAlongRouteM, smoothed)
    this.updateInstructions(progress.distanceAlongRouteM)
  }

  /** Finds the instruction the hiker is currently past, and how far to the next one — emitted every fix so the UI can show a live "in 150m: turn right" countdown, Komoot-style. */
  private updateInstructions(distanceAlongRouteM: number): void {
    if (this.instructions.length === 0) return
    let idx = this.lastInstructionIndex < 0 ? 0 : this.lastInstructionIndex
    while (idx + 1 < this.instructions.length && this.instructions[idx + 1].distanceAlongRouteM <= distanceAlongRouteM) idx++
    this.lastInstructionIndex = idx

    const current = this.instructions[idx]
    const next = this.instructions[idx + 1] ?? null
    const distanceToNextM = next ? Math.max(0, next.distanceAlongRouteM - distanceAlongRouteM) : null
    this.emit('instructionUpdated', { current, next, distanceToNextM })
  }

  /**
   * Adds to the cumulative traveled-distance total, rejecting the distance
   * contribution of any single fix-to-fix jump that implies an implausible
   * hiking speed (a well-known GPS artifact: the first fix(es) after
   * acquiring/reacquiring a signal can land far from the real position).
   * The baseline still advances to the new fix either way, so a genuine
   * relocation (e.g. actually starting the hike somewhere else) doesn't
   * leave traveled distance permanently stuck rejecting every update.
   */
  private updateTraveledDistance(fix: GeoFix): number | null {
    if (!this.lastAcceptedFix) {
      this.lastAcceptedFix = fix
      return this.sanitizeSpeed(fix.speedMs)
    }
    const dtSeconds = (fix.ts - this.lastAcceptedFix.ts) / 1000
    const distanceM = haversineM(this.lastAcceptedFix.lat, this.lastAcceptedFix.lon, fix.lat, fix.lon)
    const impliedSpeedMs = dtSeconds > 0 ? distanceM / dtSeconds : 0
    this.lastAcceptedFix = fix

    if (impliedSpeedMs > MAX_PLAUSIBLE_HIKING_SPEED_MS) return this.sanitizeSpeed(fix.speedMs)

    this.traveledDistanceM += distanceM
    return this.sanitizeSpeed(fix.speedMs) ?? impliedSpeedMs
  }

  private sanitizeSpeed(speedMs: number | null | undefined): number | null {
    if (speedMs == null || !Number.isFinite(speedMs) || speedMs < 0 || speedMs > MAX_PLAUSIBLE_HIKING_SPEED_MS) return null
    return speedMs
  }

  /**
   * GPS-derived bearing, used only when no fresh compass sensor reading has
   * arrived. The Position Engine already derives and smooths this itself —
   * its Kalman filter's own velocity vector (vx, vy) is a heading-of-travel
   * estimate that only updates once the fix is above its noise-floor speed
   * threshold (see positionEngine.ts) — so there's no separate bearing
   * history/circular-mean to maintain here anymore.
   */
  private updateBearingFallback(fix: GeoFix): void {
    if (Date.now() - this.lastCompassAt < COMPASS_STALE_MS) return
    if (fix.bearingDeg == null) return
    this.emit('bearingUpdated', { bearingDeg: fix.bearingDeg, source: 'gps' })
  }

  /**
   * Multi-factor Off-Route Engine (spec §5) instead of a single distance
   * threshold: lib/navigation/offRouteEngine.ts weighs GPS-accuracy-adjusted
   * distance, its trend, wall-clock dwell time (not a fix count — fix rate
   * varies with battery mode), and direction-vs-route-tangent, and reports
   * a stable on_route/uncertain/off_route verdict plus an independent
   * wrong_direction flag. This method only translates that verdict into
   * NavState transitions + events; all the actual judgment lives there.
   */
  private updateRouteDeviation(fix: GeoFix, progress: import('./types').RouteProgress): void {
    const result = this.offRoute.update({
      ts: fix.ts,
      distanceToRouteM: progress.distanceToRouteM,
      accuracyM: fix.accuracyM ?? null,
      headingDeg: fix.bearingDeg ?? null,
      expectedHeadingDeg: progress.expectedBearingDeg,
      speedMs: fix.speedMs ?? null,
    })
    if (!result.changed) return

    const current = this.stateMachine.state

    if (result.adherence === 'off_route') {
      if (current === 'off_route') return
      this.setState('off_route')
      this.emit('offRoute', { distanceToRouteM: progress.distanceToRouteM, bearingToRouteDeg: this.bearingToRoute(fix, progress) })
    } else if (result.adherence === 'uncertain') {
      if (current === 'uncertain' || current === 'off_route' || current === 'wrong_direction') return
      this.setState('uncertain')
      this.emit('uncertain', { distanceToRouteM: progress.distanceToRouteM, accuracyM: fix.accuracyM ?? null })
    } else if (result.wrongDirection) {
      if (current === 'wrong_direction') return
      this.setState('wrong_direction')
      this.emit('wrongDirection', { headingDeg: fix.bearingDeg ?? null, expectedHeadingDeg: progress.expectedBearingDeg })
    } else if (current === 'off_route' || current === 'wrong_direction') {
      this.setState('navigating')
      this.emit('backOnRoute', {})
    } else if (current === 'uncertain') {
      this.setState('navigating')
      this.emit('certain', {})
    }
  }

  private bearingToRoute(fix: GeoFix, progress: import('./types').RouteProgress): number {
    return bearingDeg(fix.lat, fix.lon, progress.nearestPointLat, progress.nearestPointLon)
  }

  private updatePois(fix: GeoFix): void {
    const nearby = this.poiIndex.nearby(fix.lat, fix.lon)
    const nearbyIds = new Set(nearby.map((n) => n.poi.id))

    for (const { poi } of nearby) {
      if (!this.activePoiIds.has(poi.id)) {
        this.activePoiIds.add(poi.id)
        if (this.stateMachine.state === 'navigating') this.setState('poi_near')
        this.emit('enteredPoi', { poi })
      }
    }
    for (const id of Array.from(this.activePoiIds)) {
      if (!nearbyIds.has(id)) {
        this.activePoiIds.delete(id)
        this.emit('leftPoi', { poi: nearby.find((n) => n.poi.id === id)?.poi ?? ({ id, lat: fix.lat, lon: fix.lon } as NavPoi) })
      }
    }
    if (this.activePoiIds.size === 0 && this.stateMachine.state === 'poi_near') {
      this.setState('navigating')
    }
  }

  private updateMoments(distanceAlongRouteM: number, fix: GeoFix): void {
    for (const moment of this.moments) {
      if (this.reachedMomentIds.has(moment.id)) continue
      const closeAlongRoute = Math.abs(distanceAlongRouteM - moment.distanceAlongRouteM) < MOMENT_TRIGGER_RADIUS_M
      const closeInSpace = haversineM(fix.lat, fix.lon, moment.lat, moment.lon) < MOMENT_TRIGGER_RADIUS_M
      if (closeAlongRoute && closeInSpace) {
        this.reachedMomentIds.add(moment.id)
        this.emit('momentReached', { moment })
      }
    }
  }
}
