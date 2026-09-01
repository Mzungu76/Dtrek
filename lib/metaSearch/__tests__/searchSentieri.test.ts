import { describe, it, expect } from 'vitest'
import { normalizeHikeCandidates } from '../searchSentieri'

describe('normalizeHikeCandidates', () => {
  it('mappa i campi del candidato esistente nel modello comune, preservando l\'ordine di arrivo', () => {
    const result = normalizeHikeCandidates([
      { id: 'a', name: 'Anello del Cimino', latitude: 42.4, longitude: 12.2, distanceMeters: 8000, elevationGain: 400, trailScore: 78 },
      { id: 'b', title: 'Sentiero senza name (fallback su title)', latitude: 42.1, longitude: 12.0 },
    ])
    expect(result.metaType).toBe('sentiero')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      id: 'a', metaType: 'sentiero', name: 'Anello del Cimino',
      hikeStats: { distanceMeters: 8000, elevationGain: 400, trailScore: 78 },
    })
    expect(result.items[1].name).toBe('Sentiero senza name (fallback su title)')
    // Il ranking dei Sentieri resta quello del sistema esistente — l'ordine di arrivo non viene
    // toccato, il primo candidato ricevuto ha sempre lo score più alto.
    expect(result.items[0].rankingScore).toBeGreaterThan(result.items[1].rankingScore)
  })

  it('array vuoto → risultato vuoto, mai un errore', () => {
    const result = normalizeHikeCandidates([])
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('nessun campo hiking valorizzato → hikeStats con tutti i campi undefined, mai fabbricati a 0', () => {
    const result = normalizeHikeCandidates([{ id: 'x', name: 'X' }])
    expect(result.items[0].hikeStats).toEqual({
      distanceMeters: undefined, elevationGain: undefined, estimatedTimeSeconds: undefined,
      trailScore: undefined, safetyScore: undefined,
    })
  })
})
