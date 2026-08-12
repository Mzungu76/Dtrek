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

export interface BatteryState {
  level: number
  charging: boolean
}

/**
 * Continuous battery level/charging feed — the raw signal `watchBattery`'s one-shot low-threshold
 * warning below is built on, and also what `lib/navigation/locationModeDecider.ts` (Fase 8's
 * battery-aware automatic mode switching) needs: a proactive downshift has to compare against its
 * own, earlier threshold than the "already critical" warning here, which a one-shot callback
 * can't give it. Calls back immediately once the Battery Status API resolves, then on every
 * subsequent level/charging change. Returns an unsubscribe function; a no-op subscription
 * (immediately returns a no-op unsubscribe) where the API isn't supported.
 */
export function watchBatteryLevel(onChange: (state: BatteryState) => void): () => void {
  if (!isBatteryApiSupported()) return () => {}
  let battery: BatteryManagerLike | null = null
  let cancelled = false

  const report = () => { if (battery) onChange({ level: battery.level, charging: battery.charging }) }

  ;(navigator as unknown as { getBattery: () => Promise<BatteryManagerLike> }).getBattery().then((b) => {
    if (cancelled) return
    battery = b
    battery.addEventListener('levelchange', report)
    battery.addEventListener('chargingchange', report)
    report()
  }).catch(() => {})

  return () => {
    cancelled = true
    if (battery) {
      battery.removeEventListener('levelchange', report)
      battery.removeEventListener('chargingchange', report)
    }
  }
}

/**
 * Calls onLow(level) at most once per watch — level drops below
 * LOW_BATTERY_THRESHOLD while not charging — then stays silent until it goes
 * back above the threshold or starts charging, so the callout doesn't repeat
 * on every subsequent levelchange tick. Returns an unsubscribe function.
 */
export function watchBattery(onLow: (level: number) => void): () => void {
  let alreadyWarned = false
  return watchBatteryLevel(({ level, charging }) => {
    if (charging) { alreadyWarned = false; return }
    if (level <= LOW_BATTERY_THRESHOLD) {
      if (!alreadyWarned) { alreadyWarned = true; onLow(level) }
    } else {
      alreadyWarned = false
    }
  })
}
