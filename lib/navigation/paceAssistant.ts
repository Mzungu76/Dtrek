// Live pace/effort estimate for the active navigation session — replaces the flat
// average-speed ETA in ActiveNavigationView.tsx with a Naismith-based estimate (reusing
// lib/trailScore.ts's formulas, not duplicating them), corrected for live weather and
// continuously reconciled against the hiker's own observed GPS pace.
import { naismithHours } from '@/lib/trailScore'
import { remainingElevation, traveledElevation, type ElevationProfilePoint } from './elevationProfile'

export interface WeatherConditions {
  tempC: number
  windKmh: number
  precipMm: number
}

export type PaceStatus = 'estimating' | 'ahead' | 'on_pace' | 'behind'

export interface PaceUpdateResult {
  liveEtaDate: Date | null
  paceStatus: PaceStatus
  remainingTimeSec: number | null
  /** Estimated time to retrace the already-hiked portion back to the start — the input to the turn-back advisory, not a routing suggestion. */
  returnTripTimeSec: number | null
  blendedPaceMs: number | null
  plannedPaceMs: number | null
  observedPaceMs: number | null
  /** Munter method cross-check (km + gain/100m, at 4 km/h) — display-only, never blended into the live estimate. */
  munterHours: number | null
  confidence: 'low' | 'medium' | 'high'
}

interface PaceAssistantOptions {
  totalRouteM: number
  elevationProfile: ElevationProfilePoint[]
  /** Altitude-physiology + terrain multiplier from lib/trailScore.ts's altitudeTerrainMultiplier, precomputed by the caller. Defaults to 1 (no correction) if omitted. */
  terrainMultiplier?: number
  /** Simplified Tranter-style fatigue/fitness scalar — not the literal Tranter nomogram (see plan's open decision #1). Defaults to 1 (neutral); the observed-pace blend carries most of the personalization in practice. */
  fitnessMult?: number
}

const MOVING_SPEED_THRESHOLD_MS = 0.3   // below this, a GPS fix doesn't count as "moving" (matches the kind of noise floor gpsSmoothing.ts already filters)
const MAX_FIX_GAP_MS = 30000            // a longer gap than this (backgrounded tab, tunnel) isn't attributed to moving time
const BLEND_FULL_TRUST_DISTANCE_M = 1500
const BLEND_MAX_WEIGHT = 0.85
const MIN_OBSERVED_DISTANCE_M = 60      // below GPS noise floor, an "observed pace" over this little distance would be meaningless
const MIN_MOVING_TIME_S = 60

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Same cutoffs lib/openmeteo.ts's clothingSuggestions() already uses for "needs a shell"/
// "needs a windbreaker" — reused here so the pace estimate and the clothing advice never
// silently disagree about what counts as bad weather.
function weatherMultiplier(w: WeatherConditions | null): number {
  if (!w) return 1
  let m = 1
  if (w.tempC < 0) m *= 1.15
  else if (w.tempC > 30) m *= 1.10
  if (w.windKmh > 40) m *= 1.25
  else if (w.windKmh > 25) m *= 1.10
  if (w.precipMm > 5) m *= 1.20
  else if (w.precipMm > 1) m *= 1.08
  return m
}

export class PaceAssistant {
  private readonly totalRouteM: number
  private readonly elevationProfile: ElevationProfilePoint[]
  private readonly terrainMult: number
  private readonly fitnessMult: number
  private weather: WeatherConditions | null = null
  private movingTimeMs = 0
  private lastFixTs: number | null = null

  constructor(opts: PaceAssistantOptions) {
    this.totalRouteM = opts.totalRouteM
    this.elevationProfile = opts.elevationProfile
    this.terrainMult = opts.terrainMultiplier ?? 1
    this.fitnessMult = opts.fitnessMult ?? 1
  }

  setWeather(w: WeatherConditions): void {
    this.weather = w
  }

  update(distanceAlongRouteM: number, traveledDistanceM: number, instantSpeedMs: number | null, fixTs: number): PaceUpdateResult {
    // Own moving-time tracker, decoupled from any pause/resume toggle the UI might have —
    // the engine that owns this class has no visibility into that button.
    if (this.lastFixTs != null) {
      const dtMs = fixTs - this.lastFixTs
      if (dtMs > 0 && dtMs < MAX_FIX_GAP_MS && (instantSpeedMs ?? 0) >= MOVING_SPEED_THRESHOLD_MS) {
        this.movingTimeMs += dtMs
      }
    }
    this.lastFixTs = fixTs

    const remainingM = Math.max(0, this.totalRouteM - distanceAlongRouteM)
    const wMult = weatherMultiplier(this.weather)
    const hasProfile = this.elevationProfile.length > 1

    const { gainM, lossM } = hasProfile ? remainingElevation(this.elevationProfile, distanceAlongRouteM) : { gainM: 0, lossM: 0 }
    const plannedHours = naismithHours(remainingM / 1000, gainM, lossM).total * this.terrainMult * this.fitnessMult * wMult
    const plannedPaceMs = plannedHours > 0 ? remainingM / (plannedHours * 3600) : null

    const munterHours = hasProfile ? (remainingM / 1000 + gainM / 100) / 4 : null

    let observedPaceMs: number | null = null
    if (traveledDistanceM >= MIN_OBSERVED_DISTANCE_M && this.movingTimeMs >= MIN_MOVING_TIME_S * 1000) {
      observedPaceMs = traveledDistanceM / (this.movingTimeMs / 1000)
    }

    const weight = clamp(traveledDistanceM / BLEND_FULL_TRUST_DISTANCE_M, 0, BLEND_MAX_WEIGHT)
    const blendedPaceMs = observedPaceMs != null && plannedPaceMs != null
      ? weight * observedPaceMs + (1 - weight) * plannedPaceMs
      : plannedPaceMs

    let remainingTimeSec: number | null = null
    let liveEtaDate: Date | null = null
    if (remainingM <= 0) {
      remainingTimeSec = 0
      liveEtaDate = new Date(fixTs)
    } else if (blendedPaceMs != null && blendedPaceMs > 0.05) {
      remainingTimeSec = remainingM / blendedPaceMs
      liveEtaDate = new Date(fixTs + remainingTimeSec * 1000)
    }

    let paceStatus: PaceStatus = 'estimating'
    if (weight > 0.15 && observedPaceMs != null && plannedPaceMs != null && plannedPaceMs > 0) {
      const ratio = observedPaceMs / plannedPaceMs
      paceStatus = ratio > 1.08 ? 'ahead' : ratio < 0.92 ? 'behind' : 'on_pace'
    }

    // Return-trip estimate: retrace the already-hiked portion, with gain/loss swapped (what
    // was climbed becomes what must be descended, and vice versa) — the input to the
    // turn-back advisory computed by the caller, never a routing suggestion.
    const traveled = hasProfile ? traveledElevation(this.elevationProfile, distanceAlongRouteM) : { gainM: 0, lossM: 0 }
    const returnTripTimeSec = traveledDistanceM > 0
      ? naismithHours(traveledDistanceM / 1000, traveled.lossM, traveled.gainM).total * this.terrainMult * this.fitnessMult * wMult * 3600
      : null

    const confidence: PaceUpdateResult['confidence'] = observedPaceMs == null ? 'low' : weight < 0.5 ? 'medium' : 'high'

    return {
      liveEtaDate, paceStatus, remainingTimeSec, returnTripTimeSec,
      blendedPaceMs, plannedPaceMs, observedPaceMs, munterHours, confidence,
    }
  }
}
