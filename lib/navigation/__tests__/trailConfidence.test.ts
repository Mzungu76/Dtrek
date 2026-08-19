// Fase 8 di docs/navigator-orizzonti-roadmap.md
import { describe, it, expect } from 'vitest'
import { computeTrailConfidence } from '../trailConfidence'
import type { CommunitySignal } from '@/lib/trailConditions/types'

const community = (overrides: Partial<CommunitySignal> = {}): CommunitySignal => ({
  completions30d: 0, completionsTotal: 0, notes: [],
  difficultyMarkerCount: 0, recentDifficultyKeywords: [], confidenceWeight: 0,
  ...overrides,
})

describe('computeTrailConfidence', () => {
  it('restituisce uno stato neutro con motivo esplicito quando non c\'è nessun segnale', () => {
    const result = computeTrailConfidence({})
    expect(result.score).toBeCloseTo(0.5)
    // 'sconosciuta', non 'media': un punteggio numerico neutro non deve leggersi come un giudizio
    // vero e proprio quando non c'è alcun segnale di base su cui fondarlo.
    expect(result.label).toBe('sconosciuta')
    expect(result.factors).toContain('Dati insufficienti per una stima affidabile')
  })

  it('resta \'sconosciuta\' anche con un piccolo correttivo community, se manca ogni segnale di base', () => {
    const result = computeTrailConfidence({ community: community({ confidenceWeight: 0.5, completions30d: 5 }) })
    expect(result.label).toBe('sconosciuta')
  })

  it('un Trail Score alto senza altri segnali produce un punteggio alto', () => {
    const result = computeTrailConfidence({ trailScore: 90 })
    expect(result.score).toBeGreaterThan(0.7)
    expect(result.label).toBe('alta')
  })

  it('un Trail Score basso senza altri segnali produce un punteggio basso', () => {
    const result = computeTrailConfidence({ trailScore: 15 })
    expect(result.label).toBe('bassa')
  })

  it('una forte penalità meteo/clima abbassa il punteggio anche con un buon Trail Score', () => {
    const senzaMeteo = computeTrailConfidence({ trailScore: 80 })
    const conMeteo = computeTrailConfidence({ trailScore: 80, weatherPenalty: -30, climatePenalty: -20 })
    expect(conMeteo.score).toBeLessThan(senzaMeteo.score)
    expect(conMeteo.factors).toContain('Condizioni meteo/clima recenti penalizzanti')
  })

  // DTREK-AUDIT.md P1 #17 — Trail Score personale (fatica/bellezza) e Sicurezza sono canali
  // separati: un percorso sicuro ma poco adatto al profilo non deve mai leggersi come pericoloso,
  // e viceversa un percorso davvero rischioso non deve leggersi come "semplicemente faticoso".
  describe('safetyScore — canale separato dal Trail Score personale', () => {
    it('un Trail Score personale basso produce un fattore su "quanto ti si addice", mai su sicurezza/pericolo', () => {
      const result = computeTrailConfidence({ trailScore: 15 })
      const testo = result.factors.join(' | ')
      expect(testo).toMatch(/non è un giudizio di sicurezza/)
      expect(testo).not.toMatch(/pericoloso|non sicuro/i)
    })

    it('un percorso sicuro (safetyScore alto) ma poco adatto (trailScore basso) resta "bassa" per il profilo, senza il fattore di sicurezza', () => {
      const result = computeTrailConfidence({ trailScore: 15, safetyScore: 95 })
      expect(result.label).toBe('bassa')
      expect(result.factors.some((f) => f.includes('Punteggio di Sicurezza'))).toBe(false)
    })

    it('un percorso poco sicuro (safetyScore basso) abbassa il punteggio anche con un Trail Score personale alto, con un fattore distinto', () => {
      const altoTrailScore = computeTrailConfidence({ trailScore: 90 })
      const bassaSicurezza = computeTrailConfidence({ trailScore: 90, safetyScore: 10 })
      expect(bassaSicurezza.score).toBeLessThan(altoTrailScore.score)
      expect(bassaSicurezza.factors.some((f) => f.includes('Punteggio di Sicurezza basso'))).toBe(true)
      // Il fattore sul Trail Score personale resta comunque quello "alto" — i due giudizi non si
      // mescolano nello stesso testo.
      expect(bassaSicurezza.factors).toContain('Il percorso ti si addice bene, secondo il tuo profilo escursionistico')
    })

    it('un safetyScore alto non riduce praticamente nulla (gate vicino a 1)', () => {
      const senzaSafety = computeTrailConfidence({ trailScore: 90 })
      const conSafetyAlto = computeTrailConfidence({ trailScore: 90, safetyScore: 95 })
      expect(conSafetyAlto.score).toBeCloseTo(senzaSafety.score, 1)
    })
  })

  it('il segnale community non supera mai un piccolo correttivo, anche al peso massimo', () => {
    const senzaCommunity = computeTrailConfidence({ trailScore: 50 })
    const conCommunityMax = computeTrailConfidence({ trailScore: 50, community: community({ confidenceWeight: 0.5, completions30d: 5 }) })
    expect(conCommunityMax.score - senzaCommunity.score).toBeCloseTo(0.1, 5)
  })

  it('un segnale community con confidenceWeight 0 non sposta il punteggio', () => {
    const senzaCommunity = computeTrailConfidence({ trailScore: 50 })
    const conCommunityZero = computeTrailConfidence({ trailScore: 50, community: community({ confidenceWeight: 0 }) })
    expect(conCommunityZero.score).toBeCloseTo(senzaCommunity.score)
    expect(conCommunityZero.factors).not.toContain('Confermato da almeno un escursionista di recente')
  })

  it('il punteggio resta sempre entro 0 e 1 anche in condizioni estreme', () => {
    const result = computeTrailConfidence({
      trailScore: 100, weatherPenalty: 0, climatePenalty: 5,
      community: community({ confidenceWeight: 0.5, completions30d: 10 }),
    })
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})
