import { describe, it, expect } from 'vitest'
import {
  distanceFactor, dataQualityFactor, historicalCenterFactor, ptprBorgoIdentitarioFactor,
  inferredInterestTags, interestMatchFactor, combineFactors,
} from '../ranking'

describe('distanceFactor', () => {
  it('assente (null) senza origine — non deve penalizzare una ricerca senza punto di partenza', () => {
    expect(distanceFactor(undefined, 42, 12, 50)).toBeNull()
  })
  it('1.0 a distanza zero', () => {
    const f = distanceFactor({ lat: 42, lon: 12 }, 42, 12, 50)
    expect(f?.score).toBeCloseTo(1, 5)
  })
  it('decresce con la distanza, mai negativo oltre il massimo', () => {
    // ~111km a nord (1 grado di latitudine) con maxDistanceKm=50 → ben oltre il raggio
    const f = distanceFactor({ lat: 42, lon: 12 }, 43, 12, 50)
    expect(f?.score).toBe(0)
  })
})

describe('dataQualityFactor', () => {
  it('più fonti indipendenti → punteggio più alto, satura a 3 fonti', () => {
    const one = dataQualityFactor(1, 1, 0, 5)
    const three = dataQualityFactor(3, 1, 0, 5)
    const five = dataQualityFactor(5, 1, 0, 5)
    expect(three.score).toBeGreaterThan(one.score)
    expect(five.score).toBe(three.score) // saturazione, non cresce oltre 3
  })
  it('completezza campi contribuisce al punteggio', () => {
    const empty = dataQualityFactor(1, 1, 0, 5)
    const full = dataQualityFactor(1, 1, 5, 5)
    expect(full.score).toBeGreaterThan(empty.score)
  })
})

describe('historicalCenterFactor / ptprBorgoIdentitarioFactor', () => {
  it('flag assente/false → punteggio 0, mai un errore su metadata null', () => {
    expect(historicalCenterFactor(null).score).toBe(0)
    expect(historicalCenterFactor({}).score).toBe(0)
    expect(ptprBorgoIdentitarioFactor(undefined).score).toBe(0)
  })
  it('flag true → punteggio 1', () => {
    expect(historicalCenterFactor({ historicalCenter: true }).score).toBe(1)
    expect(ptprBorgoIdentitarioFactor({ ptprBorgoIdentitario: true }).score).toBe(1)
  })
})

describe('inferredInterestTags', () => {
  it('nessun metadata → nessun tag, mai un errore', () => {
    expect(inferredInterestTags(null)).toEqual([])
    expect(inferredInterestTags(undefined)).toEqual([])
  })
  it('historicalCenter implica storia+architettura', () => {
    expect(inferredInterestTags({ historicalCenter: true })).toEqual(expect.arrayContaining(['storia', 'architettura']))
  })
  it('nessun tag duplicato quando più flag implicano lo stesso interesse', () => {
    const tags = inferredInterestTags({ historicalCenter: true, ptprBorgoIdentitario: true, cityOfFoundation: true })
    expect(tags.filter(t => t === 'storia')).toHaveLength(1)
  })
})

describe('interestMatchFactor', () => {
  it('nessun interesse richiesto → fattore assente (null), non penalizza', () => {
    expect(interestMatchFactor(undefined, ['storia'])).toBeNull()
    expect(interestMatchFactor([], ['storia'])).toBeNull()
  })
  it('nessun segnale disponibile sulla Meta → fattore assente, non uno zero che penalizza sistematicamente', () => {
    expect(interestMatchFactor(['storia'], [])).toBeNull()
  })
  it('match parziale → punteggio proporzionale', () => {
    const f = interestMatchFactor(['storia', 'gastronomia'], ['storia'])
    expect(f?.score).toBeCloseTo(0.5, 5)
  })
})

describe('combineFactors', () => {
  it('ignora i fattori null (assenti) invece di trattarli come zero', () => {
    const withNulls = combineFactors([{ factor: 'a', score: 1, weight: 1 }, null, null])
    expect(withNulls.score).toBe(1) // se i null contassero come 0 pesati, il risultato scenderebbe
  })
  it('nessun fattore → punteggio 0, mai NaN', () => {
    expect(combineFactors([null, null]).score).toBe(0)
  })
})
