'use client'
import { useEffect, useRef } from 'react'

/**
 * Subscribes a component to lib/sync/pullEngine.ts's 'cts-updated' event — fired whenever a
 * background pull (or a stale-while-revalidate check) actually applies a newer record to the
 * local cache. Without this, a list/detail view that only fetches once on mount stays frozen on
 * whatever it first read even after SyncEngineProvider silently refreshes the cache underneath
 * it (on app open, reconnect, tab becoming visible, or the periodic safety net) — the change would
 * only become visible after a manual reload.
 *
 * `onUpdate` doesn't need to be memoized: it's read through a ref so passing an inline closure is
 * safe and the listener is still only attached once.
 */
export function useCtsUpdated(onUpdate: () => void): void {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener('cts-updated', handler)
    return () => window.removeEventListener('cts-updated', handler)
  }, [])
}
