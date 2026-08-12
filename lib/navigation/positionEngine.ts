import { haversineM, bearingDeg } from '@/lib/geoUtils'
import type { GeoFix } from './types'

/**
 * Position Engine (spec §2). Deliberately has zero imports from anything
 * trail-related (routeDeviation.ts, navigationEngine.ts) — it knows nothing
 * about a planned route, and nothing here is allowed to move a position
 * towards one. Its only inputs are raw fixes; its only output is "where is
 * the user, physically, right now (or a moment ago)".
 *
 *   GPS FIX → Quality Check → Outlier Rejection → Filtering →
 *   Position Estimate → 60 FPS interpolation/rendering
 *
 * `ingest()` runs the first four stages on every raw fix. `sample()` is the
 * last stage: it can be called on every animation frame (independent of the
 * ~1 Hz GPS fix rate) to get a position that has moved smoothly, by
 * projecting the filter's own velocity estimate forward from the last fix —
 * not by faking new GPS data, just by not waiting for it to *render*.
 */

export interface PositionEstimate {
  lat: number
  lon: number
  altitudeM: number | null
  /** 1-sigma horizontal accuracy of the *filtered* estimate, in meters — not simply the raw fix's accuracy field, since the filter narrows it over consecutive consistent fixes. */
  accuracyM: number
  speedMs: number
  bearingDeg: number | null
  ts: number
  /** True once this sample is being extrapolated forward from the last real fix rather than reflecting one directly — lets the renderer/UI flag a stale position instead of quietly pretending it's fresh. */
  interpolated: boolean
  /** ms between this sample's timestamp and the last real fix that was accepted. */
  ageMs: number
}

export type FixQuality = 'good' | 'poor' | 'rejected'

export interface QualityCheckResult {
  quality: FixQuality
  reason?: string
}

export interface PositionEngineOptions {
  /** Fixes reporting worse accuracy than this are downweighted heavily but not rejected outright (a canyon/tree-cover fix is still *some* information). Meters. */
  poorAccuracyThresholdM?: number
  /** Fixes reporting worse accuracy than this are rejected outright — too coarse to be worth incorporating at all. Meters. */
  rejectAccuracyThresholdM?: number
  /** Upper bound on plausible ground speed once GPS noise (combined accuracy of both fixes) is accounted for. A jump beyond this is treated as a spike, not real movement. m/s. Default ~14 m/s (~50 km/h) — generous enough for a bike-assisted approach/descent on a hiking trail without accepting car-speed teleports. */
  maxPlausibleSpeedMs?: number
  /** Process noise (acceleration variance, (m/s²)²) for the constant-velocity Kalman filter — how much the filter expects real speed/direction to change between fixes. Higher = trusts new fixes more over its own prediction. */
  processNoise?: number
  /** Fixes older than this relative to Date.now() are rejected as stale/replayed. ms. */
  maxFixAgeMs?: number
  /** sample() stops extrapolating forward past this long without a real fix — the estimate freezes and callers should treat the position as unreliable (feeds into gpsLost / navigation confidence upstream). ms. */
  maxExtrapolationMs?: number
}

const DEFAULTS: Required<PositionEngineOptions> = {
  poorAccuracyThresholdM: 30,
  rejectAccuracyThresholdM: 200,
  maxPlausibleSpeedMs: 14,
  processNoise: 0.6,
  maxFixAgeMs: 30_000,
  maxExtrapolationMs: 5_000,
}

/** Local equirectangular tangent-plane projection, anchored at the first accepted fix. Accurate to well under a meter of distortion at trail scale (a few km from the anchor); re-anchored automatically if the user wanders far enough that it wouldn't be. Kept private/self-contained rather than imported from routeDeviation.ts's near-identical helper — this module must not depend on anything route-related, even a coincidentally reusable math utility, so it can never accidentally grow a route dependency later. */
function toLocalXY(lat: number, lon: number, anchorLat: number, anchorLon: number): [number, number] {
  const R = 6371000
  const x = ((lon - anchorLon) * Math.PI / 180) * Math.cos(anchorLat * Math.PI / 180) * R
  const y = (lat - anchorLat) * Math.PI / 180 * R
  return [x, y]
}

function fromLocalXY(x: number, y: number, anchorLat: number, anchorLon: number): [number, number] {
  const R = 6371000
  const lat = anchorLat + (y / R) * 180 / Math.PI
  const lon = anchorLon + (x / (R * Math.cos(anchorLat * Math.PI / 180))) * 180 / Math.PI
  return [lat, lon]
}

/** Runs the fix through basic sanity checks that have nothing to do with trail/context — just "is this physically a plausible reading at all". Exported standalone so it's independently testable/reviewable. */
export function checkFixQuality(fix: GeoFix, opts: PositionEngineOptions = {}, now = Date.now()): QualityCheckResult {
  const cfg = { ...DEFAULTS, ...opts }
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return { quality: 'rejected', reason: 'non-finite coordinates' }
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180) return { quality: 'rejected', reason: 'coordinates out of range' }
  if (fix.mock) return { quality: 'rejected', reason: 'mock/spoofed location provider' }
  if (fix.accuracyM != null && (!Number.isFinite(fix.accuracyM) || fix.accuracyM <= 0)) return { quality: 'rejected', reason: 'invalid accuracy' }
  if (!Number.isFinite(fix.ts)) return { quality: 'rejected', reason: 'invalid timestamp' }
  if (fix.ts > now + 5_000) return { quality: 'rejected', reason: 'timestamp in the future' }
  if (now - fix.ts > cfg.maxFixAgeMs) return { quality: 'rejected', reason: 'stale fix' }
  if (fix.accuracyM != null && fix.accuracyM > cfg.rejectAccuracyThresholdM) return { quality: 'rejected', reason: 'accuracy too coarse to use' }
  if (fix.accuracyM != null && fix.accuracyM > cfg.poorAccuracyThresholdM) return { quality: 'poor', reason: 'coarse accuracy' }
  return { quality: 'good' }
}

interface Axis1DKalmanState {
  pos: number
  vel: number
  // 2x2 error covariance [[pp, pv], [pv, vv]] (symmetric)
  pp: number
  pv: number
  vv: number
}

/**
 * One axis of a constant-velocity Kalman filter (position + velocity
 * state). Applied independently to the local-plane x and y axes — decoupled
 * per-axis filtering is a standard simplification for this kind of 2D
 * tracking and avoids a general matrix library for what is, in practice,
 * two small 2x2 systems.
 */
function predictAxis(s: Axis1DKalmanState, dt: number, q: number): Axis1DKalmanState {
  const pos = s.pos + s.vel * dt
  const vel = s.vel
  // Discretized white-noise-acceleration process noise model.
  const qpp = (dt ** 4 / 4) * q
  const qpv = (dt ** 3 / 2) * q
  const qvv = dt ** 2 * q
  return {
    pos, vel,
    pp: s.pp + 2 * dt * s.pv + dt * dt * s.vv + qpp,
    pv: s.pv + dt * s.vv + qpv,
    vv: s.vv + qvv,
  }
}

function updateAxis(s: Axis1DKalmanState, measurement: number, measurementVar: number): Axis1DKalmanState {
  const innovation = measurement - s.pos
  const S = s.pp + measurementVar
  const kPos = s.pp / S
  const kVel = s.pv / S
  return {
    pos: s.pos + kPos * innovation,
    vel: s.vel + kVel * innovation,
    pp: (1 - kPos) * s.pp,
    pv: (1 - kPos) * s.pv,
    vv: s.vv - kVel * s.pv,
  }
}

export class PositionEngine {
  private readonly cfg: Required<PositionEngineOptions>
  private anchorLat: number | null = null
  private anchorLon: number | null = null
  private x: Axis1DKalmanState | null = null
  private y: Axis1DKalmanState | null = null
  private lastFix: GeoFix | null = null
  private lastGoodFix: GeoFix | null = null
  private lastAltitudeM: number | null = null
  private lastBearingDeg: number | null = null

  constructor(opts: PositionEngineOptions = {}) {
    this.cfg = { ...DEFAULTS, ...opts }
  }

  /** Total number of fixes rejected since construction (quality gate + spike rejection) — surfaced for diagnostics/Navigation Health, not used internally. */
  rejectedCount = 0

  /**
   * Feeds one raw fix through quality check → outlier rejection → Kalman
   * filtering. Returns the resulting estimate, or null if the fix was
   * rejected outright (position keeps reflecting the last accepted fix;
   * callers should still call `sample()` for a live position either way).
   */
  ingest(fix: GeoFix): PositionEstimate | null {
    const check = checkFixQuality(fix, this.cfg)
    if (check.quality === 'rejected') {
      this.rejectedCount++
      return null
    }

    if (this.isSpike(fix)) {
      this.rejectedCount++
      return null
    }

    if (this.anchorLat == null || this.anchorLon == null || this.x == null || this.y == null) {
      this.initFilter(fix)
    } else {
      this.updateFilter(fix, check.quality)
    }

    this.lastFix = fix
    this.lastGoodFix = fix
    if (fix.altitudeM != null) this.lastAltitudeM = fix.altitudeM

    return this.currentEstimate(fix.ts, false)
  }

  /**
   * Returns a position estimate for an arbitrary timestamp (typically
   * "now", called once per animation frame) — the 60fps rendering stage.
   * Between real fixes this extrapolates from the filter's own velocity
   * estimate rather than holding the marker frozen at the last fix, up to
   * `maxExtrapolationMs`; beyond that it stops advancing and flags
   * `interpolated: true` with a growing `ageMs` so the caller can treat the
   * position as unreliable instead of quietly drifting on stale velocity.
   */
  sample(atMs: number = Date.now()): PositionEstimate | null {
    if (!this.lastFix || this.x == null || this.y == null || this.anchorLat == null || this.anchorLon == null) return null
    const ageMs = atMs - this.lastFix.ts
    if (ageMs <= 0) return this.currentEstimate(this.lastFix.ts, false)

    const cappedAgeS = Math.min(ageMs, this.cfg.maxExtrapolationMs) / 1000
    const [x, y] = [this.x.pos + this.x.vel * cappedAgeS, this.y.pos + this.y.vel * cappedAgeS]
    const [lat, lon] = fromLocalXY(x, y, this.anchorLat, this.anchorLon)
    const speedMs = Math.hypot(this.x.vel, this.y.vel)

    return {
      lat, lon,
      altitudeM: this.lastAltitudeM,
      accuracyM: this.currentAccuracyM(),
      speedMs,
      bearingDeg: this.lastBearingDeg,
      ts: atMs,
      interpolated: true,
      ageMs,
    }
  }

  reset(): void {
    this.anchorLat = null
    this.anchorLon = null
    this.x = null
    this.y = null
    this.lastFix = null
    this.lastGoodFix = null
    this.lastAltitudeM = null
    this.lastBearingDeg = null
    this.rejectedCount = 0
  }

  private isSpike(fix: GeoFix): boolean {
    const prev = this.lastGoodFix
    if (!prev) return false
    const dtS = (fix.ts - prev.ts) / 1000
    if (dtS <= 0) return true // non-monotonic timestamp — can't be a real subsequent fix
    const distM = haversineM(prev.lat, prev.lon, fix.lat, fix.lon)
    // A jump fully explained by the combined GPS noise circles of both fixes isn't a spike — only
    // the distance in excess of that slack counts towards implied speed.
    const slackM = (prev.accuracyM ?? 15) + (fix.accuracyM ?? 15)
    const netDistM = Math.max(0, distM - slackM)
    const impliedSpeedMs = netDistM / dtS
    return impliedSpeedMs > this.cfg.maxPlausibleSpeedMs
  }

  private initFilter(fix: GeoFix): void {
    this.anchorLat = fix.lat
    this.anchorLon = fix.lon
    const posVar = this.measurementVariance(fix)
    this.x = { pos: 0, vel: 0, pp: posVar, pv: 0, vv: 4 }
    this.y = { pos: 0, vel: 0, pp: posVar, pv: 0, vv: 4 }
    if (fix.bearingDeg != null) this.lastBearingDeg = fix.bearingDeg
  }

  private updateFilter(fix: GeoFix, quality: FixQuality): void {
    const prev = this.lastFix!
    const dt = Math.max(0.05, (fix.ts - prev.ts) / 1000)
    // Re-anchor if we've wandered far enough that the small-angle tangent-plane
    // approximation would start to matter (irrelevant for a single hike in practice).
    if (haversineM(this.anchorLat!, this.anchorLon!, fix.lat, fix.lon) > 5_000) {
      const carriedVel = { x: this.x!.vel, y: this.y!.vel }
      this.initFilter(fix)
      this.x!.vel = carriedVel.x
      this.y!.vel = carriedVel.y
      return
    }

    const [mx, my] = toLocalXY(fix.lat, fix.lon, this.anchorLat!, this.anchorLon!)
    // Poor-but-not-rejected fixes still update the filter, just with much larger
    // measurement variance so the Kalman gain naturally discounts them.
    const measVar = this.measurementVariance(fix) * (quality === 'poor' ? 6 : 1)

    this.x = updateAxis(predictAxis(this.x!, dt, this.cfg.processNoise), mx, measVar)
    this.y = updateAxis(predictAxis(this.y!, dt, this.cfg.processNoise), my, measVar)

    const speedMs = Math.hypot(this.x.vel, this.y.vel)
    if (fix.bearingDeg != null) {
      this.lastBearingDeg = fix.bearingDeg
    } else if (speedMs > 0.3) {
      // Below walking-speed noise floor, a filter-derived bearing is mostly GPS jitter, not real heading — keep the last known bearing instead of thrashing it.
      this.lastBearingDeg = bearingDeg(prev.lat, prev.lon, fix.lat, fix.lon)
    }
  }

  private measurementVariance(fix: GeoFix): number {
    const acc = fix.accuracyM ?? 20
    return acc * acc
  }

  private currentAccuracyM(): number {
    if (!this.x || !this.y) return 20
    // 1-sigma radius from the filter's own position variance on each axis.
    return Math.sqrt(Math.max(this.x.pp, 0) + Math.max(this.y.pp, 0))
  }

  private currentEstimate(ts: number, interpolated: boolean): PositionEstimate {
    const [lat, lon] = fromLocalXY(this.x!.pos, this.y!.pos, this.anchorLat!, this.anchorLon!)
    return {
      lat, lon,
      altitudeM: this.lastAltitudeM,
      accuracyM: this.currentAccuracyM(),
      speedMs: Math.hypot(this.x!.vel, this.y!.vel),
      bearingDeg: this.lastBearingDeg,
      ts,
      interpolated,
      ageMs: 0,
    }
  }
}
