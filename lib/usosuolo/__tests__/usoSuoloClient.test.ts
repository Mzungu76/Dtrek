import { describe, it, expect } from 'vitest'
import { extractClassCode, sampleLandCoverAtPoint, type UsoSuoloTile } from '@/lib/usosuolo/usoSuoloClient'

// DTREK-AUDIT.md P1 #12 — usoSuoloClient.ts dichiara nel proprio commento che CLASS_CODE_FIELDS è
// "provvisorio... in attesa di una vera risposta DescribeFeatureType" (egress verso l'endpoint WFS
// reale bloccato dalla policy di rete anche in questo sandbox). Questi test verificano che
// extractClassCode scelga correttamente tra i nomi campo candidati dichiarati e non fabbrichi mai
// un codice da un valore non numerico — non sostituiscono una verifica contro il server reale.
describe('extractClassCode', () => {
  it('legge il primo campo candidato presente, in ordine di priorità', () => {
    expect(extractClassCode({ Code_18: '324' })).toBe(324)
    expect(extractClassCode({ CLC18: '311' })).toBe(311)
    expect(extractClassCode({ classe: '112' })).toBe(112)
  })

  it('preferisce Code_18 quando più varianti sono presenti insieme', () => {
    expect(extractClassCode({ Code_18: '324', classe: '112' })).toBe(324)
  })

  it('torna null senza fabbricare un codice se nessun campo candidato è presente', () => {
    expect(extractClassCode({ altro_campo: '324' })).toBeNull()
  })

  it('torna null per un valore non numerico invece di produrre NaN silenzioso', () => {
    expect(extractClassCode({ Code_18: 'bosco misto' })).toBeNull()
  })

  it('accetta un valore già numerico (non solo stringa)', () => {
    expect(extractClassCode({ Code_18: 324 })).toBe(324)
  })
})

describe('sampleLandCoverAtPoint', () => {
  const squareTile: UsoSuoloTile = {
    features: [
      { geometry: { type: 'Polygon', coordinates: [[[12.0, 41.0], [12.1, 41.0], [12.1, 41.1], [12.0, 41.1], [12.0, 41.0]]] }, classCode: 324 },
    ],
  }

  it('trova il classCode del poligono che contiene il punto', () => {
    expect(sampleLandCoverAtPoint(squareTile, 41.05, 12.05)).toBe(324)
  })

  it('torna null per un punto fuori da ogni poligono, senza estrapolare', () => {
    expect(sampleLandCoverAtPoint(squareTile, 42.0, 13.0)).toBeNull()
  })

  it('torna null su un tile senza feature', () => {
    expect(sampleLandCoverAtPoint({ features: [] }, 41.05, 12.05)).toBeNull()
  })
})
