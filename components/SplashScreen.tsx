'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'

// Minimum time the splash stays fully visible before it's allowed to fade — long enough that a
// genuinely instant load doesn't flash the logo for one frame and vanish (which reads as a glitch,
// not a splash screen), short enough not to add real delay on top of whatever the app is doing.
const MIN_VISIBLE_MS = 350
const FADE_MS = 280

/**
 * Server-rendered in the initial HTML (app/layout.tsx renders this above `children`), so it's
 * what shows the instant the page arrives — before hydration, before the middleware's auth
 * round-trip has even settled the navigation, before /guida's own client-side data fetching
 * starts. Replaces what would otherwise be a blank white flash with the app's own branding, then
 * fades out and unmounts once the app has actually started rendering underneath it (the /guida
 * hub shows its own "Caricamento…" state in the same #0b1a24 shell color, so the handoff reads as
 * one continuous screen instead of splash → flash → different spinner).
 */
export default function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer   = setTimeout(() => setFading(true), MIN_VISIBLE_MS)
    const removeTimer = setTimeout(() => setVisible(false), MIN_VISIBLE_MS + FADE_MS)
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer) }
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#0b1a24] transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
      aria-hidden="true"
    >
      <div className="relative w-20 h-20 rounded-3xl overflow-hidden shadow-lg shadow-black/40">
        <Image src="/icon-192.png" alt="" fill sizes="80px" priority />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold text-white tracking-wide">DTrek</p>
        <p className="text-[11px] text-stone-400 mt-0.5">Il tuo diario di trekking</p>
      </div>
      <div className="mt-2 w-8 h-8 rounded-full border-2 border-white/15 border-t-forest-400 animate-spin" />
    </div>
  )
}
