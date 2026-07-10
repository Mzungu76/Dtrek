'use client'
import { useEffect } from 'react'
import { flush, startPeriodicSafetyNet } from '@/lib/sync/syncEngine'

/**
 * Mounts the outbox-flush triggers for the whole app session: an immediate
 * flush on load (covers anything left pending from a killed tab), network
 * reconnect, backgrounding, tab close (best-effort), and an hourly safety
 * net in case none of the above ever fire. Entity-specific flush logic
 * lives in each entity's store module (e.g. lib/sync/userSettingsStore.ts);
 * this component only wires the generic triggers from lib/sync/syncEngine.ts.
 */
export default function SyncEngineProvider() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }

    flush()
    startPeriodicSafetyNet()

    const onOnline     = () => flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    const onBeforeUnload = () => { flush() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  return null
}
