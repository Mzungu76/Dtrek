import { describe, expect, it } from 'vitest'
import { selezionaProssimaUscita, type CandidataProssimaUscita } from '../prossimaUscita'

const OGGI = new Date('2026-09-05T12:00:00Z')

function riga(overrides: Partial<CandidataProssimaUscita> & { id: string }): CandidataProssimaUscita {
  return {
    title: overrides.id, distanceMeters: 10_000, elevationGain: 500, estimatedTimeSeconds: 14_400,
    trailScore: null, favorite: false, plannedDate: null, createdAt: '2026-01-01T00:00:00Z',
    reportageCount: 0,
    ...overrides,
  }
}

describe('selezionaProssimaUscita', () => {
  it('nessuna Meta senza Reportage → null, non un errore o un fallback arbitrario', () => {
    expect(selezionaProssimaUscita([], OGGI)).toBeNull()
    expect(selezionaProssimaUscita([riga({ id: 'fatta', reportageCount: 2 })], OGGI)).toBeNull()
  })

  it('preferisce la data programmata futura più vicina', () => {
    const righe = [
      riga({ id: 'lontana', plannedDate: '2026-12-01' }),
      riga({ id: 'vicina', plannedDate: '2026-09-12' }),
      riga({ id: 'senza-data', favorite: true }),
    ]
    expect(selezionaProssimaUscita(righe, OGGI)?.id).toBe('vicina')
  })

  it('ignora le date programmate già passate', () => {
    const righe = [
      riga({ id: 'passata', plannedDate: '2026-01-01' }),
      riga({ id: 'futura', plannedDate: '2026-10-01' }),
    ]
    expect(selezionaProssimaUscita(righe, OGGI)?.id).toBe('futura')
  })

  it('senza date future, sceglie la preferita più recente', () => {
    const righe = [
      riga({ id: 'vecchia-preferita', favorite: true, createdAt: '2026-01-01T00:00:00Z' }),
      riga({ id: 'nuova-preferita', favorite: true, createdAt: '2026-08-01T00:00:00Z' }),
      riga({ id: 'non-preferita', createdAt: '2026-09-01T00:00:00Z' }),
    ]
    expect(selezionaProssimaUscita(righe, OGGI)?.id).toBe('nuova-preferita')
  })

  it('senza date future né preferite, sceglie la creata più di recente', () => {
    const righe = [
      riga({ id: 'vecchia', createdAt: '2026-01-01T00:00:00Z' }),
      riga({ id: 'recente', createdAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(selezionaProssimaUscita(righe, OGGI)?.id).toBe('recente')
  })

  it('una Meta con Reportage non è mai candidata, anche se preferita e con data futura', () => {
    const righe = [
      riga({ id: 'fatta-ma-preferita', favorite: true, plannedDate: '2026-09-10', reportageCount: 1 }),
      riga({ id: 'unica-papabile' }),
    ]
    expect(selezionaProssimaUscita(righe, OGGI)?.id).toBe('unica-papabile')
  })
})
