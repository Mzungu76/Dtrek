import { describe, expect, it } from 'vitest'
import { evaluateAll, groupFamilies, type DiscoveryRelation } from '../cammini/discovery'
import { applyRegistry, matchRegistry, REGISTRY } from '../cammini/registry'

const rel = (id: number, name: string, network = 'nwn', wayMembers = 40, childIds: number[] = []): DiscoveryRelation =>
  ({ id, tags: { name, network, distance: '120' }, wayMembers, childIds })

describe('registro dei cammini', () => {
  it('ha id unici e le tre decisioni confermate', () => {
    const ids = REGISTRY.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Reti: Via Alpina, GTA, Romea Strata (+ Sentiero Italia, 7000 km).
    expect(REGISTRY.filter(e => e.structure === 'rete').map(e => e.id).sort()).toEqual(['gta', 'romea-strata', 'sentiero-italia', 'via-alpina'])
    // La Francigena si divide a Roma in due cammini.
    expect(REGISTRY.find(e => e.id === 'via-francigena')?.splitAt).toMatchObject({ before: 'via-francigena', after: 'via-francigena-sud' })
    // Via Romea e Romea Strata vanno verificate sulla geometria.
    expect(REGISTRY.find(e => e.id === 'via-romea')?.overlapsWith).toBe('romea-strata')
    // Le Alte Vie chiudono le tappe nei rifugi.
    expect(REGISTRY.filter(e => e.id.startsWith('alta-via')).every(e => e.anchors === 'rifugi')).toBe(true)
  })

  it('i nomi veri del secondo giro corrispondono alla voce giusta, una sola', () => {
    const names: [string, string][] = [
      ['Via Francigena - 07 Lazio', 'via-francigena'],
      ["Il Cammino di Sant'Antonio: Opzione Tappa 2", 'cammino-sant-antonio'],
      ['Via degli Abati', 'via-degli-abati'], ['Via Abati Variante Farini', 'via-degli-abati'],
      ['Via di Francesco - Via di Roma', 'via-di-francesco'], ['Via di Francesco - Via del Sud', 'via-di-francesco'],
      ['Cammino di Francesco', 'via-di-francesco'],
      ["Cammino d'Assisi, San Miniato - Assisi", 'cammino-di-assisi'],
      ['Cammino Materano - Via Peuceta', 'cammino-materano'],
      ['Alta via n. 1 delle Dolomiti', 'alta-via-1-dolomiti'], ['Alta via n. 6 delle Dolomiti', 'alta-via-6-dolomiti'],
      ['Romea Strata in Italia', 'romea-strata'], ['Via Romea - Tratto Lazio', 'via-romea'],
      ['Via Alpina Red R103', 'via-alpina'], ['GTA: Balme - Usseglio', 'gta'],
      ['Sentiero Italia - Piemonte E00', 'sentiero-italia'],
      ['Via Aurelia, Menton - Roquebrune', 'via-aurelia'],
      ["Il Cammino di San Jacopo", 'cammino-san-jacopo'],
    ]
    for (const [name, expected] of names) {
      const fams = groupFamilies(evaluateAll([rel(1, name)]))
      const hits = REGISTRY.filter(e => fams.some(f => e.match.test(f.key)))
      expect(hits.map(h => h.id), name).toEqual([expected])
    }
  })

  it('non confonde le Alte Vie fra loro (n. 1 non è n. 10)', () => {
    const f = groupFamilies(evaluateAll([rel(1, 'Alta Via n. 10 - Garda Brenta')]))
    expect(REGISTRY.filter(e => f.some(x => e.match.test(x.key)))).toHaveLength(0)
  })

  it('matchRegistry distingue trovato / solo da rivedere / non trovato; applyRegistry ammette', () => {
    const fams = groupFamilies(evaluateAll([
      rel(1, 'Cammino Celeste', 'nwn', 1, [1, 2, 3, 4]),
      rel(2, 'Cammino Tuscia', 'rwn', 1),   // rwn senza km: punteggio basso, "da rivedere"
    ]))
    applyRegistry(fams)
    const res = matchRegistry(fams)
    const by = new Map(res.map(r => [r.entry.id, r]))
    expect(by.get('cammino-celeste')?.status).toBe('trovato')
    expect(by.get('cammino-tuscia')?.status).toBe('trovato') // ammesso per decisione umana
    expect(by.get('via-spluga')?.status).toBe('non_trovato')
    expect(fams.every(f => f.verdict === 'ammesso')).toBe(true)
    expect(fams[0].registryId).toBeTruthy()
  })

  it('una famiglia con centro fuori Italia non viene ammessa dal registro', () => {
    const r = evaluateAll([rel(1, 'Via Aurelia')])
    r[0].italyDistanceKm = 120
    const fams = groupFamilies(r)
    applyRegistry(fams)
    expect(fams[0].inItaly).toBe('no')
    expect(fams[0].verdict).not.toBe('ammesso')
  })
})
