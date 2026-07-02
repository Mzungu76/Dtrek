/**
 * Best-effort low-battery watcher for live navigation, via the (non-standard,
 * Chromium-only) Battery Status API. A dead phone mid-hike means no map and
 * no GPS — worth a one-time warning while there's still time to switch to a
 * power bank / reduce screen brightness, even though this API isn't
 * available everywhere (notably iOS Safari, which never exposed it).
 */
const LOW_BATTERY_THRESHOLD = 0.15

interface BatteryManagerLike {
  level: number
  charging: boolean
  addEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void
  removeEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void
}

export function isBatteryApiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as unknown as { getBattery?: unknown }).getBattery === 'function'
}

/**
 * Calls onLow(level) at most once per watch — level drops below
 * LOW_BATTERY_THRESHOLD while not charging — then stays silent until it goes
 * back above the threshold or starts charging, so the callout doesn't repeat
 * on every subsequent levelchange tick. Returns an unsubscribe function.
 */
export function watchBattery(onLow: (level: number) => void): () => void {
  if (!isBatteryApiSupported()) return () => {}
  let battery: BatteryManagerLike | null = null
  let alreadyWarned = false
  let cancelled = false

  const check = () => {
    if (!battery) return
    if (battery.charging) { alreadyWarned = false; return }
    if (battery.level <= LOW_BATTERY_THRESHOLD) {
      if (!alreadyWarned) { alreadyWarned = true; onLow(battery.level) }
    } else {
      alreadyWarned = false
    }
  }

  ;(navigator as unknown as { getBattery: () => Promise<BatteryManagerLike> }).getBattery().then((b) => {
    if (cancelled) return
    battery = b
    battery.addEventListener('levelchange', check)
    battery.addEventListener('chargingchange', check)
    check()
  }).catch(() => {})

  return () => {
    cancelled = true
    if (battery) {
      battery.removeEventListener('levelchange', check)
      battery.removeEventListener('chargingchange', check)
    }
  }
}
