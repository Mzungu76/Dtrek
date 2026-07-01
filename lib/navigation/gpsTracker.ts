import type { GeoFix } from './types'

const POLL_MS_STOPPED = 6000
const POLL_MS_WALKING = 2000
const POLL_MS_RUNNING = 1000
const WALK_SPEED_MS = 0.3   // ~1 km/h — below this we consider the hiker stopped
const RUN_SPEED_MS = 2.2    // ~8 km/h — above this we consider the hiker running

function pollIntervalFor(speedMs: number | null | undefined): number {
  if (speedMs == null) return POLL_MS_WALKING
  if (speedMs < WALK_SPEED_MS) return POLL_MS_STOPPED
  if (speedMs > RUN_SPEED_MS) return POLL_MS_RUNNING
  return POLL_MS_WALKING
}

/**
 * Wraps navigator.geolocation.watchPosition with an adaptive re-arm cadence:
 * geolocation.watchPosition itself has no polling knob (the browser decides
 * frequency), so to actually save battery we stop/restart the watch on a
 * timer whose interval depends on the hiker's last known speed — stationary
 * users get fixes far less often than someone jogging a descent.
 */
export class AdaptiveGpsTracker {
  private watchId: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastSpeedMs: number | null = null
  private stopped = true

  constructor(
    private readonly onFix: (fix: GeoFix) => void,
    private readonly onError: (err: GeolocationPositionError) => void,
  ) {}

  start(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.onError({ code: 2, message: 'Geolocation not supported', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      return
    }
    this.stopped = false
    this.armWatch()
  }

  stop(): void {
    this.stopped = true
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId)
    if (this.timer) clearTimeout(this.timer)
    this.watchId = null
    this.timer = null
  }

  private armWatch(): void {
    if (this.stopped) return
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GeoFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          altitudeM: pos.coords.altitude,
          accuracyM: pos.coords.accuracy,
          speedMs: pos.coords.speed,
          ts: pos.timestamp,
        }
        this.lastSpeedMs = fix.speedMs ?? this.lastSpeedMs
        this.onFix(fix)
        this.rearm()
      },
      (err) => this.onError(err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    )
  }

  /** Stop-and-restart the watch on an interval driven by the last observed speed, to throttle fix frequency for battery. */
  private rearm(): void {
    if (this.stopped) return
    if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.armWatch(), pollIntervalFor(this.lastSpeedMs))
  }
}
