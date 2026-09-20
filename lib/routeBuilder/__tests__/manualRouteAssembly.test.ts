import { describe, it, expect } from 'vitest'
import {
  tryAddSegment, splitPolylineAtJunctions, assembleRoutePoints, nearestRouteVertexDistance,
} from '@/lib/routeBuilder/manualRouteAssembly'

// 0.001° di latitudine ≈ 111m — usato per costruire punti a distanze note e restare ben sopra/sotto
// la tolleranza di default (50m) senza dipendere dai suoi valori esatti dentro ogni test.
const D = 0.001

describe('tryAddSegment', () => {
  it('accetta qualunque primo tratto quando il percorso è vuoto', () => {
    const seg: [number, number][] = [[0, 0], [D, 0]]
    const result = tryAddSegment([], seg)
    expect(result.ok).toBe(true)
    expect(result.orientedPoints).toEqual(seg)
  })

  it('accoda (attachedAt end) un tratto che tocca la fine del percorso, senza invertirlo', () => {
    const route: [number, number][] = [[0, 0], [D, 0]]
    const seg: [number, number][] = [[D, 0], [2 * D, 0]]
    const result = tryAddSegment(route, seg)
    expect(result.ok).toBe(true)
    expect(result.attachedAt).toBe('end')
    expect(result.orientedPoints).toEqual(seg)
  })

  it('accoda invertendo il tratto quando è il suo estremo finale a toccare la fine del percorso', () => {
    const route: [number, number][] = [[0, 0], [D, 0]]
    const seg: [number, number][] = [[2 * D, 0], [D, 0]]
    const result = tryAddSegment(route, seg)
    expect(result.ok).toBe(true)
    expect(result.attachedAt).toBe('end')
    expect(result.orientedPoints).toEqual([[D, 0], [2 * D, 0]])
  })

  it('prepone (attachedAt start) un tratto che tocca l\'inizio del percorso', () => {
    const route: [number, number][] = [[D, 0], [2 * D, 0]]
    const seg: [number, number][] = [[0, 0], [D, 0]]
    const result = tryAddSegment(route, seg)
    expect(result.ok).toBe(true)
    expect(result.attachedAt).toBe('start')
    expect(result.orientedPoints).toEqual(seg)
  })

  it('rifiuta un tratto che non tocca né l\'inizio né la fine del percorso', () => {
    const route: [number, number][] = [[0, 0], [D, 0]]
    const seg: [number, number][] = [[10 * D, 0], [11 * D, 0]]
    const result = tryAddSegment(route, seg)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/non tocca/)
    expect(result.orientedPoints).toBeUndefined()
  })

  it('tollera un piccolo scarto di campionamento (entro la tolleranza di default)', () => {
    const route: [number, number][] = [[0, 0], [D, 0]]
    // ~11m di scarto rispetto a [D, 0] — ben entro i 50m di tolleranza di default.
    const seg: [number, number][] = [[D + D / 10, 0.00001], [2 * D, 0]]
    const result = tryAddSegment(route, seg)
    expect(result.ok).toBe(true)
  })
})

describe('assembleRoutePoints', () => {
  it('concatena più parti scartando il punto di contatto duplicato', () => {
    const parts: [number, number][][] = [
      [[0, 0], [D, 0]],
      [[D, 0], [2 * D, 0]],
      [[2 * D, 0], [3 * D, 0]],
    ]
    expect(assembleRoutePoints(parts)).toEqual([[0, 0], [D, 0], [2 * D, 0], [3 * D, 0]])
  })

  it('una sola parte resta invariata', () => {
    const part: [number, number][] = [[0, 0], [D, 0]]
    expect(assembleRoutePoints([part])).toEqual(part)
  })

  it('nessuna parte produce un percorso vuoto', () => {
    expect(assembleRoutePoints([])).toEqual([])
  })
})

describe('nearestRouteVertexDistance', () => {
  it('un punto vicino all\'inizio del percorso ha distanza ~0', () => {
    const route: [number, number][] = [[0, 0], [5 * D, 0]]
    expect(nearestRouteVertexDistance(route, 0, 0)).toBeCloseTo(0, 0)
  })

  it('un punto vicino alla fine del percorso ha distanza ~lunghezza totale', () => {
    const route: [number, number][] = [[0, 0], [5 * D, 0]]
    const totalM = 5 * D * 111000
    expect(nearestRouteVertexDistance(route, 5 * D, 0)).toBeCloseTo(totalM, -1)
  })

  it('un punto a metà percorso restituisce circa metà della lunghezza', () => {
    const route: [number, number][] = [[0, 0], [2 * D, 0], [4 * D, 0]]
    const halfM = 2 * D * 111000
    expect(nearestRouteVertexDistance(route, 2 * D, 0)).toBeCloseTo(halfM, -1)
  })
})

describe('splitPolylineAtJunctions', () => {
  it('nessuna giunzione nota → la polilinea resta un solo sotto-tratto', () => {
    const points: [number, number][] = [[0, 0], [D, 0], [2 * D, 0]]
    expect(splitPolylineAtJunctions(points, [])).toEqual([points])
  })

  it('spezza in corrispondenza di una giunzione in mezzo al tratto', () => {
    const points: [number, number][] = [[0, 0], [3 * D, 0], [6 * D, 0]]
    const junctions: [number, number][] = [[3 * D, 0]]
    const result = splitPolylineAtJunctions(points, junctions, 50, 50)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([[0, 0], [3 * D, 0]])
    expect(result[1]).toEqual([[3 * D, 0], [6 * D, 0]])
  })

  it('due giunzioni troppo vicine fra loro restano unite dalla soglia minima', () => {
    // ~11m separano i due punti centrali — ben sotto una soglia minima di 50m: solo il primo taglio
    // valido viene accettato, il secondo viene scartato perché troppo vicino al primo.
    const points: [number, number][] = [
      [0, 0], [3 * D, 0], [3 * D + D / 10, 0], [8 * D, 0],
    ]
    const junctions: [number, number][] = [[3 * D, 0], [3 * D + D / 10, 0]]
    const result = splitPolylineAtJunctions(points, junctions, 50, 50)
    expect(result).toHaveLength(2)
  })

  it('una giunzione troppo vicina alla fine della polilinea non produce una coda minuscola', () => {
    const points: [number, number][] = [[0, 0], [5 * D, 0], [5 * D + D / 20, 0]]
    // ~5.5m dall'ultimo punto — sotto la soglia minima di 50m.
    const junctions: [number, number][] = [[5 * D, 0]]
    const result = splitPolylineAtJunctions(points, junctions, 50, 50)
    expect(result).toEqual([points])
  })
})
