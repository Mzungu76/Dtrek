import { describe, it, expect } from 'vitest'
import { orientedTappa } from '../cammini/offlineTappa'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'

const detail = {
  id: 'c1', name: 'Via X', description: null, officialUrl: null, region: null, stats: {} as never,
  tappe: [
    { ordinal: 1, name: 'T1', fromName: 'A', toName: 'B', lengthM: 1000, source: 'official', endsAtAnchor: true, elevationGainM: null, elevationLossM: null, polyline: [[1, 1], [2, 2]] },
  ],
} as unknown as CamminoDetail

describe('orientedTappa', () => {
  it('tiene il verso del catalogo', () => {
    const t = orientedTappa(detail, 1, 'forward', [], 5)!
    expect(t.polyline).toEqual([[1, 1], [2, 2]])
    expect(t.name).toBe('A → B')
    expect(t.savedAt).toBe(5)
  })
  it('gira linea e capi nel verso inverso', () => {
    const t = orientedTappa(detail, 1, 'reverse')!
    expect(t.polyline).toEqual([[2, 2], [1, 1]])
    expect(t.name).toBe('B → A')
    expect(t.direction).toBe('reverse')
  })
  it('null se la tappa non esiste', () => {
    expect(orientedTappa(detail, 9, 'forward')).toBeNull()
  })
})
