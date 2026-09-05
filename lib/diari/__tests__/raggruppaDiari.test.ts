import { describe, expect, it } from 'vitest'
import { raggruppaDiari } from '../raggruppaDiari'
import type { DiarySummary } from '../aggregateDiaries'

const OGGI = new Date('2026-09-05T12:00:00Z')

function d(overrides: Partial<DiarySummary> & { id: string }): DiarySummary {
  return {
    title: overrides.id, subtitle: '', author: '', coverUrl: null, footerText: '',
    isDefault: false, reportageCount: 0, pubblicabile: false,
    distanceMeters: 0, elevationGain: 0, lastActivityAt: null, labels: [], archivedAt: null,
    ...overrides,
  }
}

describe('raggruppaDiari', () => {
  it('un solo Diario nuovo, senza uscite: un unico gruppo "stagione corrente" — niente fold per un account appena creato', () => {
    const gruppi = raggruppaDiari([d({ id: 'default', isDefault: true })], OGGI)
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0]).toMatchObject({ tipo: 'stagione_corrente', etichetta: 'Stagione 2026' })
    expect(gruppi[0].diari.map(x => x.id)).toEqual(['default'])
  })

  it('un Diario senza nessuna uscita finisce nella stagione corrente, non in un anno inventato', () => {
    const gruppi = raggruppaDiari([d({ id: 'nuovo', lastActivityAt: null })], OGGI)
    expect(gruppi[0].tipo).toBe('stagione_corrente')
  })

  it('separa stagione corrente, stagioni passate (una per anno, più recente prima) e archivio', () => {
    const diari = [
      d({ id: 'estate2026', lastActivityAt: '2026-08-29T10:00:00Z' }),
      d({ id: 'crinale2025', lastActivityAt: '2025-07-01T10:00:00Z' }),
      d({ id: 'primi2024', lastActivityAt: '2024-05-01T10:00:00Z' }),
      d({ id: 'chiuso', lastActivityAt: '2023-01-01T10:00:00Z', archivedAt: '2026-01-01T00:00:00Z' }),
    ]
    const gruppi = raggruppaDiari(diari, OGGI)
    expect(gruppi.map(g => g.chiave)).toEqual(['2026', '2025', '2024', 'archivio'])
    expect(gruppi[0].diari.map(x => x.id)).toEqual(['estate2026'])
    expect(gruppi[3].diari.map(x => x.id)).toEqual(['chiuso'])
  })

  it('un Diario archiviato non appare mai nel suo gruppo-anno, anche con un\'uscita recente', () => {
    const gruppi = raggruppaDiari(
      [d({ id: 'archiviato-ma-attivo', lastActivityAt: '2026-08-01T00:00:00Z', archivedAt: '2026-08-02T00:00:00Z' })],
      OGGI,
    )
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].tipo).toBe('archivio')
  })

  it('più Diari nello stesso anno passato condividono un solo gruppo, ordinati per uscita più recente', () => {
    const diari = [
      d({ id: 'a', lastActivityAt: '2025-03-01T00:00:00Z' }),
      d({ id: 'b', lastActivityAt: '2025-11-01T00:00:00Z' }),
    ]
    const gruppi = raggruppaDiari(diari, OGGI)
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].diari.map(x => x.id)).toEqual(['b', 'a'])
  })

  it('nessun gruppo vuoto viene emesso', () => {
    const gruppi = raggruppaDiari([], OGGI)
    expect(gruppi).toEqual([])
  })
})
