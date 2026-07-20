'use client'
import { useEffect } from 'react'

/**
 * register() alone leaves update-checking to the browser's own schedule, which — even with
 * public/sw.js now sending Cache-Control: no-cache — can still leave a device running a stale
 * service worker (and therefore its stale fetch-handling logic) for longer than "next app open"
 * should mean. A real case: a newly-saved hike didn't show up anywhere on a device until the
 * service worker was manually unregistered — no page reload alone fixed it, since a reload
 * re-fetches the page/JS but doesn't force the browser to re-check the service worker script
 * controlling that page's own API calls. Calling update() explicitly on every mount (i.e. every
 * app open — this component lives in the root layout) closes that gap: it's the documented way to
 * ask the browser to re-fetch /sw.js right now instead of waiting for its own internal schedule.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => { registration.update().catch(() => {}) })
      .catch((err) => console.warn('[SW] Registration failed:', err))

    // Standard reload-once-on-takeover pattern: even once the browser DOES finish detecting and
    // activating a new service worker (confirmed to take up to ~60s after the previous one was
    // first installed — a real, measured Chromium delay, not a bug in this app), the ALREADY-OPEN
    // page keeps running whatever JS it loaded with and won't retroactively pick up new fetch
    // behavior on its own. Reloading the instant the new worker actually takes control (not
    // before) guarantees the update becomes visible automatically instead of requiring the user
    // to notice and manually refresh again — `refreshing` guards against a double reload if the
    // event fires more than once before navigation completes.
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])
  return null
}
