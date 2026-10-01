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

import { applyCountryCheck, familyKey, groupFamilies } from '../cammini/discovery'
import { buildNearestFinder } from '../cammini/geoFilter'

describe('tappe con sigla (dal primo giro reale)', () => {
  it('Via Alpina Red R103 / Blue D18 / Yellow B1 sono tappe, non cammini', () => {
    for (const name of ['Via Alpina Red R103', 'Via Alpina Blue D18', 'Via Alpina Yellow B1', 'Via Alpina Purple A9']) {
      const r = evaluateRelation(rel(1, { name, network: 'iwn', distance: '17' }, 40))
      expect(r.kind).toBe('tappa_o_figlio')
      expect(r.verdict).toBe('scartato')
    }
  })

  it('"Alta Via n. 1 delle Dolomiti" non è scambiata per una tappa', () => {
    const r = evaluateRelation(rel(2, { name: 'Alta via n. 1 delle Dolomiti', network: 'rwn', distance: '125' }, 393))
    expect(r.kind).toBe('cammino')
    expect(r.verdict).toBe('ammesso')
  })

  it('un regionale con tante tappe (Sentiero Italia - Piemonte E00) resta un cammino', () => {
    const r = evaluateRelation(rel(3, { name: 'Sentiero Italia - Piemonte E00', network: 'nwn' }, 0, Array.from({ length: 83 }, (_, i) => 1000 + i)))
    expect(r.kind).toBe('cammino')
  })

  it('senza tracciato né figli non c\'è niente da importare', () => {
    const r = evaluateRelation(rel(4, { name: 'Il cammin die San Romedio', network: 'iwn', distance: '192' }, 0, []))
    expect(r.verdict).toBe('scartato')
  })
})

describe('familyKey', () => {
  it('riunisce i pezzi dello stesso cammino', () => {
    expect(familyKey('Via Francigena - 07 Lazio')).toBe('via francigena')
    expect(familyKey("Via Francigena - 01 Valle d'Aosta")).toBe('via francigena')
    expect(familyKey('Via Francigena - Variante Parma')).toBe('via francigena')
    expect(familyKey('Via Francigena - parte Francia - 04 Be')).toBe('via francigena')
    expect(familyKey('Via Romea - Tratto Emilia')).toBe('via romea')
    expect(familyKey('Via Romea Tratto Altoatesino')).toBe('via romea')
    expect(familyKey('Via Alpina Red R103')).toBe('via alpina')
    expect(familyKey('Via Alpina Blue D18')).toBe('via alpina')
    expect(familyKey('Sentiero Italia - Basilicata T00')).toBe('sentiero italia')
    expect(familyKey('Sentiero Italia - Piemonte E00')).toBe('sentiero italia')
    expect(familyKey('Cammino di Assisi, Genova - San Miniato')).toBe('cammino di assisi')
    expect(familyKey("Il Cammino di Sant'Antonio: Opzione Tappa 2")).toBe("il cammino di sant'antonio")
  })

  it('non confonde cammini diversi', () => {
    expect(familyKey('Alta via n. 1 delle Dolomiti')).not.toBe(familyKey('Alta Via n. 2 delle Dolomiti'))
  })
})

describe('groupFamilies', () => {
  it('Via Francigena per regione = un solo cammino; il Kugy ripetuto = un solo cammino', () => {
    const regions = ['01 Valle d\'Aosta', '02 Piemonte', '04 Emilia Romagna', '06 Toscana', '07 Lazio']
    const rels = [
      ...regions.map((r, i) => rel(10 + i, { name: `Via Francigena - ${r}`, network: 'iwn', distance: '150' }, 500, i === 4 ? [1, 2, 3, 4] : [])),
      ...[1, 2, 3].map(i => rel(100 + i, { name: 'Sentiero dei tre paesi Julius Kugy', network: 'iwn', distance: '720' }, 50)),
    ]
    const fams = groupFamilies(evaluateAll(rels))
    expect(fams.filter(f => f.verdict === 'ammesso')).toHaveLength(2)
    const fr = fams.find(f => f.key === 'via francigena')!
    expect(fr.name).toBe('Via Francigena')
    expect(fr.members).toBe(5)
    expect(fr.relationIds).toHaveLength(5)
  })

  it('un cammino fatto solo di tappe a sigla (Via Alpina) finisce da rivedere, non ammesso', () => {
    const rels = Array.from({ length: 8 }, (_, i) => rel(200 + i, { name: `Via Alpina Red R${100 + i}`, network: 'iwn' }, 30))
    const fam = groupFamilies(evaluateAll(rels))[0]
    expect(fam.key).toBe('via alpina')
    expect(fam.verdict).toBe('da_rivedere')
    expect(fam.stageRelations).toBe(8)
  })
})

describe('controllo Italia', () => {
  const comuni = [{ lat: 45.0, lon: 7.0 }, { lat: 42.0, lon: 12.5 }]
  const find = buildNearestFinder(comuni)

  it('trova il comune più vicino', () => {
    expect(find(42.0, 12.5)).toBeLessThan(1)
    expect(find(42.1, 12.5)).toBeGreaterThan(8)
    expect(find(42.1, 12.5)).toBeLessThan(14)
  })

  it('scarta il centro lontano dall\'Italia, rivede quello al confine, tiene quello dentro', () => {
    const mk = (id: number, lat: number, lon: number) => rel(id, { name: 'Via Francigena', network: 'iwn', distance: '900', wikidata: 'Q1' }, 100, [1, 2, 3, 4])
    const rels = [
      { ...mk(1, 0, 0), center: { lat: 42.0, lon: 12.5 } },
      { ...mk(2, 0, 0), center: { lat: 42.1, lon: 12.9 } },
      { ...mk(3, 0, 0), center: { lat: 47.0, lon: 14.0 } },
    ]
    const res = applyCountryCheck(evaluateAll(rels), find)
    const by = new Map(res.map(r => [r.id, r]))
    expect(by.get(1)?.verdict).toBe('ammesso')
    expect(by.get(3)?.verdict).toBe('scartato')
    expect(by.get(3)?.reasons.join(' ')).toContain('fuori Italia')
  })
})
