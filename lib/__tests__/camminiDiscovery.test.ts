import { describe, expect, it } from 'vitest'
import { evaluateAll, evaluateRelation, parseDeclaredKm, summarize, type DiscoveryRelation } from '../cammini/discovery'

const rel = (id: number, tags: Record<string, string>, wayMembers = 0, childIds: number[] = []): DiscoveryRelation => ({ id, tags, wayMembers, childIds })

describe('parseDeclaredKm', () => {
  it('legge km, metri e numeri nudi', () => {
    expect(parseDeclaredKm('123')).toBe(123)
    expect(parseDeclaredKm('123,5 km')).toBeCloseTo(123.5)
    expect(parseDeclaredKm('850 m')).toBeCloseTo(0.85)
    expect(parseDeclaredKm('7000 km')).toBe(7000)
    expect(parseDeclaredKm('18000')).toBe(18)
    expect(parseDeclaredKm('boh')).toBeNull()
    expect(parseDeclaredKm(undefined)).toBeNull()
  })
})

describe('evaluateRelation', () => {
  it('ammette un cammino nazionale lungo con tappe e nome da cammino', () => {
    const r = evaluateRelation(rel(1, { name: 'Via Francigena', network: 'iwn', distance: '1000 km', wikidata: 'Q1' }, 0, [11, 12, 13, 14]))
    expect(r.verdict).toBe('ammesso')
    expect(r.kind).toBe('cammino')
    expect(r.score).toBeGreaterThanOrEqual(60)
  })

  it('scarta un giro locale breve anche se di rete nazionale', () => {
    const r = evaluateRelation(rel(2, { name: 'Anello del Faggio', network: 'nwn', distance: '8' }, 40))
    expect(r.verdict).toBe('scartato')
    expect(r.kind).toBe('locale')
  })

  it('scarta le relazioni senza nome', () => {
    const r = evaluateRelation(rel(3, { network: 'iwn', ref: 'E1', distance: '500' }))
    expect(r.verdict).toBe('scartato')
    expect(r.kind).toBe('senza_nome')
  })

  it('una tappa senza figli non è un cammino a sé', () => {
    const r = evaluateRelation(rel(4, { name: 'Via Francigena - Tappa 12: Viterbo - Sutri', network: 'iwn', distance: '35' }, 50))
    expect(r.verdict).toBe('scartato')
    expect(r.kind).toBe('tappa_o_figlio')
  })

  it('una variante va rivista, non ammessa', () => {
    const r = evaluateRelation(rel(5, { name: 'Via Francigena variante Amerina', network: 'iwn', distance: '120', wikidata: 'Q2' }, 0, [1, 2, 3]))
    expect(r.kind).toBe('variante')
    expect(r.verdict).toBe('da_rivedere')
  })

  it('rispetta le eccezioni manuali', () => {
    expect(evaluateRelation(rel(6, { name: 'Anello', network: 'nwn', distance: '5' }), { include: [6] }).verdict).toBe('ammesso')
    expect(evaluateRelation(rel(7, { name: 'Via Francigena', network: 'iwn', distance: '1000' }, 0, [1, 2, 3]), { exclude: [7] }).verdict).toBe('scartato')
  })
})

describe('evaluateAll', () => {
  it('collega le figlie alla madre e le toglie dai cammini', () => {
    const madre = rel(10, { name: 'Cammino di Prova', network: 'nwn', distance: '200' }, 0, [20, 21, 22])
    // Le figlie hanno un nome e punteggio alto da sole, ma sono parti della madre.
    const f = (id: number) => rel(id, { name: `Cammino di Prova ${id}`, network: 'nwn', distance: '70' }, 30)
    const res = evaluateAll([f(20), madre, f(21), f(22)])
    const byId = new Map(res.map(r => [r.id, r]))
    expect(byId.get(10)?.verdict).toBe('ammesso')
    expect(byId.get(20)?.parentId).toBe(10)
    expect(byId.get(20)?.verdict).toBe('scartato')
    expect(summarize(res).ammesso).toBe(1)
  })

  it('ordina per punteggio decrescente', () => {
    const res = evaluateAll([rel(1, { name: 'Anello', network: 'nwn', distance: '5' }), rel(2, { name: 'Via Francigena', network: 'iwn', distance: '900' }, 0, [5, 6, 7])])
    expect(res[0].id).toBe(2)
  })
})
