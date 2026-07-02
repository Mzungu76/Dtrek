import { haversineM } from '@/lib/geoUtils'
import { AdaptiveGpsTracker } from './gpsTracker'
import { GpsSmoother } from './gpsSmoothing'
import { RouteTracker, offRouteThresholdM } from './routeDeviation'
import { PoiSpatialIndex } from './poiProximity'
import { watchDeviceCompass, bearingDeg, circularMeanBearings } from './orientation'
import { NavStateMachine } from './stateMachine'
import { buildRouteInstructions } from './routeInstructions'
import type { GeoFix, NavEventMap, NavEventName, NavInstruction, NavPoi, RouteMoment } from './types'

const GPS_LOST_MS = 15000
const OFF_ROUTE_HYSTERESIS_FIXES = 3
const COMPASS_STALE_MS = 3000 // fall back to GPS-derived bearing if no sensor event this recently
const MOMENT_TRIGGER_RADIUS_M = 60
const MAX_PLAUSIBLE_HIKING_SPEED_MS = 8 // ~29 km/h — generous even for trail running; beyond this a fix jump is treated as GPS noise, not real movement

type Listener<K extends NavEventName> = (payload: NavEventMap[K]) => void

export interface NavigationEngineOptions {
  routePolyline: [number, number][]
  pois: NavPoi[]
  moments?: RouteMoment[]
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
  private readonly instructions: NavInstruction[]
  private lastInstructionIndex = -1
  private readonly smoother = new GpsSmoother()
  private readonly stateMachine = new NavStateMachine()
  private readonly gps: AdaptiveGpsTracker
  private readonly listeners = new Map<NavEventName, Set<Listener<any>>>()
  private readonly activePoiIds = new Set<string | number>()
  private readonly reachedMomentIds = new Set<string>()

  private stopCompass: (() => void) | null = null
  private lastCompassAt = 0
  private lastFixAt = 0
  private gpsLostTimer: ReturnType<typeof setTimeout> | null = null
  private offRouteStreak = 0
  private onRouteStreak = 0
  private recentBearings: number[] = []
  private traveledDistanceM = 0
  private lastAcceptedFix: GeoFix | null = null

  constructor(opts: NavigationEngineOptions) {
    this.tracker = new RouteTracker(opts.routePolyline)
    this.poiIndex = new PoiSpatialIndex(opts.pois)
    this.moments = opts.moments ?? []
    this.instructions = buildRouteInstructions(opts.routePolyline)
    this.gps = new AdaptiveGpsTracker(
      (fix) => this.handleFix(fix),
      (err) => this.handleGpsError(err),
    )
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
    this.gps.start()
    this.stopCompass = watchDeviceCompass((deg) => {
      this.lastCompassAt = Date.now()
      this.emit('bearingUpdated', { bearingDeg: deg, source: 'sensor' })
    })
    this.armGpsLostWatchdog()
  }

  stop(): void {
    this.gps.stop()
    this.stopCompass?.()
    if (this.gpsLostTimer) clearTimeout(this.gpsLostTimer)
    this.setState('finished')
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

  /** err.code === 1 (PERMISSION_DENIED) means the browser/OS location permission was denied — unrecoverable until the user changes it in settings, unlike a plain signal loss (code 2/3), so the UI needs to tell the two apart. */
  private handleGpsError(err?: GeolocationPositionError): void {
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

    const smoothed = this.smoother.push(raw)
    const progress = this.tracker.update(smoothed.lat, smoothed.lon)
    const instantSpeedMs = this.updateTraveledDistance(smoothed)
    this.emit('positionUpdated', { raw, smoothed, progress, traveledDistanceM: this.traveledDistanceM, instantSpeedMs })

    this.updateBearingFallback(smoothed)
    this.updateRouteDeviation(smoothed, progress, raw.accuracyM)
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

  /** GPS-derived bearing, used only when no fresh compass sensor reading has arrived. */
  private updateBearingFallback(fix: GeoFix): void {
    if (Date.now() - this.lastCompassAt < COMPASS_STALE_MS) return
    const prev = this.smoother.previous()
    if (!prev) return
    const raw = bearingDeg(prev.lat, prev.lon, fix.lat, fix.lon)
    this.recentBearings.push(raw)
    if (this.recentBearings.length > 8) this.recentBearings.shift()
    const smoothed = circularMeanBearings(this.recentBearings, 3)
    this.emit('bearingUpdated', { bearingDeg: smoothed[smoothed.length - 1], source: 'gps' })
  }

  private updateRouteDeviation(fix: GeoFix, progress: import('./types').RouteProgress, accuracyM: number | null | undefined): void {
    const distanceToRouteM = progress.distanceToRouteM
    // A very poor fix (weak/multipath signal) can't be trusted to judge deviation — skip this check for it.
    if (accuracyM != null && accuracyM > 100) return

    const threshold = offRouteThresholdM(accuracyM)
    if (distanceToRouteM > threshold) {
      this.offRouteStreak++
      this.onRouteStreak = 0
      if (this.offRouteStreak >= OFF_ROUTE_HYSTERESIS_FIXES && this.stateMachine.state !== 'off_route') {
        this.setState('off_route')
        const bearingToRouteDeg = bearingDeg(fix.lat, fix.lon, progress.nearestPointLat, progress.nearestPointLon)
        this.emit('offRoute', { distanceToRouteM, bearingToRouteDeg })
      }
    } else {
      this.onRouteStreak++
      this.offRouteStreak = 0
      if (this.onRouteStreak >= OFF_ROUTE_HYSTERESIS_FIXES && this.stateMachine.state === 'off_route') {
        this.setState('navigating')
        this.emit('backOnRoute', {})
      }
    }
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
