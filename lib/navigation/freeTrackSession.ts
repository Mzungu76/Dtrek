import { haversineM } from '@/lib/geoUtils'
import { LocationSource, type LocationMode, type LocationSourceError } from '@/lib/native/locationSource'
import { PositionEngine, type PositionEstimate } from './positionEngine'
import type { GeoFix } from './types'
import type { TrackPoint } from '@/lib/tcxParser'

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

  constructor() {
    this.gps = new LocationSource(
      (fix) => this.handleFix(fix),
      (err) => this.handleError(err),
    )
  }

  on<T>(event: 'point', cb: Listener<TrackPoint>): () => void
  on<T>(event: 'stats', cb: Listener<FreeTrackStats>): () => void
  on<T>(event: 'position', cb: Listener<PositionEstimate>): () => void
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

  async start(mode: LocationMode = 'trekking'): Promise<void> {
    this.recording = true
    this.lastResumeAt = Date.now()
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
    return this.points
  }

  getPoints(): TrackPoint[] {
    return this.points
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
