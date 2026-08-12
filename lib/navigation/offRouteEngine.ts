/**
 * Off-Route Engine (spec §5/§15). Deliberately not a single-threshold
 * `distance > X → OFF ROUTE` check — that flaps on ordinary GPS noise and
 * can't distinguish "clearly wandered off the trail" from "GPS is just bad
 * right now". Instead it weighs, on every sample:
 *
 *   - distanceToRouteM, discounted by GPS accuracy (a jump fully explained
 *     by noise isn't a real deviation);
 *   - whether that discounted distance is trending up or down over the last
 *     few seconds (a spike that's already shrinking isn't a real deviation
 *     either, even if still nominally over threshold);
 *   - WALL-CLOCK time spent beyond threshold ("isteresi temporale" per
 *     spec — not a fix count, which drifts with GPS fix rate/mode);
 *   - direction: on the path but heading the wrong way along it
 *     (wrong_direction) is a distinct, useful signal from being physically
 *     off the path (off_route).
 *
 * Explicitly out of scope here (Fase 4 territory): checking the trail graph
 * for nearby alternative paths. This engine only knows about the single
 * planned route's distance/direction — see docs/navigation-engine-roadmap.md.
 */
import { angleDiffDeg } from './orientation'

export type RouteAdherence = 'on_route' | 'uncertain' | 'off_route'

export interface OffRouteSample {
  ts: number
  distanceToRouteM: number
  /** Position Engine's own filtered accuracy estimate (lib/navigation/positionEngine.ts), not the raw fix's — see navigationEngine.ts for why. */
  accuracyM: number | null
  /** Hiker's current heading of travel. */
  headingDeg: number | null
  /** The route's own forward direction at the nearest point (RouteProgress.expectedBearingDeg). */
  expectedHeadingDeg: number | null
  /** Used to gate wrong_direction on GPS bearing noise — a near-stationary hiker's "heading" is meaningless. */
  speedMs: number | null
}

export interface OffRouteResult {
  adherence: RouteAdherence
  wrongDirection: boolean
  /** Absolute compass bearing (0-360) toward the nearest point on the route — for a "head this way" indicator. Same meaning as the old offRoute event's bearingToRouteDeg, computed by the caller (needs the fix's own lat/lon, which this engine doesn't see). */
  changed: boolean
}

export interface OffRouteEngineOptions {
  /** Distance (m) beyond which a divergence starts being considered, before any accuracy adjustment. Spec example: accuracy=5m, distance=25m → OFF ROUTE, which is baseThresholdM(20) + accuracyM(5)*accuracySlackFactor(1). */
  baseThresholdM?: number
  /** Meters of "GPS noise slack" credited per meter of accuracy when deciding the enter-off-route distance. */
  accuracySlackFactor?: number
  /** Exiting off_route back to on_route requires distance to drop below enterThreshold scaled by this (< 1) — an asymmetric band so a fix sitting exactly at the boundary doesn't flap the state every other sample. */
  exitBandFactor?: number
  /** Wall-clock ms a divergence must persist, with a non-decreasing trend, before declaring OFF_ROUTE. Spec example uses ~20s. */
  offRouteDwellMs?: number
  /** Wall-clock ms back under the exit threshold before declaring ON_ROUTE again. */
  onRouteDwellMs?: number
  /** Above this raw accuracy, distance-to-route can't be trusted either way — capped at UNCERTAIN regardless of the reported distance (unless sanityDistanceM below is also exceeded). Spec example: accuracy=35m, distance=20m → UNCERTAIN. */
  uncertainAccuracyThresholdM?: number
  /** Even with terrible accuracy, a distance this large isn't explainable by GPS noise alone — still counts toward OFF_ROUTE dwell instead of being swallowed into UNCERTAIN forever. */
  sanityDistanceM?: number
  /** Angular difference (degrees) between actual and expected heading beyond which direction is "incompatible". */
  wrongDirectionAngleDeg?: number
  /** Below this speed, a GPS-derived heading is mostly noise, not real direction of travel — wrong_direction is never evaluated below it. */
  wrongDirectionMinSpeedMs?: number
  /** Wall-clock ms a heading mismatch must persist before flagging wrong_direction — same temporal-hysteresis reasoning as the distance check, just a shorter window since it's a secondary refinement. */
  wrongDirectionDwellMs?: number
}

const DEFAULTS: Required<OffRouteEngineOptions> = {
  baseThresholdM: 20,
  accuracySlackFactor: 1,
  exitBandFactor: 0.6,
  offRouteDwellMs: 15_000,
  onRouteDwellMs: 5_000,
  uncertainAccuracyThresholdM: 30,
  sanityDistanceM: 100,
  wrongDirectionAngleDeg: 120,
  wrongDirectionMinSpeedMs: 0.4,
  wrongDirectionDwellMs: 8_000,
}

export class OffRouteEngine {
  private readonly cfg: Required<OffRouteEngineOptions>
  private adherence: RouteAdherence = 'on_route'
  private wrongDirection = false
  private offRouteSinceMs: number | null = null
  private onRouteSinceMs: number | null = null
  private wrongDirectionSinceMs: number | null = null
  private rightDirectionSinceMs: number | null = null
  /** Rolling window of recent (ts, distance) samples for trend detection — capped by count, not time, so a burst of fast fixes doesn't starve it. */
  private recentDistances: { ts: number; distM: number }[] = []

  constructor(opts: OffRouteEngineOptions = {}) {
    this.cfg = { ...DEFAULTS, ...opts }
  }

  reset(): void {
    this.adherence = 'on_route'
    this.wrongDirection = false
    this.offRouteSinceMs = null
    this.onRouteSinceMs = null
    this.wrongDirectionSinceMs = null
    this.rightDirectionSinceMs = null
    this.recentDistances = []
  }

  update(sample: OffRouteSample): OffRouteResult {
    const prevAdherence = this.adherence
    const prevWrongDirection = this.wrongDirection

    this.updateAdherence(sample)

    // Direction-vs-route-tangent only means something when the hiker is actually on the route
    // geometrically — off_route/uncertain already say enough on their own, and evaluating a
    // "wrong direction" verdict against a route point that's tens of meters away would just be
    // noise. Reset immediately (not on a dwell) so leaving on_route always clears it right away.
    if (this.adherence === 'on_route') {
      this.updateDirection(sample)
    } else if (this.wrongDirection || this.wrongDirectionSinceMs != null) {
      this.wrongDirection = false
      this.wrongDirectionSinceMs = null
      this.rightDirectionSinceMs = null
    }

    return {
      adherence: this.adherence,
      wrongDirection: this.wrongDirection,
      changed: this.adherence !== prevAdherence || this.wrongDirection !== prevWrongDirection,
    }
  }

  private updateAdherence(sample: OffRouteSample): void {
    const { ts, distanceToRouteM, accuracyM } = sample
    const cfg = this.cfg

    this.recentDistances.push({ ts, distM: distanceToRouteM })
    if (this.recentDistances.length > 8) this.recentDistances.shift()
    // Positive = growing distance (getting worse) over the tracked window; zero/negative = holding or improving.
    const trend = this.recentDistances.length >= 2
      ? this.recentDistances[this.recentDistances.length - 1].distM - this.recentDistances[0].distM
      : 0

    const untrustedAccuracy = accuracyM != null && accuracyM > cfg.uncertainAccuracyThresholdM
    if (untrustedAccuracy && distanceToRouteM < cfg.sanityDistanceM) {
      // Can't confirm or deny — report it honestly instead of guessing, and don't let a single
      // bad-accuracy fix corrupt the dwell timers being built up around it either way.
      this.adherence = 'uncertain'
      return
    }

    const slack = (accuracyM ?? 15) * cfg.accuracySlackFactor
    const enterThresholdM = cfg.baseThresholdM + slack
    const exitThresholdM = enterThresholdM * cfg.exitBandFactor

    if (distanceToRouteM >= enterThresholdM) {
      this.onRouteSinceMs = null
      if (this.offRouteSinceMs == null) this.offRouteSinceMs = ts
      const dwelled = ts - this.offRouteSinceMs >= cfg.offRouteDwellMs
      const worseningOrSustained = trend >= 0 || this.adherence === 'off_route'
      if (dwelled && worseningOrSustained) {
        this.adherence = 'off_route'
      } else if (this.adherence !== 'off_route') {
        this.adherence = 'uncertain'
      }
    } else if (distanceToRouteM <= exitThresholdM) {
      this.offRouteSinceMs = null
      if (this.onRouteSinceMs == null) this.onRouteSinceMs = ts
      if (ts - this.onRouteSinceMs >= cfg.onRouteDwellMs) {
        this.adherence = 'on_route'
      }
      // else: keep whatever it currently is until the dwell is satisfied — avoids flapping
      // straight back to on_route on the first fix that dips under the exit band.
    }
    // else: in the dead zone between exit and enter thresholds — hold the current state and
    // timers as-is; neither confirms nor clears anything.
  }

  private updateDirection(sample: OffRouteSample): void {
    const cfg = this.cfg
    const { ts, headingDeg, expectedHeadingDeg, speedMs } = sample

    const evaluable = headingDeg != null && expectedHeadingDeg != null
      && speedMs != null && speedMs >= cfg.wrongDirectionMinSpeedMs
    const incompatible = evaluable && angleDiffDeg(headingDeg!, expectedHeadingDeg!) > cfg.wrongDirectionAngleDeg

    if (!evaluable) {
      // No usable signal this sample — hold the previous verdict rather than clearing it, same
      // "don't flap on a single missing reading" reasoning as the distance check above.
      return
    }

    if (incompatible) {
      this.rightDirectionSinceMs = null
      if (this.wrongDirectionSinceMs == null) this.wrongDirectionSinceMs = ts
      if (ts - this.wrongDirectionSinceMs >= cfg.wrongDirectionDwellMs) this.wrongDirection = true
    } else {
      this.wrongDirectionSinceMs = null
      if (this.rightDirectionSinceMs == null) this.rightDirectionSinceMs = ts
      if (ts - this.rightDirectionSinceMs >= cfg.onRouteDwellMs) this.wrongDirection = false
    }
  }
}
