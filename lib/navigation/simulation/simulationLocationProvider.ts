/**
 * A GPS source with no GPS. Implements the exact same LocationProvider
 * contract (lib/native/locationSource.ts) as the real native/web source,
 * so NavigationEngine — and everything built on it (Position Engine,
 * Off-Route Engine, Escape Engine, pace, POI proximity) — can be exercised
 * end to end with a scripted sequence of fixes instead of a real device
 * outdoors. See lib/navigation/simulation/gpxReplay.ts and
 * scenarioBuilder.ts for how those sequences get built.
 *
 * Deliberately timer-driven rather than delivering everything at once:
 * NavigationEngine's own logic (GPS-lost watchdog, off-route dwell timers,
 * Position Engine's extrapolation) is wall-clock-based, so a scenario has
 * to actually unfold over time to exercise it faithfully — not just be a
 * big final assertion over a flat list of fixes.
 */
import type { GeoFix } from '../types'
import type { LocationMode, LocationProvider, LocationSourceError } from '@/lib/native/locationSource'

export interface SimulationOptions {
  /** Fixes to play back, in ascending `ts` order. */
  fixes: GeoFix[]
  /**
   * Playback speed relative to the fixes' own timestamps: 1 = real-time,
   * 5 = five times faster. `0` (or omitted with `asFastAsPossible: true`)
   * delivers every fix back-to-back with no waiting, for a quick
   * eyeball-the-console check. Default 1.
   */
  speed?: number
  /** Deliver fixes with no wait at all, ignoring their timestamps entirely — the fastest way to see the final state, at the cost of never exercising the engine's own time-based logic (dwell timers, GPS-lost watchdog, extrapolation). Default false. */
  asFastAsPossible?: boolean
  /** Restart from the first fix after the last one plays — useful for leaving a scenario running while poking at the UI. Default false. */
  loop?: boolean
}

export class SimulationLocationProvider implements LocationProvider {
  private timers: ReturnType<typeof setTimeout>[] = []
  private running = false

  constructor(
    private readonly opts: SimulationOptions,
    private readonly onFix: (fix: GeoFix) => void,
    private readonly onError: (err: LocationSourceError) => void,
  ) {}

  async start(_mode?: LocationMode): Promise<void> {
    this.running = true
    this.schedule()
  }

  stop(): void {
    this.running = false
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  /** Battery-aware modes (spec §12) don't mean anything to a scripted replay — accepted for interface compatibility, changes nothing. */
  async setMode(): Promise<void> {}

  /** Nothing is ever buffered outside the running timers — there's no "WebView was suspended" case to catch up from in a simulation. */
  async catchUp(): Promise<void> {}

  private schedule(): void {
    const { fixes } = this.opts
    if (fixes.length === 0) {
      this.onError({ code: 2, message: 'Simulation scenario has no fixes' })
      return
    }

    const speed = this.opts.asFastAsPossible ? 0 : (this.opts.speed ?? 1)
    const t0 = fixes[0].ts

    for (const fix of fixes) {
      const delayMs = speed > 0 ? Math.max(0, (fix.ts - t0) / speed) : 0
      const timer = setTimeout(() => {
        if (this.running) this.onFix({ ...fix, source: 'simulated' })
      }, delayMs)
      this.timers.push(timer)
    }

    if (this.opts.loop) {
      const spanMs = speed > 0 ? (fixes[fixes.length - 1].ts - t0) / speed : 0
      const loopTimer = setTimeout(() => { if (this.running) this.schedule() }, spanMs + 200)
      this.timers.push(loopTimer)
    }
  }
}
