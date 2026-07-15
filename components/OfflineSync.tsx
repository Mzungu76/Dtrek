'use client'
import { useEffect, useState } from 'react'
import { subscribeProgress, type PullProgress } from '@/lib/sync/pullEngine'

/**
 * Shows a small progress pill while lib/sync/pullEngine.ts is downloading new/changed records
 * (first open on a device, or catching up after a big change elsewhere). It only subscribes to
 * the global progress broadcast rather than triggering a pull itself — components/
 * SyncEngineProvider.tsx owns when pulls actually run (mount, reconnect, becoming visible,
 * periodic), so this stays accurate no matter which of those triggers is the one doing the work.
 */
export default function OfflineSync() {
  const [progress, setProgress] = useState<PullProgress | null>(null)

  useEffect(() => subscribeProgress(setProgress), [])

  if (!progress || progress.total === 0 || progress.done >= progress.total) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm select-none pointer-events-none">
      <span className="inline-block w-2 h-2 rounded-full bg-forest-400 animate-pulse" />
      Sincronizzazione: {progress.done}/{progress.total}
    </div>
  )
}
