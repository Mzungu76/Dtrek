import { describe, it, expect } from 'vitest'
import type { ActivityMeta } from '@/lib/blobStore'
import {
  weekOverWeek, yearProgress, monthChallenge, anniversaries, distanceDistribution, weekdayCounts,
  startHourDistribution, topAltitudes, yearRecords, busiestMonth,
} from '../dashboardStats'

function act(startTime: string, distanceKm: number, elevationGain = 300, altitudeMax = 900, id = startTime): ActivityMeta {
  return { id, title: id, startTime, distanceMeters: distanceKm * 1000, elevationGain, altitudeMax } as ActivityMeta
}

describe('dashboardStats', () => {
  const now = new Date(2026, 8, 30, 12) // mercoledì 30 settembre 2026

  it('confronta la settimana in corso con la stessa finestra della scorsa', () => {
    const acts = [
      act('2026-09-28T08:00:00', 10),  // lunedì di questa settimana
      act('2026-09-21T08:00:00', 7),   // lunedì scorso, dentro la finestra lun-mer
      act('2026-09-26T08:00:00', 20),  // sabato scorso, FUORI dalla finestra
    ]
    const { thisWeek, lastWeek } = weekOverWeek(acts, now)
    expect(thisWeek.km).toBeCloseTo(10)
    expect(lastWeek.km).toBeCloseTo(7)
  })

  it('proietta i chilometri a fine anno solo dopo tre settimane', () => {
    expect(yearProgress([act('2026-01-05T08:00:00', 10)], new Date(2026, 0, 10)).projectedKm).toBeNull()
    const p = yearProgress([act('2026-03-01T08:00:00', 100)], new Date(2026, 6, 2)) // giorno 183
    expect(p.projectedKm).toBeCloseTo((100 / 183) * 365, 0)
  })

  it('la sfida del mese è almeno 2 e supera di uno la media', () => {
    expect(monthChallenge([], now).target).toBe(2)
    const acts = [act('2026-07-05T08:00:00', 5), act('2026-07-12T08:00:00', 5), act('2026-07-19T08:00:00', 5), act('2026-09-03T08:00:00', 5)]
    const c = monthChallenge(acts, now)
    expect(c.target).toBe(4) // 3 uscite in un mese di storico -> media 3, +1
    expect(c.done).toBe(1)
  })

  it('trova gli anniversari entro tre giorni, solo di anni precedenti', () => {
    const a = anniversaries([act('2025-09-28T08:00:00', 8, 300, 900, 'a'), act('2026-09-29T08:00:00', 8, 300, 900, 'b'), act('2025-06-01T08:00:00', 8, 300, 900, 'c')], now)
    expect(a.map((x) => x.activity.id)).toEqual(['a'])
    expect(a[0].yearsAgo).toBe(1)
  })

  it('distribuzioni: distanze, giorni, ore di partenza', () => {
    const acts = [act('2026-09-05T07:30:00', 5), act('2026-09-06T09:00:00', 12), act('2026-09-13T13:00:00', 20)]
    expect(distanceDistribution(acts)).toEqual([1, 1, 1])
    expect(weekdayCounts(acts)).toEqual([0, 0, 0, 0, 0, 1, 2]) // sabato, poi due domeniche
    expect(startHourDistribution(acts)).toEqual([1, 1, 0, 1])
  })

  it('quote e record', () => {
    const acts = [act('2026-01-01T08:00:00', 5, 100, 500, 'x'), act('2026-02-01T08:00:00', 15, 900, 1800, 'y'), act('2025-02-01T08:00:00', 30, 2000, 2500, 'z')]
    expect(topAltitudes(acts, 2).map((a) => a.id)).toEqual(['z', 'y'])
    const r = yearRecords(acts, 2026)
    expect(r.longest?.id).toBe('y')
    expect(r.mostElevation?.id).toBe('y')
    expect(busiestMonth(acts)).toMatchObject({ count: 2 }) // febbraio (2026 e 2025)
  })
})
