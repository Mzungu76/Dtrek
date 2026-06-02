'use client'
import { useEffect, useState } from 'react'
import { lsGet, lsSet, LS_KEYS } from '@/lib/localStore'
import type { ActivityMeta, StoredActivity } from '@/lib/blobStore'
import type { PlannedHikeMeta, PlannedHike } from '@/lib/plannedStore'

const SYNC_DONE_KEY = 'initial-sync-done'
const DELAY_MS      = 250   // delay between individual item fetches

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json() as Promise<T>
}

export default function OfflineSync() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Skip if already done
      const done = await lsGet<boolean>(SYNC_DONE_KEY)
      if (done) return

      try {
        // ── 1. Activities ──────────────────────────────────────────────────
        const list = await apiFetch<ActivityMeta[]>('/api/activities')
        await lsSet(LS_KEYS.activitiesList, list)

        // Find which activity IDs aren't cached yet
        const missing: string[] = []
        for (const a of list) {
          const cached = await lsGet<StoredActivity>(LS_KEYS.activity(a.id))
          if (!cached) missing.push(a.id)
        }

        // ── 2. Planned hikes ───────────────────────────────────────────────
        const planned = await apiFetch<PlannedHikeMeta[]>('/api/planned')
        await lsSet(LS_KEYS.plannedList, planned)

        const missingPlanned: string[] = []
        for (const p of planned) {
          const cached = await lsGet<PlannedHike>(LS_KEYS.planned(p.id))
          if (!cached) missingPlanned.push(p.id)
        }

        const total = missing.length + missingPlanned.length
        if (total === 0) {
          await lsSet(SYNC_DONE_KEY, true)
          return
        }

        let done = 0
        setProgress({ done, total })

        // ── 3. Fetch each missing activity ─────────────────────────────────
        for (const id of missing) {
          if (cancelled) return
          try {
            const act = await apiFetch<StoredActivity>(`/api/activity?id=${encodeURIComponent(id)}`)
            await lsSet(LS_KEYS.activity(id), act)
          } catch { /* skip on error */ }
          done++
          setProgress({ done, total })
          await sleep(DELAY_MS)
        }

        // ── 4. Fetch each missing planned hike ─────────────────────────────
        for (const id of missingPlanned) {
          if (cancelled) return
          try {
            const ph = await apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`)
            await lsSet(LS_KEYS.planned(id), ph)
          } catch { /* skip on error */ }
          done++
          setProgress({ done, total })
          await sleep(DELAY_MS)
        }

        if (!cancelled) {
          await lsSet(SYNC_DONE_KEY, true)
          setProgress(null)
        }
      } catch {
        // Network unavailable — silently abort, will retry next session
        setProgress(null)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  if (!progress) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm select-none pointer-events-none">
      <span className="inline-block w-2 h-2 rounded-full bg-forest-400 animate-pulse" />
      Sync offline: {progress.done}/{progress.total}
    </div>
  )
}
