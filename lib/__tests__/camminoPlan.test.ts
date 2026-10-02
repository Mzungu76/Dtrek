import { describe, expect, it } from 'vitest'
import type { CamminoDetail, CamminoTappaDetail } from '@/app/api/cammini/[id]/route'
import {
  assignDates, buildCamminoPlan, camminoPlanToPlannedHike, groupIntoDays, orderForDirection, planTitle,
  selectionPolyline, selectTappe,
} from '../cammini/plan'

// Cammino di prova: 6 tappe lungo un meridiano, da nord a sud, di lunghezze diverse.
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const kms = [12, 18, 25, 30, 14, 20]

function tappa(i: number): CamminoTappaDetail {
  const top = 43 - kms.slice(0, i).reduce((s, k) => s + k, 0) / 111
  const bottom = top - kms[i] / 111
  return {
    ordinal: i + 1, name: `Tappa ${i + 1}`, fromName: names[i], toName: names[i + 1], lengthM: kms[i] * 1000,
    source: 'official', endsAtAnchor: true, elevationGainM: null, elevationLossM: null,
    polyline: [[top, 12], [(top + bottom) / 2, 12], [bottom, 12]],
  }
}

const detail: CamminoDetail = {
  id: 'cam-1', name: 'Cammino di Prova', description: 'Un cammino.', officialUrl: null, region: 'Lazio',
  stats: { lengthM: 119_000, tappeCount: 6, tappeSource: 'official', structure: 'cammino', quality: 'pronto', overviewPolyline: [[43, 12], [42, 12]] },
  tappe: kms.map((_, i) => tappa(i)),
}

describe('selezione e verso', () => {
  it('seleziona le tappe fra due ordinali, in qualunque ordine degli estremi', () => {
    expect(selectTappe(detail.tappe, 2, 4).map(t => t.ordinal)).toEqual([2, 3, 4])
    expect(selectTappe(detail.tappe, 4, 2).map(t => t.ordinal)).toEqual([2, 3, 4])
    expect(selectTappe(detail.tappe, 9, 12)).toEqual([])
  })

  it('verso inverso: tappe in ordine opposto, capi scambiati e linee girate', () => {
    const rev = orderForDirection(selectTappe(detail.tappe, 1, 3), 'reverse')
    expect(rev.map(t => t.ordinal)).toEqual([3, 2, 1])
    expect(rev[0].fromName).toBe('D')
    expect(rev[0].toName).toBe('C')
    expect(rev[0].polyline[0][0]).toBeLessThan(rev[0].polyline[2][0]) // ora va da sud verso nord
    // l'originale non si tocca
    expect(detail.tappe[2].fromName).toBe('C')
  })

  it('la polilinea della selezione è continua, senza punti doppi alle giunzioni', () => {
    const poly = selectionPolyline(detail, { fromOrdinal: 1, toOrdinal: 3, direction: 'forward' })
    expect(poly).toHaveLength(3 + 2 + 2)
    const lats = poly.map(p => p[0])
    expect([...lats].sort((a, b) => b - a)).toEqual(lats)
    const rev = selectionPolyline(detail, { fromOrdinal: 1, toOrdinal: 3, direction: 'reverse' })
    expect(rev[0]).toEqual(poly[poly.length - 1])
  })
})

describe('giornate', () => {
  const t = kms.map((k, i) => ({ ordinal: i + 1, lengthM: k * 1000 }))

  it('una tappa al giorno', () => {
    const days = groupIntoDays(t, { mode: 'one_per_day' })
    expect(days).toHaveLength(6)
    expect(days.map(d => d.tappe)).toEqual([[1], [2], [3], [4], [5], [6]])
  })

  it('accorpa le tappe vicine entro il tetto di km; una tappa più lunga del tetto resta da sola', () => {
    const days = groupIntoDays(t, { mode: 'max_km', maxKm: 32 })
    // 12+18=30 ≤ 32; poi 25, 30 e 14 non stanno insieme a nulla; 14+20=34 > 32.
    expect(days.map(d => d.tappe)).toEqual([[1, 2], [3], [4], [5], [6]])
  })

  it('un tetto più basso della tappa più lunga non spezza la tappa', () => {
    const days = groupIntoDays(t, { mode: 'max_km', maxKm: 10 })
    expect(days).toHaveLength(6)
  })

  it('somma i km della giornata', () => {
    const [d] = groupIntoDays(t, { mode: 'max_km', maxKm: 32 })
    expect(d.lengthM).toBe(30_000)
  })
})

describe('date', () => {
  const days = groupIntoDays([{ ordinal: 1, lengthM: 1 }, { ordinal: 2, lengthM: 1 }, { ordinal: 3, lengthM: 1 }], { mode: 'one_per_day' })
  it('date consecutive anche a cavallo del mese e dell\'anno', () => {
    expect(assignDates(days, '2026-12-30').map(d => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(assignDates(days, '2026-02-27').map(d => d.date)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01'])
  })
  it('senza una data valida nessuna giornata ha una data', () => {
    expect(assignDates(days, undefined).every(d => d.date === undefined)).toBe(true)
    expect(assignDates(days, 'boh').every(d => d.date === undefined)).toBe(true)
  })
})

describe('buildCamminoPlan e Meta salvabile', () => {
  it('costruisce il piano con le tappe nell\'ordine di marcia', () => {
    const plan = buildCamminoPlan(detail, { fromOrdinal: 2, toOrdinal: 5, direction: 'forward', grouping: { mode: 'max_km', maxKm: 45 }, startDate: '2026-06-10' })
    expect(plan.tappe.map(t => t.ordinal)).toEqual([2, 3, 4, 5])
    expect(plan.fromOrdinal).toBe(2)
    expect(plan.toOrdinal).toBe(5)
    expect(plan.days.map(d => d.tappe)).toEqual([[2, 3], [4, 5]])
    expect(plan.days.map(d => d.date)).toEqual(['2026-06-10', '2026-06-11'])
    expect(plan.camminoId).toBe('cam-1')
    expect(plan.structure).toBe('cammino')
  })

  it('rifiuta una selezione vuota', () => {
    expect(() => buildCamminoPlan(detail, { fromOrdinal: 20, toOrdinal: 22, direction: 'forward', grouping: { mode: 'one_per_day' } })).toThrow(/Nessuna tappa/)
  })

  it('la Meta ha tipo cammino, km sommati, nessuna quota inventata e il piano allegato', () => {
    const plan = buildCamminoPlan(detail, { fromOrdinal: 1, toOrdinal: 6, direction: 'forward', grouping: { mode: 'one_per_day' }, startDate: '2026-09-01' })
    const hike = camminoPlanToPlannedHike(detail, plan, '2026-01-01T00:00:00.000Z')
    expect(hike.metaType).toBe('cammino')
    expect(hike.title).toBe('Cammino di Prova')
    expect(hike.distanceMeters).toBe(119_000)
    expect(hike.elevationGain).toBe(0)
    expect(hike.placeId).toBe('cam-1')
    expect(hike.plannedDate).toBe('2026-09-01')
    expect(hike.zone).toBe('Lazio')
    expect(hike.camminoPlan?.days).toHaveLength(6)
    expect(hike.routePolyline!.length).toBeGreaterThan(10)
    expect(hike.estimatedTimeSeconds).toBe(Math.round((119 / 4) * 3600))
    expect(hike.trackPoints).toBeUndefined() // niente traccia GPS: le analisi pesanti non partono
  })

  it('titoli: cammino intero, un tratto, una tappa', () => {
    const whole = buildCamminoPlan(detail, { fromOrdinal: 1, toOrdinal: 6, direction: 'forward', grouping: { mode: 'one_per_day' } })
    const part = buildCamminoPlan(detail, { fromOrdinal: 2, toOrdinal: 4, direction: 'forward', grouping: { mode: 'one_per_day' } })
    const one = buildCamminoPlan(detail, { fromOrdinal: 3, toOrdinal: 3, direction: 'forward', grouping: { mode: 'one_per_day' } })
    expect(planTitle(whole)).toBe('Cammino di Prova')
    expect(planTitle(part)).toBe('Cammino di Prova — B → E')
    expect(planTitle(one)).toBe('Cammino di Prova — tappa 3')
  })

  it('verso inverso: il titolo e la polilinea vanno dall\'altra parte', () => {
    const rev = buildCamminoPlan(detail, { fromOrdinal: 2, toOrdinal: 4, direction: 'reverse', grouping: { mode: 'one_per_day' } })
    expect(planTitle(rev)).toBe('Cammino di Prova — E → B')
    const hike = camminoPlanToPlannedHike(detail, rev)
    expect(hike.routePolyline![0][0]).toBeLessThan(hike.routePolyline![hike.routePolyline!.length - 1][0])
  })
})
