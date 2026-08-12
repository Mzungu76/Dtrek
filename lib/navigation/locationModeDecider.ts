/**
 * Battery-aware mode decider (spec §12, roadmap Fase 8). `LocationMode` (native, four cadence/
 * priority profiles — android/.../LocationMode.kt) already exists and `NavigationEngine.
 * setLocationMode()` already forwards a mode to the native foreground service; what was missing
 * is the policy that picks one automatically from live signals (speed, GPS quality, proximity to
 * a turn, deviation state, battery level) instead of the caller having to set it explicitly.
 *
 * Pure decision function + a small stateful wrapper for hysteresis — same split as
 * offRouteEngine.ts (pure verdict, wall-clock dwell before acting on a change) so a signal
 * blipping across a threshold for one fix doesn't thrash the native GPS request on and off.
 */
import type { LocationMode } from '@/lib/native/locationSource'
import type { NavState } from './types'

export interface LocationModeSignals {
  state: NavState
  instantSpeedMs: number | null
  accuracyM: number | null
  /** Distance to the next turn-by-turn instruction, from the most recent `instructionUpdated` event — null if there's no next instruction (end of route) or none has fired yet. */
  distanceToNextInstructionM: number | null
  /** 0..1, or null when the Battery Status API isn't available (notably iOS Safari) — treated as "unknown", never assumed low. */
  batteryLevel: number | null
  batteryCharging: boolean
}

const FAST_SPEED_MS = 2.5 // faster than typical hiking pace (~1.2-1.4 m/s) — jogging, cycling-assisted approach, fast downhill
const NEAR_INSTRUCTION_M = 100
const POOR_ACCURACY_M = 30
// More conservative than battery.ts's LOW_BATTERY_THRESHOLD (0.15, a reactive "you're already
// critical" warning) — this is a proactive downshift, meant to buy time before the phone ever
// gets that low, not a reaction to it already being there.
const LOW_BATTERY_FOR_DOWNSHIFT = 0.30
const MODE_CHANGE_DWELL_MS = 8000

/**
 * Picks the mode that fits the current instant, highest-priority signal wins. Pure and stateless
 * — call it as often as you like, hysteresis (avoiding thrashing on a signal near a threshold)
 * is `LocationModeDecider`'s job below, not this function's.
 */
export function decideLocationMode(signals: LocationModeSignals): LocationMode {
  // 1. Off-route/wrong-direction: the hiker needs the most reliable, frequent fixes to resolve it
  //    safely, regardless of anything else — spec: "Durante Navigation/Emergency privilegiare
  //    affidabilità rispetto al consumo".
  if (signals.state === 'off_route' || signals.state === 'wrong_direction') return 'emergency'

  // 2. Approaching a turn — needs precise, frequent fixes to actually catch it.
  if (signals.distanceToNextInstructionM != null && signals.distanceToNextInstructionM < NEAR_INSTRUCTION_M) return 'navigation'

  // 3. Moving faster than typical hiking pace — a slower fix rate would fall behind real position.
  if (signals.instantSpeedMs != null && signals.instantSpeedMs > FAST_SPEED_MS) return 'navigation'

  // 4. Poor GPS quality — more frequent sampling gives the Position Engine's Kalman filter more
  //    data points to average the noise out of, even though the priority request itself
  //    (PRIORITY_HIGH_ACCURACY) is already the same between trekking and navigation mode.
  if (signals.accuracyM != null && signals.accuracyM > POOR_ACCURACY_M) return 'navigation'

  // 5. Nothing urgent, and battery is getting low while not charging — proactively save power.
  if (signals.batteryLevel != null && signals.batteryLevel < LOW_BATTERY_FOR_DOWNSHIFT && !signals.batteryCharging) return 'battery_save'

  return 'trekking'
}

/**
 * Wraps `decideLocationMode` with wall-clock hysteresis so a signal hovering near a threshold
 * doesn't repeatedly tear down and restart the native location request. `update()` returns the
 * new mode to switch to only when it should actually change now; null otherwise.
 */
export class LocationModeDecider {
  private currentMode: LocationMode
  private pendingMode: LocationMode | null = null
  private pendingSinceMs = 0

  constructor(initialMode: LocationMode = 'trekking') {
    this.currentMode = initialMode
  }

  update(signals: LocationModeSignals, nowMs: number): LocationMode | null {
    const desired = decideLocationMode(signals)
    if (desired === this.currentMode) {
      this.pendingMode = null
      return null
    }

    // Emergency is the one exception to the dwell delay — a hiker who just went off-route
    // shouldn't wait 8 seconds for better fixes to start arriving.
    if (desired === 'emergency') {
      this.currentMode = 'emergency'
      this.pendingMode = null
      return 'emergency'
    }

    if (this.pendingMode !== desired) {
      this.pendingMode = desired
      this.pendingSinceMs = nowMs
      return null
    }
    if (nowMs - this.pendingSinceMs < MODE_CHANGE_DWELL_MS) return null

    this.currentMode = desired
    this.pendingMode = null
    return desired
  }
}
