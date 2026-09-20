'use client'
import { useEffect, useRef } from 'react'

/**
 * Auto-clears a non-critical in-app notice after `ms` of it being shown, so the notification
 * stack above the map (ActiveNavigationView.tsx) doesn't need a manual "✕" tap for banners that
 * are informational rather than actionable (weather lookahead, offline map warnings, wildlife
 * risk...) — same idea as a toast, reusing the existing dismiss state/button instead of standing
 * up a second notification system. Deliberately NOT applied to the off-route/wrong-direction/
 * gps-lost/low-battery banners, which stay up until their underlying condition actually resolves
 * — those are never just "informational".
 *
 * `onDismiss` is read through a ref rather than being a dependency, so passing a fresh inline
 * closure on every render (the common call shape here, e.g. `() => setFoo(false)`) doesn't reset
 * the timer — only `active` flipping true does.
 */
export function useAutoDismiss(active: boolean, onDismiss: () => void, ms = 12_000): void {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => onDismissRef.current(), ms)
    return () => clearTimeout(timer)
  }, [active, ms])
}
