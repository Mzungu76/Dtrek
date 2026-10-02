import { describe, expect, it } from 'vitest'
import { camminoStatsFromMetadata, polylineDistanceKm, rankCammini, type CamminoRow } from '../metaSearch/searchCammini'

// Tracciato N→S lungo il meridiano 12°E, da 43° a 42° di latitudine (~111 km).
const line: [number, number][] = Array.from({ length: 11 }, (_, i) => [43 - i * 0.1, 12])

function row(id: string, name: string, over: Record<string, unknown> = {}, polyline = line): CamminoRow {
  return {
    id, name, description: null, latitude: 42.5, longitude: 12, region: 'Italia', image_url: null, confidence: 0.9,
    metadata: {
      kind: 'cammino', lengthM: 111_000, tappeCount: 5, tappeSource: 'official', overviewPolyline: polyline,
      quality: { status: 'pronto' }, ...over,
    },
  }
}

describe('camminoStatsFromMetadata', () => {
  it('legge le statistiche; senza panoramica o non-cammino è null', () => {
    expect(camminoStatsFromMetadata(row('a', 'A').metadata)).toMatchObject({ lengthM: 111_000, tappeCount: 5, tappeSource: 'official', structure: 'cammino', quality: 'pronto' })
    expect(camminoStatsFromMetadata({ kind: 'cammino' })).toBeNull()
    expect(camminoStatsFromMetadata({ overviewPolyline: line })).toBeNull()
    expect(camminoStatsFromMetadata(null)).toBeNull()
  })
  it('struttura "rete" e qualità da rivedere', () => {
    const s = camminoStatsFromMetadata(row('a', 'A', { structure: 'rete', quality: { status: 'da_rivedere' } }).metadata)
    expect(s?.structure).toBe('rete')
    expect(s?.quality).toBe('da_rivedere')
  })
})

describe('rankCammini', () => {
  it('mostra solo i cammini pronti (salvo includeNotReady)', () => {
    const rows = [row('a', 'Pronto'), row('b', 'Da rivedere', { quality: { status: 'da_rivedere' } })]
    expect(rankCammini(rows, { metaType: 'cammino' }).map(i => i.name)).toEqual(['Pronto'])
    expect(rankCammini(rows, { metaType: 'cammino', includeNotReady: true })).toHaveLength(2)
  })

  it('con un\'origine tiene i cammini il cui TRACCIATO passa vicino, non il loro pin', () => {
    // L'origine è a metà del tracciato, lontana dal pin (42.5) ma sul tracciato (42.5 è a 55 km dall'inizio).
    const origin = { lat: 43.0, lon: 12.0 }
    const far: [number, number][] = [[40, 14], [39.9, 14]]
    const rows = [row('a', 'Vicino'), row('b', 'Lontano', {}, far)]
    const items = rankCammini(rows, { metaType: 'cammino', origin, maxDistanceKm: 30 })
    expect(items.map(i => i.name)).toEqual(['Vicino'])
    expect(items[0].distanceKm).toBeLessThan(1)
  })

  it('ordina per vicinanza; senza origine per affidabilità delle tappe', () => {
    const rows = [
      row('a', 'Calcolato', { tappeSource: 'computed' }),
      row('b', 'Ufficiale', { tappeSource: 'official' }),
    ]
    expect(rankCammini(rows, { metaType: 'cammino' }).map(i => i.name)).toEqual(['Ufficiale', 'Calcolato'])
    const near = row('n', 'Vicino', {}, [[43, 12], [42.9, 12]])
    const farther = row('f', 'Più lontano', {}, [[43.4, 12], [43.3, 12]])
    expect(rankCammini([farther, near], { metaType: 'cammino', origin: { lat: 43, lon: 12 }, maxDistanceKm: 100 }).map(i => i.name)).toEqual(['Vicino', 'Più lontano'])
  })

  it('porta con sé le statistiche e i km come hikeStats', () => {
    const [item] = rankCammini([row('a', 'A')], { metaType: 'cammino' })
    expect(item.metaType).toBe('cammino')
    expect(item.camminoStats?.tappeCount).toBe(5)
    expect(item.hikeStats?.distanceMeters).toBe(111_000)
  })

  it('rispetta il limite', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(String(i), `C${i}`))
    expect(rankCammini(rows, { metaType: 'cammino', limit: 2 })).toHaveLength(2)
  })
})

describe('polylineDistanceKm', () => {
  it('distanza dal vertice più vicino', () => {
    expect(polylineDistanceKm(line, { lat: 43, lon: 12 })).toBeLessThan(0.1)
    expect(polylineDistanceKm(line, { lat: 43, lon: 13 })).toBeGreaterThan(70)
  })
})
