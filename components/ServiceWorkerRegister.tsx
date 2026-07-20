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
  }, [])
  return null
}
