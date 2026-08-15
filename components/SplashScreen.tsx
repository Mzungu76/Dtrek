'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Capacitor } from '@capacitor/core'
import { SplashScreen as NativeSplashScreen } from '@capacitor/splash-screen'

// Minimum time the splash stays fully visible before it's allowed to fade — long enough that a
// genuinely instant load doesn't flash the logo for one frame and vanish (which reads as a glitch,
// not a splash screen), short enough not to add real delay on top of whatever the app is doing.
// This only needs to bridge the gap until hydration + first paint of the real app shell underneath
// (which now shows its own skeleton immediately, see HubSkeleton), not until data has actually
// loaded. It was previously tuned down to 120/150 — too short to reliably register as a deliberate
// splash rather than a display glitch on a fast load, especially since the timer only starts once
// this component's own effect runs (after hydration, which on a warm cache can be near-instant) —
// so the floor needs enough margin above "imperceptible" on its own, independent of how fast
// hydration was.
const MIN_VISIBLE_MS = 260
const FADE_MS = 220

/**
 * Server-rendered in the initial HTML (app/layout.tsx renders this above `children`), so it's
 * what shows the instant the page arrives — before hydration, before the middleware's auth
 * round-trip has even settled the navigation, before /guida's own client-side data fetching
 * starts. Replaces what would otherwise be a blank white flash with the app's own branding, then
 * fades out and unmounts once the app has actually started rendering underneath it (the /guida
 * hub shows its own "Caricamento…" state in the same #0b1a24 shell color, so the handoff reads as
 * one continuous screen instead of splash → flash → different spinner).
 *
 * Inside DTrek Navigator (the Capacitor shell), this same #0b1a24 screen is also the hand-off
 * point from the NATIVE splash (drawable/splash.png, kept on screen the whole time via
 * `SplashScreen: { launchAutoHide: false }` in capacitor.config.ts) — the WebView has to fetch
 * the whole `/navigatore` page over the network before this component's own effect can even run,
 * which on a cold connection is the slow part users actually notice. Hiding the native splash
 * only here, once this component has truly mounted, means that entire wait stays covered by
 * real branding instead of dropping to a flat, unbranded background partway through.
 *
 * The main DTrek app has no native shell of its own (mainAppLinks.ts) — isNativePlatform() is
 * only ever true inside Navigator, so that's the one branch that needs Navigator's own
 * icon/name instead of DTrek's, otherwise this screen (Navigator's actual first paint, the
 * direct continuation of its native splash) shows the wrong app's branding.
 */
export default function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const isNavigator = Capacitor.isNativePlatform()

  useEffect(() => {
    if (isNavigator) NativeSplashScreen.hide().catch(() => {})
    const fadeTimer   = setTimeout(() => setFading(true), MIN_VISIBLE_MS)
    const removeTimer = setTimeout(() => setVisible(false), MIN_VISIBLE_MS + FADE_MS)
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#0b1a24] transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
      aria-hidden="true"
    >
      <div className="relative w-20 h-20 rounded-3xl overflow-hidden shadow-lg shadow-black/40">
        <Image src={isNavigator ? '/icon-navigator-192.png' : '/icon-192.png'} alt="" fill sizes="80px" priority />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold text-white tracking-wide">{isNavigator ? 'DTrek Navigator' : 'DTrek'}</p>
        <p className="text-[11px] text-stone-400 mt-0.5">{isNavigator ? 'Naviga il tuo percorso' : 'Il tuo diario di trekking'}</p>
      </div>
      <div className="mt-2 w-8 h-8 rounded-full border-2 border-white/15 border-t-forest-400 animate-spin" />
    </div>
  )
}
