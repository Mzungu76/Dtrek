'use client'

/**
 * Pull-side counterpart to lib/sync/syncEngine.ts's outbox flush. That module only pushes local
 * changes out to Supabase; nothing used to pull changes back in once a list/record was already
 * cached locally (lib/blobStore.ts / lib/plannedStore.ts's reads are cache-first: "if IndexedDB
 * already has it, never ask Supabase again"). That meant a device stayed frozen on whatever it
 * first downloaded, oblivious to edits made from another device, until its local cache was wiped.
 *
 * This module reconciles the local cache against Supabase's updated_at (see
 * supabase/migrations/add_updated_at_tracking.sql) on the same triggers syncEngine already uses
 * for outbox flushing (app open, reconnect, becoming visible, periodic safety net — wired in
 * components/SyncEngineProvider.tsx).
 */

import { lsGet, lsSet, lsDel } from '@/lib/localStore'
import { getPendingRecordIds } from './syncEngine'

export interface DigestRow {
  id: string
  updatedAt: string
}

export interface PullProgress {
  done: number
  total: number
}

interface ListReconcilerConfig<TMeta extends { id: string; updatedAt?: string }, TFull> {
  /** GET endpoint returning DigestRow[] for the current user (?digest=1 on the existing list route). */
  digestUrl: string
  listCacheKey: string
  itemCacheKey: (id: string) => string
  fetchItem: (id: string) => Promise<TFull>
  toMeta: (full: TFull) => TMeta
  /** Matches the ordering the full list endpoint returns, so a reconciled list doesn't reshuffle. */
  sort: (a: TMeta, b: TMeta) => number
  /** entityType usato da questo store nell'outbox (lib/sync/syncEngine.ts) — permette al
   *  reconciler di ignorare qualunque id con una scrittura locale ancora in coda, vedi sotto. */
  entityType: string
}

type Puller = (onProgress?: (p: PullProgress) => void) => Promise<void>

const pullers: Puller[] = []

/**
 * Registers a list-backed entity (activities, planned hikes): compares the cached list against a
 * lightweight server digest ({id, updatedAt}[]) and, for every id that's missing locally or newer
 * on the server, re-fetches just that one full record — never the whole list. Ids present locally
 * but absent from the server digest (deleted from another device) are pruned from the cache too.
 */
export function registerListReconciler<TMeta extends { id: string; updatedAt?: string }, TFull>(
  cfg: ListReconcilerConfig<TMeta, TFull>,
) {
  pullers.push(async (onProgress) => {
    let digest: DigestRow[]
    try {
      const res = await fetch(cfg.digestUrl)
      if (!res.ok) return
      digest = await res.json()
    } catch {
      return
    }

    const localList = (await lsGet<TMeta[]>(cfg.listCacheKey)) ?? []
    const byId = new Map(localList.map((m) => [m.id, m]))
    const serverIds = new Set(digest.map((d) => d.id))
    // Id con una scrittura locale non ancora sincronizzata (es. una cancellazione appena fatta,
    // ancora in coda nell'outbox — vedi lib/plannedStore.ts's deletePlanned/scheduleFlush, debounce
    // di 15s) — l'outbox è l'unica fonte di verità per questi finché non flusha davvero: se questo
    // pull capita nel frattempo, il digest del server è ancora quello VECCHIO (delete non ancora
    // applicata) e senza questo controllo l'id verrebbe trattato come "mancante in locale" e
    // ri-scaricato/ri-aggiunto alla cache, facendo ricomparire un record che l'utente ha già
    // eliminato/modificato.
    const pendingIds = await getPendingRecordIds(cfg.entityType)

    const toFetch = digest.filter((d) => {
      if (pendingIds.has(d.id)) return false
      const local = byId.get(d.id)
      return !local || !local.updatedAt || new Date(d.updatedAt).getTime() > new Date(local.updatedAt).getTime()
    })

    let changed = false
    let done = 0
    onProgress?.({ done, total: toFetch.length })
    for (const { id } of toFetch) {
      try {
        const full = await cfg.fetchItem(id)
        await lsSet(cfg.itemCacheKey(id), full)
        byId.set(id, cfg.toMeta(full))
        changed = true
      } catch {
        // Left stale — retried on the next pull cycle.
      }
      done++
      onProgress?.({ done, total: toFetch.length })
      // Small pacing gap so a big first-time catch-up (many new/changed records) doesn't
      // hammer the API in a tight loop — same spacing the old one-time OfflineSync used.
      if (done < toFetch.length) await new Promise((r) => setTimeout(r, 150))
    }

    for (const id of Array.from(byId.keys())) {
      // Stessa cautela di toFetch sopra, simmetrica: un id con una creazione/modifica ancora in
      // coda nell'outbox può non essere ancora sul server per un motivo del tutto legittimo (non
      // ha fatto in tempo a flushare), non perché sia stato cancellato altrove — non va rimosso
      // dalla cache solo perché manca ancora dal digest.
      if (!serverIds.has(id) && !pendingIds.has(id)) {
        byId.delete(id)
        await lsDel(cfg.itemCacheKey(id))
        changed = true
      }
    }

    if (changed) {
      await lsSet(cfg.listCacheKey, Array.from(byId.values()).sort(cfg.sort))
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
    }
  })
}

/** Registers a simple pull task with no list semantics (e.g. re-fetching the single user_settings
 *  row) — runs alongside the list reconcilers on every pull cycle. */
export function registerPullTask(fn: () => Promise<void>) {
  pullers.push(() => fn())
}

let pulling = false

// Global progress broadcast, independent of which trigger actually called pullAll() (mount,
// reconnect, becoming visible, periodic safety net can all be racing for the same in-flight
// pull — see the `pulling` guard below). components/OfflineSync.tsx subscribes to this instead of
// calling pullAll() itself, so it shows progress for whichever call actually did the work.
type ProgressListener = (p: PullProgress | null) => void
const progressListeners = new Set<ProgressListener>()

/** Subscribes to pull progress across the whole app session. Returns an unsubscribe function. */
export function subscribeProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener)
  return () => { progressListeners.delete(listener) }
}

function notifyProgress(p: PullProgress | null) {
  progressListeners.forEach((l) => l(p))
}

/**
 * Runs every registered puller in turn. Safe to call from multiple triggers (mount, reconnect,
 * becoming visible, periodic safety net) — a pull already in progress is skipped rather than run
 * twice concurrently, mirroring lib/sync/syncEngine.ts's flush().
 */
export async function pullAll(onProgress?: (p: PullProgress) => void): Promise<void> {
  if (pulling) return
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return
  pulling = true
  try {
    let base = 0
    for (const puller of pullers) {
      let lastTotal = 0
      await puller((p) => {
        lastTotal = p.total
        const combined = { done: base + p.done, total: base + p.total }
        onProgress?.(combined)
        notifyProgress(combined)
      }).catch(() => {})
      base += lastTotal
    }
  } finally {
    pulling = false
    notifyProgress(null)
  }
}

/**
 * Stale-while-revalidate for a single record cached by a parent key (hike report / questionnaire
 * per activity): call this fire-and-forget right after a cache-first read returns its local copy.
 * It refreshes the cache in the background — and fires 'cts-updated' so any open view re-renders —
 * only if the server copy is actually newer, so it never overwrites an offline edit still queued
 * in the outbox with an older server version.
 */
export function revalidateInBackground<T extends { updated_at?: string; updatedAt?: string }>(
  cacheKey: string,
  local: T | null,
  fetchFresh: () => Promise<T | null>,
): void {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return
  const localTs = local?.updatedAt ?? local?.updated_at
  fetchFresh().then(async (fresh) => {
    if (!fresh) return
    const freshTs = fresh.updatedAt ?? fresh.updated_at
    if (localTs && freshTs && new Date(freshTs).getTime() <= new Date(localTs).getTime()) return
    await lsSet(cacheKey, fresh)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
  }).catch(() => {})
}

/**
 * Same idea as revalidateInBackground but for a per-activity list with no single updated_at to
 * compare (activity photos) — just diffs the freshly fetched list against the cached one.
 */
export function revalidateListInBackground<T>(
  cacheKey: string,
  local: T[] | null,
  fetchFresh: () => Promise<T[]>,
): void {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return
  fetchFresh().then(async (fresh) => {
    if (JSON.stringify(fresh) === JSON.stringify(local ?? [])) return
    await lsSet(cacheKey, fresh)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
  }).catch(() => {})
}
