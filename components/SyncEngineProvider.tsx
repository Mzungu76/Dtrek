'use client'
import { useEffect } from 'react'
import { flush, startPeriodicSafetyNet } from '@/lib/sync/syncEngine'
import { pullAll } from '@/lib/sync/pullEngine'
import { startRealtimeSync } from '@/lib/sync/realtimeSync'

// Side-effect imports: each of these modules self-registers its outbox flusher (push) and pull
// reconciler/task (pull) at load time — see e.g. lib/blobStore.ts's registerEntityFlusher/
// registerListReconciler calls. Without importing them here, that registration would only happen
// once something on the current page imports that specific store, so flush()/pullAll() below
// could silently cover fewer entities depending on which page the user opened first.
import '@/lib/blobStore'
import '@/lib/plannedStore'
import '@/lib/activityPhotos'
import '@/lib/questionnaireStore'
import '@/lib/sync/hikeReportStore'
import '@/lib/sync/userSettingsStore'

// Safety net for pulling, same idea as syncEngine's hourly one for pushing — but shorter, since a
// stale read is a worse user-facing surprise than a delayed write.
const PULL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Mounts both the outbox-flush triggers (push local changes to Supabase) and the pull-reconcile
 * triggers (pull other devices' changes back in — see lib/sync/pullEngine.ts) for the whole app
 * session: an immediate run on load, network reconnect, becoming visible/hidden, tab close
 * (best-effort, flush only), periodic safety nets in case none of the above ever fire, and a
 * Supabase Realtime subscription (lib/sync/realtimeSync.ts) that pulls immediately the moment a
 * change actually lands in Supabase, instead of waiting on the periodic safety net.
 */
export default function SyncEngineProvider() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }

    flush()
    pullAll()
    startPeriodicSafetyNet()
    const stopRealtimeSync = startRealtimeSync()
    const pullTimer = setInterval(() => { pullAll() }, PULL_INTERVAL_MS)

    const onOnline     = () => { flush(); pullAll() }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
      else pullAll()
    }
    const onBeforeUnload = () => { flush() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(pullTimer)
      stopRealtimeSync()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  return null
}
