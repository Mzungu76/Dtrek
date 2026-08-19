import { describe, it, expect } from 'vitest'
import {
  scoreWayTags, scoreProtectedAreas, scorePoiProximity, isUrbanTransferWay, computeUrbanPenalty,
  isExcluded, scoreRelationTags, classifyTrailScore,
} from '@/lib/routeBuilder/hikingProbability'

// DTREK-AUDIT.md P2 #21 — classifyTrailScore era tarato su un solo caso reale ("Nera Montoro",
// vedi il commento sulla funzione), generalizzabilità mai verificata. Nessuna chiamata Overpass
// reale possibile da questo sandbox (egress bloccato dalla policy di rete), quindi questi test
// verificano il classificatore contro un set più ampio di profili di tag OSM sintetici ma
// realistici — le convenzioni di tagging escursionistico italiane reali (sac_scale,
// trail_visibility, osmc:symbol via CAI) — non sostituisce una verifica contro dati Overpass
// reali, ma amplia la copertura ben oltre il singolo caso aneddotico e blocca ogni regressione
// futura sulle soglie con un test versionato invece di un solo commento.

function trailScoreFor(tags: Record<string, string>, opts: { nearCoast?: boolean; isNearSettlement?: boolean } = {}): number {
  const nearSettlement = opts.isNearSettlement ?? false
  return scoreWayTags(tags, opts.nearCoast ?? false)
    + scoreProtectedAreas(0, 0, [])
    + scorePoiProximity(0, 0, [])
    + computeUrbanPenalty(tags, nearSettlement)
}

describe('classifyTrailScore — profili sintetici realistici (oltre il singolo caso "Nera Montoro")', () => {
  it('sentiero CAI ben taggato (sac_scale+trail_visibility+path+surface naturale) → quasi_certo', () => {
    const score = trailScoreFor({ highway: 'path', sac_scale: 'hiking', trail_visibility: 'good', surface: 'dirt' })
    expect(classifyTrailScore(score)).toBe('quasi_certo')
  })

  it('mulattiera/tratturo con un solo tag informativo forte (solo highway=path) → possibile o meglio', () => {
    const score = trailScoreFor({ highway: 'path' })
    expect(['possibile', 'molto_probabile', 'quasi_certo']).toContain(classifyTrailScore(score))
  })

  it('pista forestale con solo surface naturale, nessun altro tag → possibile (segnale debole ma reale)', () => {
    const score = trailScoreFor({ highway: 'track', surface: 'dirt' })
    expect(classifyTrailScore(score)).toBe('possibile')
  })

  it('track con tracktype grade4 + superficie naturale → almeno possibile', () => {
    const score = trailScoreFor({ highway: 'track', tracktype: 'grade4', surface: 'gravel' })
    expect(['possibile', 'molto_probabile']).toContain(classifyTrailScore(score))
  })

  it('footway urbano vicino a un centro abitato (non sidewalk/crossing, quindi non escluso a monte) → improbabile', () => {
    const tags = { highway: 'footway', surface: 'asphalt' }
    expect(isExcluded(tags)).toBe(false) // non è sidewalk/crossing, quindi arriva al punteggio
    const score = trailScoreFor(tags, { isNearSettlement: true })
    expect(classifyTrailScore(score)).toBe('improbabile')
  })

  it('via del paese con nome urbano ("Via Roma") asfaltata vicino a un centro abitato → improbabile', () => {
    const tags = { highway: 'residential', name: 'Via Roma', surface: 'asphalt' }
    const score = trailScoreFor(tags, { isNearSettlement: true })
    expect(classifyTrailScore(score)).toBe('improbabile')
    expect(isUrbanTransferWay(tags, true)).toBe(true)
  })

  it('lo stesso footway lontano da un centro abitato non subisce la penalità urbana', () => {
    const tags = { highway: 'footway', surface: 'dirt' }
    const vicino = trailScoreFor(tags, { isNearSettlement: true })
    const lontano = trailScoreFor(tags, { isNearSettlement: false })
    expect(lontano).toBeGreaterThan(vicino)
  })

  it('marciapiede/attraversamento (footway=sidewalk/crossing) è escluso a monte, mai classificato', () => {
    expect(isExcluded({ highway: 'footway', footway: 'sidewalk' })).toBe(true)
    expect(isExcluded({ highway: 'footway', footway: 'crossing' })).toBe(true)
  })

  it('accesso privato o vietato ai pedoni è sempre escluso, indipendentemente da altri tag ricchi', () => {
    expect(isExcluded({ highway: 'path', access: 'private', sac_scale: 'hiking' })).toBe(true)
    expect(isExcluded({ highway: 'path', foot: 'no', sac_scale: 'hiking' })).toBe(true)
  })

  it('guado (ford=yes) su un sentiero già ben taggato aggiunge segnale, non lo toglie', () => {
    const base = trailScoreFor({ highway: 'path', sac_scale: 'hiking' })
    const conGuado = trailScoreFor({ highway: 'path', sac_scale: 'hiking', ford: 'yes' })
    expect(conGuado).toBeGreaterThan(base)
  })

  it('sabbia in ambiente costiero non riceve il bonus superficie naturale (probabile spiaggia, non sentiero)', () => {
    const costa = trailScoreFor({ highway: 'path', surface: 'sand' }, { nearCoast: true })
    const entroterra = trailScoreFor({ highway: 'path', surface: 'sand' }, { nearCoast: false })
    expect(entroterra).toBeGreaterThan(costa)
  })

  it('asfalto riduce la plausibilità "sentiero" ovunque, non solo in paese', () => {
    const sterrato = trailScoreFor({ highway: 'track', surface: 'gravel' })
    const asfaltato = trailScoreFor({ highway: 'track', surface: 'asphalt' })
    expect(asfaltato).toBeLessThan(sterrato)
  })

  it('nessun tag riconosciuto (solo highway generico) → improbabile', () => {
    const score = trailScoreFor({ highway: 'track' })
    // highway=track senza tracktype prende comunque +5 (Fase 2b) — resta comunque un segnale
    // debolissimo, ben sotto la soglia 'possibile' (15).
    expect(classifyTrailScore(score)).toBe('improbabile')
  })
})

describe('scoreRelationTags — appartenenza a una relation, mai confusa con trailScore', () => {
  it('route=hiking vale più di route=foot generico', () => {
    expect(scoreRelationTags({ route: 'hiking' })).toBeGreaterThan(scoreRelationTags({ route: 'foot' }))
  })

  it('operator=CAI e ref aggiungono segnale, mai lo tolgono', () => {
    const base = scoreRelationTags({ route: 'hiking' })
    const conCai = scoreRelationTags({ route: 'hiking', operator: 'CAI', ref: '301' })
    expect(conCai).toBeGreaterThan(base)
  })
})

describe('classifyTrailScore — confini delle soglie (90/50/15)', () => {
  it('è monotona: un punteggio più alto non scende mai di tier', () => {
    const order: Record<ReturnType<typeof classifyTrailScore>, number> = {
      improbabile: 0, possibile: 1, molto_probabile: 2, quasi_certo: 3,
    }
    const scores = [-40, -10, 0, 14, 15, 40, 49, 50, 89, 90, 130, 300]
    for (let i = 1; i < scores.length; i++) {
      expect(order[classifyTrailScore(scores[i])]).toBeGreaterThanOrEqual(order[classifyTrailScore(scores[i - 1])])
    }
  })

  it('i confini esatti rispettano le soglie dichiarate', () => {
    expect(classifyTrailScore(89)).toBe('molto_probabile')
    expect(classifyTrailScore(90)).toBe('quasi_certo')
    expect(classifyTrailScore(49)).toBe('possibile')
    expect(classifyTrailScore(50)).toBe('molto_probabile')
    expect(classifyTrailScore(14)).toBe('improbabile')
    expect(classifyTrailScore(15)).toBe('possibile')
  })
})
