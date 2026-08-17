// DTREK-AUDIT.md — P0 #3: il Safety Score usava dislivello×distanza (D-score) come proxy di
// "pericolosità del terreno" — una misura di fatica fisica, non di tecnicità. Una ferrata corta
// ma esposta ha poco dislivello e poca distanza, quindi D-score basso ⇒ "terreno sicuro" anche
// quando il pericolo reale è alto. Questi test verificano che refineSafetyWithTerrainSignals
// corregga davvero questo caso con segnali di tecnicità reale (pendenza di picco DTM, scala SAC),
// mai al rialzo, e mai quando nessun segnale è disponibile.
import { describe, it, expect } from 'vitest'
import { computeSafetyScore, refineSafetyWithTerrainSignals, type SafetyScore } from '../safetyScore'

// Percorso breve e con poco dislivello — il profilo classico che oggi produce un D-score basso
// ("terreno sicuro") indipendentemente da quanto sia tecnicamente impegnativo.
function shortEasyLookingSafety(): SafetyScore {
  return computeSafetyScore({
    distanceMeters: 800,
    elevationGain: 120,
    elevationLoss: 120,
    altitudeMax: 1200,
    altitudeMin: 1080,
    estimatedTimeSeconds: 1800,
  })
}

describe('refineSafetyWithTerrainSignals — nessun segnale disponibile', () => {
  it('restituisce la Sicurezza invariata quando non ci sono né pendenza né scala SAC', () => {
    const safety = shortEasyLookingSafety()
    const refined = refineSafetyWithTerrainSignals(safety, {})
    expect(refined).toEqual(safety)
  })

  it('ignora una scala SAC non riconosciuta invece di lanciare o applicarla alla cieca', () => {
    const safety = shortEasyLookingSafety()
    const refined = refineSafetyWithTerrainSignals(safety, { sacScale: 'T99' })
    expect(refined).toEqual(safety)
  })
})

describe('refineSafetyWithTerrainSignals — pendenza di picco (DTM)', () => {
  it('abbassa il punteggio Terreno quando il picco di pendenza è più pericoloso del D-score', () => {
    const safety = shortEasyLookingSafety()
    const before = safety.categories.terrain.score
    const refined = refineSafetyWithTerrainSignals(safety, { maxSlopeDeg: 42 }) // >=40° → hazard 20
    expect(refined.categories.terrain.score).toBeLessThan(before)
    expect(refined.categories.terrain.score).toBe(20)
    expect(refined.overall).toBeLessThan(safety.overall)
    expect(refined.categories.terrain.items.some(i => i.text.includes('Pendenza massima reale'))).toBe(true)
    expect(refined.allRisks.some(i => i.text.includes('Pendenza massima reale'))).toBe(true)
  })

  it('non alza mai il punteggio quando la pendenza è meno pericolosa del D-score già calcolato', () => {
    const safety = shortEasyLookingSafety()
    const before = safety.categories.terrain.score
    const refined = refineSafetyWithTerrainSignals(safety, { maxSlopeDeg: 3 }) // <10° → hazard 90, quasi certamente >= al D-score
    expect(refined.categories.terrain.score).toBeLessThanOrEqual(before)
    expect(refined.overall).toBeLessThanOrEqual(safety.overall)
  })
})

describe('refineSafetyWithTerrainSignals — scala SAC — lo scenario esatto dell\'audit', () => {
  it('una "ferrata corta" (poco dislivello/poca distanza, D-score basso) con scala SAC T5 non resta "terreno sicuro"', () => {
    const safety = shortEasyLookingSafety()
    // Prima del fix: il D-score da solo classificava questo percorso come "terreno sicuro" (score
    // alto in fascia 90), a prescindere dalla tecnicità reale — esattamente il difetto descritto
    // nel commento originale di lib/safetyScore.ts.
    expect(safety.categories.terrain.score).toBeGreaterThanOrEqual(75)

    const refined = refineSafetyWithTerrainSignals(safety, { sacScale: 'T5' })
    expect(refined.categories.terrain.score).toBe(12)
    expect(refined.overall).toBeLessThan(safety.overall)
    // Una correzione di 20 punti di peso sul Terreno (SAFETY_CATEGORY_WEIGHTS.terrain=0.2) da un
    // salto di score di ~75+ punti deve spostare l'overall in modo sostanziale, non impercettibile.
    expect(safety.overall - refined.overall).toBeGreaterThanOrEqual(10)
    expect(refined.categories.terrain.items.some(i => i.text.includes('T5 rilevata'))).toBe(true)
  })

  it('T1/T2 (sentiero escursionistico ordinario) non peggiora mai un D-score già più cauto', () => {
    const safety = shortEasyLookingSafety()
    const refined = refineSafetyWithTerrainSignals(safety, { sacScale: 'T1' })
    expect(refined.categories.terrain.score).toBe(safety.categories.terrain.score)
    expect(refined.overall).toBe(safety.overall)
  })
})

describe('refineSafetyWithTerrainSignals — worst-of fra più segnali', () => {
  it('quando entrambi i segnali sono presenti, vince (in negativo) il più pericoloso dei due', () => {
    const safety = shortEasyLookingSafety()
    // maxSlopeDeg=15 → hazard 80 (lieve), sacScale=T6 → hazard 5 (estremo): deve vincere T6.
    const refined = refineSafetyWithTerrainSignals(safety, { maxSlopeDeg: 15, sacScale: 'T6' })
    expect(refined.categories.terrain.score).toBe(5)
    expect(refined.categories.terrain.items.some(i => i.text.includes('T6 rilevata'))).toBe(true)
    expect(refined.categories.terrain.items.some(i => i.text.includes('Pendenza massima reale'))).toBe(false)
  })
})
