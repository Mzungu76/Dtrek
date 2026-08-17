// DTREK-AUDIT.md P0 #5 — copertura della logica di quorum pura (summarizeClosureReports), non
// del wrapper I/O fetchClosureSummary (nessuna infrastruttura di mock Supabase in questo repo,
// stesso limite già documentato per completionsSummary.ts).
import { describe, it, expect } from 'vitest'
import { summarizeClosureReports, type ClosureReportRow } from '../closureSummary'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-17T12:00:00Z')

function row(overrides: Partial<ClosureReportRow> & { daysAgo: number }): ClosureReportRow {
  const { daysAgo, ...rest } = overrides
  return {
    user_id: 'user-a',
    status: 'closed',
    reason: null,
    created_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    ...rest,
  }
}

describe('summarizeClosureReports — nessun dato', () => {
  it('nessun report nella finestra → unknown, mai "open" per assenza di dati', () => {
    const result = summarizeClosureReports([], NOW)
    expect(result).toEqual({ status: 'unknown', reporterCount: 0, lastReportAt: null, reason: null })
  })
})

describe('summarizeClosureReports — direzione del report più recente', () => {
  it('il report più recente è "reopened" → open, nessun avviso', () => {
    const rows = [
      row({ daysAgo: 10, status: 'closed', user_id: 'a' }),
      row({ daysAgo: 1, status: 'reopened', user_id: 'b' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('open')
    expect(result.reporterCount).toBe(0)
  })

  it('un solo report "closed" → reported (non confermato), reporterCount 1', () => {
    const rows = [row({ daysAgo: 2, status: 'closed', user_id: 'a', reason: 'frana sul tratto alto' })]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('reported')
    expect(result.reporterCount).toBe(1)
    expect(result.reason).toBe('frana sul tratto alto')
  })

  it('due utenti distinti segnalano "closed" → confirmed', () => {
    const rows = [
      row({ daysAgo: 5, status: 'closed', user_id: 'a' }),
      row({ daysAgo: 2, status: 'closed', user_id: 'b' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('confirmed')
    expect(result.reporterCount).toBe(2)
  })

  it('lo stesso utente che segnala due volte non conta due volte verso il quorum', () => {
    const rows = [
      row({ daysAgo: 5, status: 'closed', user_id: 'a' }),
      row({ daysAgo: 2, status: 'closed', user_id: 'a' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('reported')
    expect(result.reporterCount).toBe(1)
  })
})

describe('summarizeClosureReports — uno "reopened" interrompe lo streak', () => {
  it('i report "closed" precedenti a un "reopened" più vecchio non contano più verso il quorum corrente', () => {
    const rows = [
      // Streak di chiusura vecchio, con 2 segnalatori distinti — ma poi riaperto.
      row({ daysAgo: 20, status: 'closed', user_id: 'a' }),
      row({ daysAgo: 15, status: 'closed', user_id: 'b' }),
      row({ daysAgo: 10, status: 'reopened', user_id: 'c' }),
      // Nuovo streak di chiusura, un solo segnalatore finora.
      row({ daysAgo: 3, status: 'closed', user_id: 'd' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('reported')
    expect(result.reporterCount).toBe(1)
  })
})

describe('summarizeClosureReports — finestra temporale di 120 giorni', () => {
  it('ignora report più vecchi di 120 giorni', () => {
    const rows = [row({ daysAgo: 121, status: 'closed', user_id: 'a' })]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('unknown')
  })

  it('un report esattamente dentro la finestra (119 giorni) resta valido', () => {
    const rows = [row({ daysAgo: 119, status: 'closed', user_id: 'a' })]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.status).toBe('reported')
  })
})

describe('summarizeClosureReports — motivo riportato', () => {
  it('usa il motivo del report più recente non vuoto nello streak corrente', () => {
    const rows = [
      row({ daysAgo: 5, status: 'closed', user_id: 'a', reason: 'motivo vecchio' }),
      row({ daysAgo: 2, status: 'closed', user_id: 'b', reason: null }),
      row({ daysAgo: 1, status: 'closed', user_id: 'c', reason: 'motivo più recente' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.reason).toBe('motivo più recente')
  })

  it('lastReportAt è sempre il report più recente nella finestra, indipendentemente dal motivo', () => {
    const rows = [
      row({ daysAgo: 5, status: 'closed', user_id: 'a' }),
      row({ daysAgo: 1, status: 'closed', user_id: 'b' }),
    ]
    const result = summarizeClosureReports(rows, NOW)
    expect(result.lastReportAt).toBe(new Date(NOW - 1 * DAY_MS).toISOString())
  })
})
