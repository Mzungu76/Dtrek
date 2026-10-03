import { describe, expect, it } from 'vitest'
import { orientSequence, overviewParts, resolveTappaLine } from '../cammini/import-tracks'
import { WAVES } from '../cammini/tracks'
import { CATALOGO, MINISTERO_MAP, officialUrlFor } from '../cammini/tracks/ministero'
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

describe('overviewParts', () => {
  const seg = (a: number, b: number): LatLon[] => [[0, a], [0, b]]
  const tappa = (a: number, b: number) => ({ polyline: seg(a, b) }) as never
  it('unisce le tappe collegate e stacca i pezzi separati', () => {
    const parts = overviewParts({ spec: { structure: 'cammino' } as never, tappe: [tappa(0, 0.01), tappa(0.01, 0.02), tappa(0.5, 0.51)] })
    expect(parts).toHaveLength(2)
    expect(parts[0][parts[0].length - 1]).toEqual([0, 0.02])
  })
  it('in una rete ogni variante scollegata (oltre 300 m) è un pezzo a sé', () => {
    const parts = overviewParts({ spec: { structure: 'rete' } as never, tappe: [tappa(0, 0.01), tappa(0.015, 0.02)] })
    expect(parts).toHaveLength(2)
  })
})

describe('catalogo ministero', () => {
  const ids = Object.values(WAVES).flat().map(c => c.id)
  it('ogni cammino importato è mappato (o esplicitamente non ancora nel catalogo ricevuto)', () => {
    for (const id of ids) expect(Object.keys(MINISTERO_MAP), id).toContain(id)
    for (const id of Object.keys(MINISTERO_MAP)) expect(ids, `${id} non è nei manifest`).toContain(id)
  })
  it('i nomi mappati esistono nel catalogo e danno un URL valido', () => {
    for (const [id, name] of Object.entries(MINISTERO_MAP)) {
      if (!name) continue
      expect(CATALOGO.some(c => c.name === name), `${id} → ${name}`).toBe(true)
      const u = officialUrlFor(id)
      if (u) expect(u, id).toMatch(/^https?:\/\//)
    }
  })
  it('scarta i segnaposto che rimandano al catalogo del ministero', () => {
    expect(officialUrlFor('cammino-dei-francescani-abruzzo')).toBeNull()
    expect(officialUrlFor('percorso-santa-spina')).toBeNull()
  })
  it("corregge i link malformati del catalogo (Acqua, Sette Sorelle)", () => {
    expect(officialUrlFor('cammino-dellacqua')).toBe('https://www.camminodellacqua.org/')
    expect(officialUrlFor('cammino-delle-sette-sorelle')).toBe('http://www.camminodellesettesorelle.it/')
  })
})
