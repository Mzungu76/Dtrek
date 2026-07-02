/**
 * Bearing math (shared with RouteMap3D's 3D flythrough) plus best-effort
 * live device compass, with GPS-bearing fallback when the sensor is
 * unavailable or the permission is denied (notably iOS Safari, which
 * requires DeviceOrientationEvent.requestPermission() behind a user tap).
 */

export function bearingDeg(la1: number, lo1: number, la2: number, lo2: number): number {
  const rad = (d: number) => d * Math.PI / 180
  const dl = rad(lo2 - lo1), y = Math.sin(dl) * Math.cos(rad(la2))
  const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Circular mean for bearings — avoids the 350°/10° → 180° bug at north crossings. */
export function circularMeanBearings(bearings: number[], half: number): number[] {
  return bearings.map((_, i) => {
    const s = bearings.slice(Math.max(0, i - half), Math.min(bearings.length, i + half + 1))
    const x = s.reduce((sum, b) => sum + Math.cos(b * Math.PI / 180), 0) / s.length
    const y = s.reduce((sum, b) => sum + Math.sin(b * Math.PI / 180), 0) / s.length
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
  })
}

type CompassListener = (bearingDeg: number, source: 'sensor' | 'gps') => void

/** iOS 13+ gates DeviceOrientationEvent behind an explicit user gesture. Call from a click handler. */
export async function requestOrientationPermission(): Promise<boolean> {
  const DOE = (window as any).DeviceOrientationEvent
  if (DOE && typeof DOE.requestPermission === 'function') {
    try { return (await DOE.requestPermission()) === 'granted' } catch { return false }
  }
  return true // no permission gate on this platform (or no sensor at all — caller detects that separately)
}

/**
 * Subscribes to the device compass when available. Returns an unsubscribe
 * function. Does NOT fall back to GPS bearing itself — that fallback is the
 * caller's responsibility (navigationEngine derives it from consecutive fixes
 * when no sensor event has arrived recently), keeping this module a thin,
 * side-effect-scoped sensor adapter.
 */
export function watchDeviceCompass(onChange: CompassListener): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (e: DeviceOrientationEvent) => {
    // iOS exposes a ready-to-use true-north heading; elsewhere `alpha` is
    // relative to the device's start orientation and only approximates it.
    const heading = (e as any).webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
    if (heading != null && Number.isFinite(heading)) onChange(((heading % 360) + 360) % 360, 'sensor')
  }

  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
  window.addEventListener(eventName, handler as EventListener)
  return () => window.removeEventListener(eventName, handler as EventListener)
}

export function isOrientationSupported(): boolean {
  return typeof window !== 'undefined' && ('DeviceOrientationEvent' in window)
}

/**
 * True only on platforms that gate the compass behind an explicit tap
 * (iOS 13+ Safari) — everywhere else requestOrientationPermission()
 * resolves true with no native prompt at all, so a persistent "enable
 * compass" button has nothing to do there and just reads as a dead,
 * confusing control (reported as "pulsante inutile"). Callers should only
 * show that button when this is true, and can silently call
 * requestOrientationPermission() on mount otherwise.
 */
export function needsOrientationPermissionGesture(): boolean {
  if (typeof window === 'undefined') return false
  const DOE = (window as any).DeviceOrientationEvent
  return !!DOE && typeof DOE.requestPermission === 'function'
}
