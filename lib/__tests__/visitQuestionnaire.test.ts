import { describe, it, expect } from 'vitest'
import { buildVisitAnchors } from '../visitQuestionnaire'

describe('buildVisitAnchors', () => {
  it('sito: arrivo, il luogo col suo tipo, chiusura — mai vuoto anche senza foto né traccia', () => {
    const a = buildVisitAnchors({ metaType: 'sito', title: 'Castel Sant\'Angelo', siteType: 'castello' })
    expect(a.map(x => x.type)).toEqual(['start', 'poi', 'end'])
    expect(a[1]).toMatchObject({ label: 'Castel Sant\'Angelo', detail: 'Castello' })
  })

  it('borgo senza tappe: solo arrivo e chiusura', () => {
    expect(buildVisitAnchors({ metaType: 'borgo_citta', title: 'Calcata' }).map(x => x.type)).toEqual(['start', 'end'])
  })

  it('borgo con tappe: in ordine di visita, progress crescente tra 0 e 1, anchorRef = id dello stop', () => {
    const a = buildVisitAnchors({
      metaType: 'borgo_citta', title: 'Calcata',
      stops: [{ id: 's1', name: 'Piazza', siteType: 'monumento' }, { id: 's2', name: 'Chiesa', description: 'x'.repeat(300) }],
    })
    expect(a.map(x => x.label)).toEqual(['L\'arrivo nel borgo', 'Piazza', 'Chiesa', 'Prima di andare via'])
    const p = a.map(x => x.progress)
    expect([...p].sort((x, y) => x - y)).toEqual(p)
    expect(a[1].anchorRef).toBe('s1')
    expect(a[2].detail!.length).toBeLessThan(160)
  })

  it('tetto di 6 tappe', () => {
    const stops = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }))
    expect(buildVisitAnchors({ metaType: 'borgo_citta', title: 'X', stops })).toHaveLength(8)
  })
})
