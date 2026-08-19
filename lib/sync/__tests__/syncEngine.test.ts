import { describe, it, expect } from 'vitest'
import { backoffMs, isRowDueForRetry, flushRows, MAX_SYNC_ATTEMPTS } from '@/lib/sync/syncEngine'
import type { OutboxRow } from '@/lib/localStore'

// DTREK-AUDIT.md P1 #15 — l'outbox di sync ritentava una riga fallita alla stessa cadenza
// aggressiva di ogni riga sana (ogni debounce di 15s, ogni cambio di visibilità, ogni
// riconnessione), per sempre, senza mai smettere né segnalare che qualcosa è bloccato
// (attempts/lastError erano nello schema ma mai scritti). Questi test coprono la policy pura di
// backoff/dead-letter (backoffMs, isRowDueForRetry) e la cattura degli errori reali in flushRows.

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    outboxId: 1, entityType: 'test', recordId: 'r1', op: 'patch',
    clientUpdatedAt: new Date().toISOString(), createdAt: Date.now(), attempts: 0,
    ...overrides,
  }
}

describe('backoffMs', () => {
  it('cresce esponenzialmente con gli attempts', () => {
    expect(backoffMs(0)).toBe(30_000)
    expect(backoffMs(1)).toBe(60_000)
    expect(backoffMs(2)).toBe(120_000)
    expect(backoffMs(3)).toBe(240_000)
  })

  it('è limitato a un tetto (30 minuti) invece di crescere senza limite', () => {
    expect(backoffMs(10)).toBe(30 * 60 * 1000)
    expect(backoffMs(50)).toBe(30 * 60 * 1000)
  })
})

describe('isRowDueForRetry', () => {
  const now = 1_000_000_000

  it('una riga mai tentata è sempre idonea', () => {
    expect(isRowDueForRetry(row({ attempts: 0, lastAttemptAt: undefined }), now)).toBe(true)
  })

  it('una riga fallita di recente è in backoff, non idonea', () => {
    expect(isRowDueForRetry(row({ attempts: 1, lastAttemptAt: now - 10_000 }), now)).toBe(false) // backoff(1)=60s
  })

  it('una riga fallita abbastanza tempo fa torna idonea', () => {
    expect(isRowDueForRetry(row({ attempts: 1, lastAttemptAt: now - 60_000 }), now)).toBe(true)
  })

  it('una riga oltre MAX_SYNC_ATTEMPTS è dead-lettered, mai idonea anche se il backoff sarebbe scaduto', () => {
    const dead = row({ attempts: MAX_SYNC_ATTEMPTS, lastAttemptAt: now - 24 * 60 * 60 * 1000 })
    expect(isRowDueForRetry(dead, now)).toBe(false)
  })
})

describe('flushRows', () => {
  it('cattura il messaggio di errore reale per ogni riga fallita', async () => {
    const rows = [row({ outboxId: 1 }), row({ outboxId: 2 }), row({ outboxId: 3 })]
    const result = await flushRows(rows, async (r) => {
      if (r.outboxId === 2) throw new Error('errore specifico riga 2')
      if (r.outboxId === 3) throw new Error('errore specifico riga 3')
    })
    expect(result.succeededIds).toEqual([1])
    expect(result.failures).toEqual([
      { outboxId: 2, error: 'errore specifico riga 2' },
      { outboxId: 3, error: 'errore specifico riga 3' },
    ])
  })

  it('non fabbrica un errore leggibile da un valore non-Error lanciato', async () => {
    const result = await flushRows([row({ outboxId: 1 })], async () => { throw 'stringa grezza' })
    expect(result.failures).toEqual([{ outboxId: 1, error: 'stringa grezza' }])
  })

  it('tutte le righe riuscite quando apply non lancia mai', async () => {
    const rows = [row({ outboxId: 1 }), row({ outboxId: 2 })]
    const result = await flushRows(rows, async () => {})
    expect(result.succeededIds).toEqual([1, 2])
    expect(result.failures).toEqual([])
  })
})
