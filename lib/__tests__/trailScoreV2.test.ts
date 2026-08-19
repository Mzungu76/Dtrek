import { describe, it, expect } from 'vitest'
import { computeTrailScoreV2, safetyGate, SAFETY_GATE_S0 } from '@/lib/trailScoreV2'

describe('computeTrailScoreV2', () => {
  it('input massimo (cts=100, safety=100) produce il punteggio massimo (100)', () => {
    expect(computeTrailScoreV2({ cts: 100, safety: 100 })?.score).toBe(100)
  })

  it('input minimo (cts=0, safety=0) produce il punteggio minimo (0)', () => {
    expect(computeTrailScoreV2({ cts: 0, safety: 0 })?.score).toBe(0)
  })

  it('nessun caso normale supera 100 o scende sotto 0', () => {
    for (let cts = 0; cts <= 100; cts += 10) {
      for (let safety = 0; safety <= 100; safety += 10) {
        const r = computeTrailScoreV2({ cts, safety })!
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('ritorna null quando cts o safety mancano (null)', () => {
    expect(computeTrailScoreV2({ cts: null, safety: 80 })).toBeNull()
    expect(computeTrailScoreV2({ cts: 80, safety: null })).toBeNull()
  })

  // Trovato verificando dinamicamente il clamp con input avversari: Math.max(0, Math.min(100, NaN))
  // è NaN, non 0 né 100 — Math.min/max trattano NaN come "non minore/maggiore di nulla", quindi il
  // clamp esistente non lo intercettava. Un cts o safety NaN (es. un 0/0 a monte su una traccia
  // degenere) superava il controllo `== null` e usciva come punteggio NaN — diverso dal null onesto
  // che questa funzione già ritorna per un input mancante, e che finirebbe renderizzato come la
  // stringa "NaN" ovunque il punteggio sia mostrato invece di essere trattato come dato assente.
  it('un input NaN ritorna null invece di un punteggio NaN', () => {
    expect(computeTrailScoreV2({ cts: NaN, safety: 80 })).toBeNull()
    expect(computeTrailScoreV2({ cts: 80, safety: NaN })).toBeNull()
  })

  it('un input ±Infinity ritorna null, stesso trattamento di NaN — non un punteggio clampato', () => {
    expect(computeTrailScoreV2({ cts: Infinity, safety: 80 })).toBeNull()
    expect(computeTrailScoreV2({ cts: 80, safety: Infinity })).toBeNull()
    expect(computeTrailScoreV2({ cts: -Infinity, safety: 80 })).toBeNull()
  })

  it('vetoed è true solo sotto SAFETY_VETO_THRESHOLD (15)', () => {
    expect(computeTrailScoreV2({ cts: 80, safety: 14 })?.breakdown.vetoed).toBe(true)
    expect(computeTrailScoreV2({ cts: 80, safety: 15 })?.breakdown.vetoed).toBe(false)
  })

  it('un percorso bello ma pericoloso (cts alto, safety basso) resta vicino a 0, mai "salvato" dal CTS', () => {
    const r = computeTrailScoreV2({ cts: 100, safety: 0 })!
    expect(r.score).toBeLessThan(10)
  })
})

describe('safetyGate', () => {
  it('vale 0.5 esattamente alla soglia S0', () => {
    expect(safetyGate(SAFETY_GATE_S0)).toBeCloseTo(0.5, 5)
  })

  it('è monotona crescente su tutto il dominio 0-100', () => {
    let prev = -1
    for (let s = 0; s <= 100; s += 1) {
      const g = safetyGate(s)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
  })
})
