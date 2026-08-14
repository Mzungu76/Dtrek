import { haversineM } from '@/lib/geoUtils'
import { LocationSource, type LocationMode, type LocationSourceError } from '@/lib/native/locationSource'
import { PositionEngine, type PositionEstimate } from './positionEngine'
import { watchDeviceCompass } from './orientation'
import type { GeoFix } from './types'
import type { TrackPoint } from '@/lib/tcxParser'

const COMPASS_STALE_MS = 3000 // fall back to GPS-derived bearing if no sensor event this recently — mirrors navigationEngine.ts
const RENDER_TICK_MS = 100 // ~10Hz render-only interpolation cadence, same reasoning as navigationEngine.ts's renderTick

export interface FreeTrackStats {
  distanceMeters: number
  /** Recording time only — excludes time spent paused, same convention as ActiveNavigationView's timer. */
  durationSeconds: number
  elevationGain: number
  currentSpeedMs: number | null
  pointCount: number
}

type Listener<T> = (payload: T) => void

/**
 * Records a GPS track with no planned route behind it — the "just track my
 * position" path for the standalone Navigator app (spec follow-up: a user
 * who installs Navigator before ever planning a hike in the main DTrek app
 * shouldn't be stuck with an app that does nothing). Deliberately much
 * simpler than NavigationEngine: no route, so no off-route/instructions/
 * moments/POI logic applies — this only answers "where has the user
 * actually walked", which is exactly the Position Engine's job (quality
 * gate, spike rejection, smoothing) with nothing layered on top.
 *
 * The resulting points feed lib/navigation/trackToActivity.ts's
 * buildActivityFromTrack() the same way a completed planned hike's recorded
 * track does, so a freeform recording becomes a normal Diario entry once
 * saved — no separate data model needed.
 */
export class FreeTrackSession {
  private readonly gps: LocationSource
  private readonly position = new PositionEngine()
  private readonly listeners = new Map<string, Set<Listener<any>>>()

  private points: TrackPoint[] = []
  private recording = false
  private lastRecordedPoint: { lat: number; lon: number; altitudeM: number | null } | null = null
  private distanceMeters = 0
  private elevationGain = 0
  private recordedMs = 0
  private lastResumeAt = 0
  private lastSpeedMs: number | null = null
  private stopCompass: (() => void) | null = null
  private lastCompassAt = 0
  private renderLoopHandle: number | null = null
  private lastRenderTickAt = 0

  constructor() {
    this.gps = new LocationSource(
      (fix) => this.handleFix(fix),
      (err) => this.handleError(err),
    )
  }

  on<T>(event: 'point', cb: Listener<TrackPoint>): () => void
  on<T>(event: 'stats', cb: Listener<FreeTrackStats>): () => void
  on<T>(event: 'position', cb: Listener<PositionEstimate>): () => void
  on<T>(event: 'bearing', cb: Listener<{ bearingDeg: number; source: 'sensor' | 'gps' }>): () => void
  on<T>(event: 'gpsLost', cb: Listener<{ permissionDenied: boolean }>): () => void
  on<T>(event: 'gpsRecovered', cb: Listener<Record<string, never>>): () => void
  on(event: string, cb: Listener<any>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
    return () => this.listeners.get(event)?.delete(cb)
  }

  private emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload))
  }

  /**
   * Live device compass, same wiring as NavigationEngine.start() — this session used to derive
   * bearing purely from consecutive GPS fixes (PositionEngine's own velocity-based estimate), which
   * only updates while actually walking above the noise floor and never reacts to just turning the
   * phone in your hand while standing still. Real fixes still win as a fallback (updateBearingFallback
   * below) whenever the sensor hasn't reported anything recently.
   */
  async start(mode: LocationMode = 'trekking'): Promise<void> {
    this.recording = true
    this.lastResumeAt = Date.now()
    this.stopCompass = watchDeviceCompass((deg) => {
      this.lastCompassAt = Date.now()
      this.emit('bearing', { bearingDeg: deg, source: 'sensor' })
    })
    this.armRenderLoop()
    await this.gps.start(mode)
  }

  /** Position keeps updating while paused (live marker), but distance/duration/elevation stop accumulating — mirrors ActiveNavigationView's pause behavior. */
  pause(): void {
    if (!this.recording) return
    this.recordedMs += Date.now() - this.lastResumeAt
    this.recording = false
  }

  resume(): void {
    if (this.recording) return
    this.lastResumeAt = Date.now()
    this.recording = true
  }

  /** Stops GPS acquisition and returns the recorded points so far. */
  stop(): TrackPoint[] {
    if (this.recording) this.recordedMs += Date.now() - this.lastResumeAt
    this.recording = false
    this.gps.stop()
    this.stopCompass?.()
    this.stopCompass = null
    if (this.renderLoopHandle != null) cancelAnimationFrame(this.renderLoopHandle)
    this.renderLoopHandle = null
    return this.points
  }

  getPoints(): TrackPoint[] {
    return this.points
  }

  /**
   * Drives PositionEngine.sample() on every animation frame (throttled), same purpose and
   * reasoning as NavigationEngine's armRenderLoop() — the live marker glides between real fixes
   * instead of jumping once per fix. Distance/elevation/point-recording logic in handleFix() below
   * is untouched: this only re-emits 'position' with the filter's current extrapolated estimate.
   */
  private armRenderLoop(): void {
    if (typeof window === 'undefined') return
    const tick = () => {
      this.renderLoopHandle = requestAnimationFrame(tick)
      const now = Date.now()
      if (now - this.lastRenderTickAt < RENDER_TICK_MS) return
      this.lastRenderTickAt = now
      const estimate = this.position.sample(now)
      if (estimate) this.emit('position', estimate)
    }
    this.renderLoopHandle = requestAnimationFrame(tick)
  }

  private handleFix(raw: GeoFix): void {
    const wasRecording = this.recording
    this.position.ingest(raw)
    if (raw.speedMs != null) this.lastSpeedMs = raw.speedMs

    // raw.ts, not Date.now(): PositionEngine.sample() marks anything sampled after the fix's own
    // timestamp as `interpolated` (extrapolated forward), and any real-world gap at all between
    // when the fix was taken and when this line runs makes Date.now() > raw.ts — so sampling "now"
    // right after ingesting this very fix would mark every single fix as interpolated and skip
    // recording it below. Sampling at raw.ts instead matches what was just ingested exactly.
    const estimate = this.position.sample(raw.ts)
    if (estimate) this.emit('position', estimate)
    this.updateBearingFallback(estimate)

    if (!wasRecording || !estimate || estimate.interpolated) return

    if (this.lastRecordedPoint) {
      this.distanceMeters += haversineM(this.lastRecordedPoint.lat, this.lastRecordedPoint.lon, estimate.lat, estimate.lon)
      if (estimate.altitudeM != null && this.lastRecordedPoint.altitudeM != null) {
        const d = estimate.altitudeM - this.lastRecordedPoint.altitudeM
        if (d > 0.5) this.elevationGain += d
      }
    }
    this.lastRecordedPoint = { lat: estimate.lat, lon: estimate.lon, altitudeM: estimate.altitudeM }

    const point: TrackPoint = {
      time: new Date(raw.ts).toISOString(),
      lat: estimate.lat,
      lon: estimate.lon,
      altitudeMeters: estimate.altitudeM ?? undefined,
      speedMs: estimate.speedMs,
    }
    this.points.push(point)
    this.emit('point', point)
    this.emit('stats', this.currentStats())
  }

  /** GPS-derived bearing, used only when no fresh compass sensor reading has arrived — mirrors navigationEngine.ts's updateBearingFallback(). */
  private updateBearingFallback(estimate: PositionEstimate | null): void {
    if (Date.now() - this.lastCompassAt < COMPASS_STALE_MS) return
    if (estimate?.bearingDeg == null) return
    this.emit('bearing', { bearingDeg: estimate.bearingDeg, source: 'gps' })
  }

  private handleError(err: LocationSourceError): void {
    if (err.code === 1) {
      this.emit('gpsLost', { permissionDenied: true })
    } else {
      this.emit('gpsLost', { permissionDenied: false })
    }
  }

  private currentStats(): FreeTrackStats {
    const liveMs = this.recording ? this.recordedMs + (Date.now() - this.lastResumeAt) : this.recordedMs
    return {
      distanceMeters: this.distanceMeters,
      durationSeconds: liveMs / 1000,
      elevationGain: this.elevationGain,
      currentSpeedMs: this.lastSpeedMs,
      pointCount: this.points.length,
    }
  }
}
