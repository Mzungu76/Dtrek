import { describe, expect, it } from 'vitest'
import { aggregateDiaries, type DiaryRow, type PlannedDiaryLinkRow, type ActivityMetricsRow } from '../aggregateDiaries'

function diario(overrides: Partial<DiaryRow> & { id: string }): DiaryRow {
  return {
    title: 'Diario', subtitle: '', author: '', cover_url: null, footer_text: '',
    is_default: false, labels: [], archived_at: null,
    ...overrides,
  }
}

describe('aggregateDiaries', () => {
  it('un Diario senza Mete e senza attività resta a zero, senza errori', () => {
    const risultato = aggregateDiaries([diario({ id: 'd1', is_default: true })], [], [])
    expect(risultato).toEqual([{
      id: 'd1', title: 'Diario', subtitle: '', author: '', coverUrl: null, footerText: '',
      isDefault: true, reportageCount: 0, pubblicabile: false,
      distanceMeters: 0, elevationGain: 0, lastActivityAt: null, labels: [], archivedAt: null,
    }])
  })

  it('somma distanza e dislivello dei Reportage collegati tramite la Meta, non conta le Mete senza uscita', () => {
    const diaries: DiaryRow[] = [diario({ id: 'd1' })]
    const planned: PlannedDiaryLinkRow[] = [
      { id: 'p1', diary_id: 'd1' },
      { id: 'p2', diary_id: 'd1' }, // mai camminata: nessuna activity la referenzia
    ]
    const activities: ActivityMetricsRow[] = [
      { linked_planned_id: 'p1', distance_meters: 10_000, elevation_gain: 400, start_time: '2026-06-01T08:00:00Z' },
      { linked_planned_id: 'p1', distance_meters: 5_000, elevation_gain: 100, start_time: '2026-08-15T08:00:00Z' },
    ]
    const [risultato] = aggregateDiaries(diaries, planned, activities)
    expect(risultato.reportageCount).toBe(2)
    expect(risultato.distanceMeters).toBe(15_000)
    expect(risultato.elevationGain).toBe(500)
    expect(risultato.pubblicabile).toBe(true)
  })

  it('lastActivityAt è la più recente, non l\'ultima nell\'ordine di arrivo', () => {
    const diaries: DiaryRow[] = [diario({ id: 'd1' })]
    const planned: PlannedDiaryLinkRow[] = [{ id: 'p1', diary_id: 'd1' }]
    const activities: ActivityMetricsRow[] = [
      { linked_planned_id: 'p1', distance_meters: 1, elevation_gain: 1, start_time: '2026-08-15T08:00:00Z' },
      { linked_planned_id: 'p1', distance_meters: 1, elevation_gain: 1, start_time: '2026-06-01T08:00:00Z' },
    ]
    const [risultato] = aggregateDiaries(diaries, planned, activities)
    expect(risultato.lastActivityAt).toBe('2026-08-15T08:00:00Z')
  })

  it('un\'activity la cui Meta non appartiene a nessun Diario (diary_id null) non viene contata su nessuno', () => {
    const diaries: DiaryRow[] = [diario({ id: 'd1' })]
    const planned: PlannedDiaryLinkRow[] = [{ id: 'p1', diary_id: null }]
    const activities: ActivityMetricsRow[] = [
      { linked_planned_id: 'p1', distance_meters: 1000, elevation_gain: 50, start_time: '2026-06-01T08:00:00Z' },
    ]
    const [risultato] = aggregateDiaries(diaries, planned, activities)
    expect(risultato.reportageCount).toBe(0)
    expect(risultato.distanceMeters).toBe(0)
  })

  it('riporta labels e archivedAt così come arrivano dalla riga, labels null diventa array vuoto', () => {
    const [risultato] = aggregateDiaries(
      [diario({ id: 'd1', labels: null, archived_at: '2026-01-01T00:00:00Z' })], [], [],
    )
    expect(risultato.labels).toEqual([])
    expect(risultato.archivedAt).toBe('2026-01-01T00:00:00Z')

    const [conEtichette] = aggregateDiaries(
      [diario({ id: 'd2', labels: ['Natura', 'Urbano'] })], [], [],
    )
    expect(conEtichette.labels).toEqual(['Natura', 'Urbano'])
    expect(conEtichette.archivedAt).toBeNull()
  })
})
