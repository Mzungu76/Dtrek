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
  // DTREK-AUDIT.md P1 #15 — timestamp dell'ultimo tentativo di flush fallito, in millisecondi
  // epoch. undefined = mai tentato ancora (sempre idoneo a un tentativo immediato). Insieme ad
  // `attempts`, permette a lib/sync/syncEngine.ts di applicare un backoff esponenziale invece di
  // ritentare alla stessa cadenza aggressiva di ogni riga sana.
  lastAttemptAt?: number
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

// DTREK-AUDIT.md P1 #15 — un nuovo edit dell'utente su un record che ha già righe pendenti in
// coda merita un tentativo di sync fresco, non l'eredità del backoff/dead-letter di un tentativo
// fallito precedente: senza questo reset, un record che ha appena superato la soglia di
// dead-letter (vedi MAX_SYNC_ATTEMPTS in syncEngine.ts) resterebbe bloccato anche dopo che
// l'utente lo ha corretto.
const RESET_RETRY_STATE = { attempts: 0, lastError: undefined, lastAttemptAt: undefined }

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
          store.put({ ...existing, op: 'delete', payload: undefined, clientUpdatedAt: now, ...RESET_RETRY_STATE })
        } else if (existing.op === 'delete') {
          store.put({ ...existing, op, payload, clientUpdatedAt: now, ...RESET_RETRY_STATE })
        } else if (existing.op === 'upsert') {
          // A pending 'upsert' may not have reached the server yet — any further patch/upsert on
          // the same record must stay 'upsert' (never downgrade to 'patch'), otherwise the flush
          // would PATCH a row that doesn't exist server-side yet and silently do nothing, losing
          // the record entirely instead of just losing the latest edit.
          const mergedPayload = { ...(existing.payload as object ?? {}), ...(payload as object ?? {}) }
          store.put({ ...existing, op: 'upsert', payload: mergedPayload, clientUpdatedAt: now, ...RESET_RETRY_STATE })
        } else {
          // existing.op === 'patch': an incoming 'upsert' supersedes it with the full record;
          // an incoming 'patch' merges into the accumulated partial payload.
          const mergedPayload = op === 'upsert' ? payload : { ...(existing.payload as object ?? {}), ...(payload as object ?? {}) }
          store.put({ ...existing, op, payload: mergedPayload, clientUpdatedAt: now, ...RESET_RETRY_STATE })
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

/**
 * DTREK-AUDIT.md P1 #15 — registra un tentativo di flush fallito su una riga: incrementa
 * `attempts`, salva `lastError` e `lastAttemptAt`. Mai chiamata su una riga già rimossa (una riga
 * cancellata nel frattempo da un'altra tab/flush concorrente fa silenziosamente nulla, stesso
 * comportamento tollerante di ogni altra funzione qui). Non cancella mai la riga — un dead-letter
 * qui significa "smetti di ritentare in automatico", mai "perdi il dato": vedi isRowDueForRetry
 * in lib/sync/syncEngine.ts per dove la soglia viene applicata.
 */
export async function obRecordFailure(outboxId: number, error: string): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx    = db.transaction(OUTBOX, 'readwrite')
      const store = tx.objectStore(OUTBOX)
      const req   = store.get(outboxId)
      req.onsuccess = () => {
        const existing = req.result as OutboxRow | undefined
        if (!existing) return
        store.put({ ...existing, attempts: existing.attempts + 1, lastError: error, lastAttemptAt: Date.now() })
      }
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
  report:          (activityId: string) => `report:${activityId}`,
  questionnaire:   (activityId: string) => `questionnaire:${activityId}`,
  activityPhotos:  (activityId: string) => `activity-photos:${activityId}`,
  lastSync:        (entity: string) => `last-sync:${entity}`,
  // Dati geografici (Overpass) di una guida — vedi lib/routeBuilder/geoInfoCache.ts. Cache locale al
  // dispositivo, non sincronizzata: rifare la stessa chiamata Overpass a ogni visione della stessa
  // guida (frequente, es. durante la pianificazione di un'uscita) è un carico evitabile su un
  // servizio pubblico condiviso — vedi il commento in geoInfoCache.ts.
  startPointInfo:      (hikeId: string) => `start-point-info:${hikeId}`,
  returnOptions:       (hikeId: string) => `return-options:${hikeId}`,
  streetViewCoverage:  (hikeId: string) => `street-view-coverage:${hikeId}`,
} as const
