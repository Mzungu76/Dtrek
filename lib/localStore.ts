/**
 * localStore.ts
 * Thin IndexedDB key-value wrapper — browser-only, no-op on SSR.
 *
 * Schema: one object store "kv" with records { key: string, v: unknown, ts: number }
 * All activity / planned-hike data is stored here as a local cache of Supabase.
 */

const DB_NAME    = 'dtrek'
const DB_VERSION = 1
const STORE      = 'kv'

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

// ── Typed key constants ───────────────────────────────────────────────────────

export const LS_KEYS = {
  activitiesList:  'activities-list',
  activity:        (id: string) => `activity:${id}`,
  plannedList:     'planned-list',
  planned:         (id: string) => `planned:${id}`,
  lastSync:        (entity: string) => `last-sync:${entity}`,
} as const
