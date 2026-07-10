/**
 * localStore.ts
 * Thin IndexedDB key-value wrapper — browser-only, no-op on SSR.
 *
 * Schema:
 * - object store "kv": records { key: string, v: unknown, ts: number } — local cache of Supabase data.
 * - object store "outbox": pending local writes not yet synced to Supabase (see lib/sync/syncEngine.ts).
 */

export interface OutboxRow {
  outboxId?: number
  entityType: string
  recordId: string
  op: 'upsert' | 'patch' | 'delete'
  payload?: unknown
  clientUpdatedAt: string
  createdAt: number
  attempts: number
  lastError?: string
}

const DB_NAME     = 'dtrek'
const DB_VERSION  = 2
const STORE       = 'kv'
const OUTBOX      = 'outbox'
const OUTBOX_IDX  = 'byEntityRecord'

// Singleton promise — reused across calls
let _dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null)
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const store = db.createObjectStore(OUTBOX, { keyPath: 'outboxId', autoIncrement: true })
        store.createIndex(OUTBOX_IDX, ['entityType', 'recordId'])
        store.createIndex('entityType', 'entityType')
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = () => { _dbPromise = null; resolve(null) }
    req.onblocked = () => { _dbPromise = null; resolve(null) }
  })
  return _dbPromise
}

export async function lsGet<T>(key: string): Promise<T | null> {
  const db = await openDB().catch(() => null)
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result?.v ?? null) as T | null)
      req.onerror   = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function lsSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx  = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, v: value, ts: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

export async function lsDel(key: string): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

/** Wipe the entire local database (e.g. logout / reset) */
export async function lsClearAll(): Promise<void> {
  const db = await openDB().catch(() => null)
  if (db) { db.close() }
  _dbPromise = null
  if (typeof window === 'undefined' || !('indexedDB' in window)) return
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror   = () => resolve()
  })
}

/** Probe for whether the local store is actually usable (private browsing / disabled storage degrade to null). */
export async function isLocalStoreAvailable(): Promise<boolean> {
  return (await openDB().catch(() => null)) !== null
}

// ── Outbox (pending-sync queue) ────────────────────────────────────────────

/**
 * Enqueues a local change for later sync to Supabase, coalescing with any
 * pending row for the same (entityType, recordId) instead of piling up one
 * row per edit:
 * - 'delete' supersedes any pending upsert/patch for that record.
 * - a new 'upsert' after a pending 'delete' replaces it (record recreated).
 * - 'patch' merges its payload into an existing pending patch/upsert.
 */
export async function obEnqueue(entityType: string, recordId: string, op: OutboxRow['op'], payload?: unknown): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) return
  const now = new Date().toISOString()
  return new Promise((resolve) => {
    try {
      const tx    = db.transaction(OUTBOX, 'readwrite')
      const store = tx.objectStore(OUTBOX)
      const idx   = store.index(OUTBOX_IDX)
      const req   = idx.get([entityType, recordId])
      req.onsuccess = () => {
        const existing = req.result as OutboxRow | undefined
        if (!existing) {
          store.add({ entityType, recordId, op, payload, clientUpdatedAt: now, createdAt: Date.now(), attempts: 0 } as OutboxRow)
        } else if (op === 'delete') {
          store.put({ ...existing, op: 'delete', payload: undefined, clientUpdatedAt: now })
        } else if (existing.op === 'delete') {
          store.put({ ...existing, op, payload, clientUpdatedAt: now })
        } else if (op === 'patch' && existing.op !== 'upsert') {
          const mergedPayload = { ...(existing.payload as object ?? {}), ...(payload as object ?? {}) }
          store.put({ ...existing, op: 'patch', payload: mergedPayload, clientUpdatedAt: now })
        } else {
          // op === 'upsert', or merging into an existing 'upsert' — replace payload wholesale
          const mergedPayload = existing.op === 'upsert' ? { ...(existing.payload as object ?? {}), ...(payload as object ?? {}) } : payload
          store.put({ ...existing, op, payload: mergedPayload, clientUpdatedAt: now })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

export async function obGetAll(): Promise<OutboxRow[]> {
  const db = await openDB().catch(() => null)
  if (!db) return []
  return new Promise((resolve) => {
    try {
      const req = db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll()
      req.onsuccess = () => resolve((req.result ?? []) as OutboxRow[])
      req.onerror   = () => resolve([])
    } catch { resolve([]) }
  })
}

export async function obGetByEntity(entityType: string): Promise<OutboxRow[]> {
  const db = await openDB().catch(() => null)
  if (!db) return []
  return new Promise((resolve) => {
    try {
      const req = db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).index('entityType').getAll(entityType)
      req.onsuccess = () => resolve((req.result ?? []) as OutboxRow[])
      req.onerror   = () => resolve([])
    } catch { resolve([]) }
  })
}

export async function obDelete(outboxId: number): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OUTBOX, 'readwrite')
      tx.objectStore(OUTBOX).delete(outboxId)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

// ── Typed key constants ───────────────────────────────────────────────────────

export const LS_KEYS = {
  activitiesList:  'activities-list',
  activity:        (id: string) => `activity:${id}`,
  plannedList:     'planned-list',
  planned:         (id: string) => `planned:${id}`,
  userSettings:    'user-settings',
  lastSync:        (entity: string) => `last-sync:${entity}`,
} as const
