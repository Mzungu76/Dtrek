import { describe, expect, it } from 'vitest'
import { orientSequence, resolveTappaLine } from '../cammini/import-tracks'
import { WAVES } from '../cammini/tracks'
import type { LatLon } from '../../../lib/cammini/geometry'

describe('import-tracks', () => {
  it('gira le tappe registrate al contrario lungo la sequenza (anche la prima)', () => {
    const t = [
      { polyline: [[0, 0.02], [0, 0.01]] as LatLon[] }, // andata invertita
      { polyline: [[0, 0.03], [0, 0.02]] as LatLon[] },
      { polyline: [[0, 0.03], [0, 0.04]] as LatLon[] },
    ]
    orientSequence(t)
    expect(t[0].polyline[0]).toEqual([0, 0.01])
    expect(t[1].polyline[0]).toEqual([0, 0.02])
    expect(t[2].polyline[0]).toEqual([0, 0.03])
  })
  it('seleziona la traccia per nome, per indice, e rifiuta le ambiguità', () => {
    const tracks = [{ name: 'A 01', segments: [[[0, 0], [0, 1]] as LatLon[]] }, { name: 'A 02', segments: [[[1, 0], [1, 1]] as LatLon[]] }]
    expect(resolveTappaLine(tracks, { file: 'f', track: '^A 02' })[0]).toEqual([1, 0])
    expect(resolveTappaLine(tracks, { file: 'f', track: '#0' })[0]).toEqual([0, 0])
    expect(() => resolveTappaLine(tracks, { file: 'f', track: '^A' })).toThrow(/attesa una/)
    expect(() => resolveTappaLine(tracks, { file: 'f', track: 'zzz' })).toThrow(/Nessuna traccia/)
  })
  it('manifest: id unici e senza tappe duplicate nei percorsi principali', () => {
    const ids = Object.values(WAVES).flat().map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of Object.values(WAVES).flat()) {
      if (c.structure !== 'cammino') continue
      const keys = c.tappe.map(t => `${t.file}|${t.track ?? ''}`)
      if (c.id.includes('florensi')) continue
      expect(new Set(keys).size, c.id).toBe(keys.length)
    }
  })
})
