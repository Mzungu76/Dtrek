'use client'

/**
 * Generic outbox-flush engine shared by every local-first entity store
 * (see lib/sync/userSettingsStore.ts for the first entity wired to it).
 * Each entity registers a flush handler for its own entityType; this
 * module only owns the scheduling (debounce, periodic safety net) and
 * the actual draining loop, grouped by entity so one flush pass can
 * cover several entities' pending changes at once.
 */

import { obGetAll, obGetByEntity, obDelete, obRecordFailure, type OutboxRow } from '@/lib/localStore'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'

export interface FlushResult {
  /** outboxId of every row that was successfully applied server-side and can be removed from the queue. */
  succeededIds: number[]
  /** DTREK-AUDIT.md P1 #15 — messaggio d'errore reale per una riga fallita in questo giro, se il
   *  flusher lo conosce (flushRows sotto lo popola sempre; un flusher che fallisce l'intero
   *  batch, come userSettingsStore.ts, può ometterlo — flush() usa un messaggio generico per le
   *  righe fallite senza un'entry qui). Puramente diagnostico (obRecordFailure/lastError), non
   *  cambia quali righe restano in coda. */
  failures?: { outboxId: number; error: string }[]
}

type FlushHandler = (rows: OutboxRow[]) => Promise<FlushResult>

// DTREK-AUDIT.md P1 #15 — backoff esponenziale (30s, 60s, 120s, ... fino al tetto di 30 min) invece
// di ritentare una riga fallita alla stessa cadenza aggressiva di ogni riga sana (ogni debounce di
// 15s, ogni cambio di visibilità, ogni riconnessione). Oltre MAX_SYNC_ATTEMPTS smette del tutto di
// ritentare in automatico (dead-letter) — la riga resta in coda (mai persa, vedi obRecordFailure)
// ma non viene più proposta a un flusher finché un nuovo edit dell'utente non la resetta (vedi
// RESET_RETRY_STATE in localStore.ts).
const BACKOFF_BASE_MS = 30_000
const BACKOFF_CAP_MS = 30 * 60 * 1000
export const MAX_SYNC_ATTEMPTS = 10

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts), BACKOFF_CAP_MS)
}

/** Pura — se questa riga è idonea a un nuovo tentativo di flush adesso, o va saltata perché in
 *  backoff o dead-lettered (attempts >= MAX_SYNC_ATTEMPTS). */
export function isRowDueForRetry(row: OutboxRow, now: number): boolean {
  if (row.attempts >= MAX_SYNC_ATTEMPTS) return false
  if (!row.lastAttemptAt) return true
  return now - row.lastAttemptAt >= backoffMs(row.attempts)
}

const flushHandlers = new Map<string, FlushHandler>()

export function registerEntityFlusher(entityType: string, handler: FlushHandler) {
  flushHandlers.set(entityType, handler)
}

/**
 * Shared per-row flush loop for entities whose flusher applies each outbox row independently
 * (as opposed to lib/sync/userSettingsStore.ts's flusher, which merges every pending row into a
 * single PATCH instead — genuinely different batching semantics, not covered here): tries
 * `apply` for each row, collects the ids of the ones that succeeded, and leaves the rest pending
 * for the next flush trigger. Every other entity store repeated this exact loop by hand.
 */
export async function flushRows(rows: OutboxRow[], apply: (row: OutboxRow) => Promise<void>): Promise<FlushResult> {
  const succeededIds: number[] = []
  const failures: { outboxId: number; error: string }[] = []
  for (const row of rows) {
    try {
      await apply(row)
      succeededIds.push(row.outboxId!)
    } catch (e) {
      // Leave this row pending — retried on the next flush trigger, subject to the backoff/
      // dead-letter policy in flush() below (DTREK-AUDIT.md P1 #15).
      failures.push({ outboxId: row.outboxId!, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { succeededIds, failures }
}

const DEBOUNCE_MS = 15_000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

/** Call after any local write — batches bursts of edits into one flush ~15s later. */
export function scheduleFlush() {
  if (typeof window === 'undefined') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { flush() }, DEBOUNCE_MS)
}

/**
 * Drains the outbox now. Safe to call from multiple triggers (debounce,
 * reconnect, visibility change, logout, periodic safety net) — a flush
 * already in progress is skipped rather than run twice concurrently.
 */
export async function flush(): Promise<void> {
  if (flushing) return
  // Deliberately NOT gated on navigator.onLine — see lib/sync/pullEngine.ts's pullAll() for why:
  // the flag can false-negative on mobile, silently skipping the flush with no retry until the
  // next trigger. Each handler below already leaves its rows pending on a real network failure.
  flushing = true
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  try {
    const rows = await obGetAll()
    if (rows.length === 0) return

    // Only pay for this once there's actually something to send — see lib/sync/pullEngine.ts's
    // pullAll() for the full reasoning (same race: this can fire immediately on app open/becoming
    // visible, before the Supabase SDK has finished restoring/refreshing an expired session cookie).
    try { await getBrowserSupabase().auth.getSession() } catch {}

    const byEntity = new Map<string, OutboxRow[]>()
    for (const row of rows) {
      const list = byEntity.get(row.entityType) ?? []
      list.push(row)
      byEntity.set(row.entityType, list)
    }

    const now = Date.now()
    for (const [entityType, entityRows] of Array.from(byEntity.entries())) {
      const handler = flushHandlers.get(entityType)
      if (!handler) continue
      // DTREK-AUDIT.md P1 #15 — una riga in backoff (fallita di recente) o dead-lettered (oltre
      // MAX_SYNC_ATTEMPTS) non viene nemmeno proposta al flusher questo giro: non ha senso
      // ritentarla alla stessa cadenza di una riga sana, e un dead-letter deve smettere di
      // consumare rete/CPU a ogni trigger, non solo smettere di avere successo.
      const dueRows = entityRows.filter((row) => isRowDueForRetry(row, now))
      if (dueRows.length === 0) continue
      try {
        const { succeededIds, failures } = await handler(dueRows)
        await Promise.all(succeededIds.map((id) => obDelete(id)))
        const succeededSet = new Set(succeededIds)
        const failureByRowId = new Map((failures ?? []).map((f) => [f.outboxId, f.error]))
        await Promise.all(
          dueRows
            .filter((row) => !succeededSet.has(row.outboxId!))
            .map((row) => obRecordFailure(row.outboxId!, failureByRowId.get(row.outboxId!) ?? 'Sync fallita')),
        )
      } catch (e) {
        // L'intero handler ha lanciato (non solo una riga) — ogni riga proposta questo giro resta
        // pendente, con lo stesso errore registrato per tutte.
        const message = e instanceof Error ? e.message : String(e)
        await Promise.all(dueRows.map((row) => obRecordFailure(row.outboxId!, message)))
      }
    }
  } finally {
    flushing = false
  }
}

export async function hasPendingChanges(): Promise<boolean> {
  const rows = await obGetAll()
  return rows.length > 0
}

/**
 * Record ids con almeno una scrittura non ancora sincronizzata per questo tipo di entità — usata
 * da lib/sync/pullEngine.ts's registerListReconciler per non toccare un record che l'outbox non ha
 * ancora inviato al server. Senza questo controllo, un pull che arriva PRIMA che una cancellazione
 * (o una creazione) in coda venga davvero applicata lato server vedrebbe quel record ancora/non
 * ancora presente sul digest e lo ri-aggiungerebbe/rimuoverebbe dalla cache locale, annullando in
 * apparenza un'azione dell'utente già effettuata (es. un percorso appena eliminato che "ricompare"
 * per qualche secondo se l'app torna in primo piano prima che il flush di 15s sia partito).
 */
export async function getPendingRecordIds(entityType: string): Promise<Set<string>> {
  const rows = await obGetByEntity(entityType)
  return new Set(rows.map((r) => r.recordId))
}

let periodicTimer: ReturnType<typeof setInterval> | null = null

/** Safety net in case none of the event-driven triggers fire (app left open for a long time). */
export function startPeriodicSafetyNet(intervalMs = 60 * 60 * 1000) {
  if (periodicTimer || typeof window === 'undefined') return
  periodicTimer = setInterval(() => { flush() }, intervalMs)
}
