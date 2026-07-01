import type { GeoFix } from './types'

/**
 * Rolling moving-average smoother over the last N raw fixes. Raw
 * `watchPosition` output jitters heavily under tree cover / in canyons
 * (multipath), which makes a live position marker or bearing arrow look
 * erratic if used directly. A short window already fixes most of the
 * perceived jumpiness; a proper Kalman filter is a possible later upgrade,
 * not needed for the first version.
 */
export class GpsSmoother {
  private readonly window: GeoFix[] = []
  private readonly size: number

  constructor(size = 4) {
    this.size = size
  }

  push(fix: GeoFix): GeoFix {
    this.window.push(fix)
    if (this.window.length > this.size) this.window.shift()
    const n = this.window.length
    return {
      lat: this.window.reduce((s, f) => s + f.lat, 0) / n,
      lon: this.window.reduce((s, f) => s + f.lon, 0) / n,
      altitudeM: fix.altitudeM,
      accuracyM: fix.accuracyM,
      speedMs: fix.speedMs,
      ts: fix.ts,
    }
  }

  reset(): void {
    this.window.length = 0
  }

  /** Second-to-last raw fix in the window, if any — used to derive a heading-of-travel fallback bearing. */
  previous(): GeoFix | null {
    return this.window.length >= 2 ? this.window[this.window.length - 2] : null
  }
}
