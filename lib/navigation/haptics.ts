/**
 * Thin wrapper over navigator.vibrate — best-effort haptic feedback for
 * critical navigation events (off-route, GPS lost, POI reached, arrival),
 * useful since the phone is often in a pocket/armband and not being looked
 * at continuously. No-op wherever the Vibration API isn't available
 * (notably iOS Safari), the events themselves already have a visual/audio
 * fallback.
 */
export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function vibrate(pattern: number | number[]): void {
  if (!isHapticsSupported()) return
  try { navigator.vibrate(pattern) } catch {}
}

export const haptics = {
  /** Short double-buzz — used for off-route and GPS-lost, attention-grabbing without being alarming. */
  alert: () => vibrate([120, 80, 120]),
  /** Single short buzz — POI/moment reached, a lighter-weight "look at this" nudge. */
  notify: () => vibrate(80),
  /** Longer single buzz — hike finished. */
  success: () => vibrate(200),
}
