import { describe, expect, it } from 'vitest'
import { polylineLengthM, type LatLon } from '../../../lib/cammini/geometry'
import { REGISTRY, type RegistryEntry } from '../../../lib/cammini/registry'
import type { OverpassRelation } from '../cammini/build'
import { assessQuality, buildFromRegistry, stageLabel, type WayGeometry } from '../cammini/buildRegistry'
import { canonicalizeEndpointNames, orientNamesByGeometry, propagateSharedEndpoints, type TappaDraft } from '../../../lib/cammini/tappe'
import { relationsQuery, waysQuery } from '../cammini/import-registry'

// Linea nord→sud lungo un meridiano: 0.001° di latitudine ≈ 111 m.
function meridian(latFrom: number, latTo: number, lon = 12): LatLon[] {
  const pts: LatLon[] = []
  for (let lat = latFrom; lat >= latTo; lat = Math.round((lat - 0.001) * 1e6) / 1e6) pts.push([lat, lon])
  return pts
}
const geom = (line: LatLon[]): WayGeometry => line.map(([lat, lon]) => ({ lat, lon }))
const entry = (id: string): RegistryEntry => REGISTRY.find(e => e.id === id)!
const italian = (lat: number) => lat < 44

// Costruisce relazioni "Tappa n" di ~25 km ciascuna, ognuna con due way (ids univoci).
function stages(entryName: string, startLat: number, count: number, startNumber = 1, lon = 12, idBase = 0) {
  const rels: OverpassRelation[] = []
  const ways = new Map<number, WayGeometry>()
  let wayId = idBase + startNumber * 1000 + Math.round(lon * 10)
  for (let i = 0; i < count; i++) {
    const from = startLat - i * 0.225, to = from - 0.225
    const line = meridian(from, to, lon)
    const mid = Math.floor(line.length / 2)
    const a = wayId++, b = wayId++
    ways.set(a, geom(line.slice(0, mid + 1)))
    ways.set(b, geom([...line.slice(mid)].reverse())) // verso invertito di proposito
    rels.push({
      type: 'relation', id: idBase + 5000 + startNumber * 100 + i + Math.round(lon * 10),
      tags: { route: 'hiking', name: `${entryName} - Tappa ${startNumber + i}: Paese ${i} - Paese ${i + 1}` },
      members: [{ type: 'way', ref: a }, { type: 'way', ref: b }],
    })
  }
  return { rels, ways }
}

describe('buildFromRegistry', () => {
  it('ordina le tappe ufficiali lungo il percorso, anche se arrivano scombinate', () => {
    const { rels, ways } = stages('Cammino di San Benedetto', 43.0, 6)
    const parent: OverpassRelation = {
      type: 'relation', id: 1, tags: { route: 'hiking', name: 'Cammino di San Benedetto', ref: 'CSB', website: 'https://csb.example' },
      members: rels.map(r => ({ type: 'relation' as const, ref: r.id })),
    }
    const shuffled = [rels[3], parent, rels[0], rels[5], rels[2], rels[1], rels[4]]
    const [res] = buildFromRegistry(entry('cammino-san-benedetto'), shuffled, ways, [], { isItalian: italian })
    expect(res.built.tappe).toHaveLength(6)
    expect(res.built.tappeSource).toBe('official')
    // Dal nord al sud: la latitudine scende e i nomi "Paese i" salgono in ordine.
    expect(res.built.tappe.map(t => t.fromName)).toEqual(['Paese 0', 'Paese 1', 'Paese 2', 'Paese 3', 'Paese 4', 'Paese 5'])
    expect(res.built.line[0][0]).toBeGreaterThan(res.built.line[res.built.line.length - 1][0])
    expect(res.quality.status).toBe('pronto')
    expect(res.built.lengthM).toBeCloseTo(polylineLengthM(meridian(43.0, 43.0 - 6 * 0.225)), -3)
  })

  it('i numeri di tappa che ripartono da 1 per regione non rompono l\'ordine', () => {
    const north = stages('Via Francigena', 45.0, 3, 1, 12)
    const south = stages('Via Francigena', 45.0 - 3 * 0.225, 3, 1, 12, 500000) // di nuovo "Tappa 1..3"
    const all = [...south.rels, ...north.rels]
    const ways = new Map([...north.ways, ...south.ways])
    const [res] = buildFromRegistry({ ...entry('via-francigena'), splitAt: undefined }, all, ways, [], { isItalian: () => true })
    expect(res.built.tappe).toHaveLength(6)
    const lats = res.built.tappe.map(t => t.polyline[0][0])
    expect([...lats].sort((a, b) => b - a)).toEqual(lats)
  })

  it('scarta i pezzi fuori dall\'Italia', () => {
    const it = stages('Alpe Adria Trail', 43.0, 4, 1, 12)
    const at = stages('Alpe Adria Trail', 47.0, 4, 5, 12) // austriaci: lat 47 → non italiani
    const ways = new Map([...it.ways, ...at.ways])
    const [res] = buildFromRegistry(entry('alpe-adria-trail'), [...it.rels, ...at.rels], ways, [], { isItalian: italian })
    expect(res.built.tappe).toHaveLength(4)
    expect(res.built.diagnostics.join(' ')).toContain('fuori dall\'Italia')
  })

  it('regioni senza tappe numerate diventano tappe calcolate (cammino misto)', () => {
    const off = stages('Via Francigena', 43.0, 4, 1)
    // Una relazione regionale senza tappe, dopo le ufficiali: ~60 km di way proprie.
    const reg = meridian(43.0 - 4 * 0.225, 43.0 - 4 * 0.225 - 0.55)
    const regWays = new Map<number, WayGeometry>([[9001, geom(reg)]])
    const regional: OverpassRelation = { type: 'relation', id: 9000, tags: { route: 'hiking', name: 'Via Francigena - 08 Campania' }, members: [{ type: 'way', ref: 9001 }] }
    const ways = new Map([...off.ways, ...regWays])
    const [res] = buildFromRegistry({ ...entry('via-francigena'), splitAt: undefined }, [...off.rels, regional], ways, [], { isItalian: () => true })
    expect(res.built.tappeSource).toBe('mixed')
    expect(res.quality.officialTappe).toBe(4)
    expect(res.quality.computedTappe).toBeGreaterThanOrEqual(2)
  })

  it('divide la Via Francigena a Roma in due cammini', () => {
    const e = { ...entry('via-francigena'), splitAt: { name: 'Roma', lat: 42.0, lon: 12, before: 'via-francigena', after: 'via-francigena-sud' } }
    const { rels, ways } = stages('Via Francigena', 43.0, 8, 1) // da 43.0 a 41.2: passa da 42.0
    const res = buildFromRegistry(e, rels, ways, [], { isItalian: () => true })
    expect(res.map(r => r.built.config.id)).toEqual(['via-francigena', 'via-francigena-sud'])
    expect(res[0].built.tappe.length + res[1].built.tappe.length).toBe(8)
    expect(res[0].built.tappe[0].ordinal).toBe(1)
    expect(res[1].built.tappe[0].ordinal).toBe(1)
    expect(res[1].built.config.name).toBe('Via Francigena del Sud')
  })

  it('non cuce tratti lontani: restano fuori e il cammino va a revisione', () => {
    const a = stages('Cammino di San Benedetto', 43.0, 3, 1)
    const b = stages('Cammino di San Benedetto', 41.0, 3, 4) // 100 km più a sud: nessun collegamento
    const ways = new Map([...a.ways, ...b.ways])
    const [res] = buildFromRegistry(entry('cammino-san-benedetto'), [...a.rels, ...b.rels], ways, [], { isItalian: italian })
    expect(res.built.tappe).toHaveLength(3)
    expect(res.quality.status).toBe('da_rivedere')
    expect(res.quality.connected).toBe(false)
  })

  it('senza alcun tracciato utilizzabile lancia un errore chiaro', () => {
    expect(() => buildFromRegistry(entry('cammino-san-benedetto'), [], new Map(), [], { isItalian: italian })).toThrow(/nessun tracciato/)
  })
})

describe('assessQuality', () => {
  const t = (km: number, named = true) => ({
    ordinal: 1, name: 'T', lengthM: km * 1000, polyline: [[0, 0], [0, 0.001]] as LatLon[], source: 'official' as const,
    ...(named ? { fromName: 'A', toName: 'B' } : {}),
  })
  it('pronto con tappe plausibili e collegate', () => {
    expect(assessQuality([t(20), t(22), t(18), t(25)], true, 0).status).toBe('pronto')
  })
  it('da rivedere con tappe troppo lunghe o corte, o poche', () => {
    expect(assessQuality([t(20), t(80), t(90), t(18)], true, 0).reasons.join(' ')).toContain('oltre 45 km')
    expect(assessQuality([t(20), t(1), t(1), t(18)], true, 0).reasons.join(' ')).toContain('sotto 2 km')
    expect(assessQuality([t(20), t(22)], true, 0).reasons.join(' ')).toContain('solo 2 tappe')
  })
})

describe('query di import', () => {
  it('solo a piedi, mai ciclabili; le way si chiedono per id', () => {
    const q = relationsQuery(entry('cammino-sant-antonio'))
    expect(q).toContain('"route"="hiking"')
    expect(q).toContain('"route"="foot"')
    expect(q).not.toMatch(/bicycle|mtb/)
    expect(q).toContain("Cammino di Sant'Antonio")
    expect(waysQuery([1, 2, 3])).toContain('way(id:1,2,3)')
  })
})

describe('capi delle tappe', () => {
  const t = (from: string | undefined, to: string | undefined, line: LatLon[]): TappaDraft => ({
    ordinal: 1, name: 'T', fromName: from, toName: to, lengthM: polylineLengthM(line), polyline: line, source: 'official',
  })

  it('i nomi "A - B" si orientano sul verso in cui si cammina, usando la posizione dei paesi', () => {
    // La relazione dice "Paese Sud - Paese Nord" ma la linea è messa in fila da nord a sud.
    const tappa = t('Paese Sud', 'Paese Nord', meridian(43.0, 42.8))
    const anchors = [
      { id: 'n', name: 'Paese Nord', lat: 43.0, lon: 12 },
      { id: 's', name: 'Paese Sud', lat: 42.8, lon: 12 },
    ]
    orientNamesByGeometry([tappa], anchors)
    expect(tappa.fromName).toBe('Paese Nord')
    expect(tappa.toName).toBe('Paese Sud')
  })

  it('non scambia se i nomi sono già nel verso giusto', () => {
    const tappa = t('Paese Nord', 'Paese Sud', meridian(43.0, 42.8))
    orientNamesByGeometry([tappa], [{ id: 'n', name: 'Paese Nord', lat: 43.0, lon: 12 }, { id: 's', name: 'Paese Sud', lat: 42.8, lon: 12 }])
    expect(tappa.fromName).toBe('Paese Nord')
  })

  it('senza paesi nel catalogo usa il vicino: due tappe che finiscono nello stesso paese sono una girata', () => {
    const a = t('A', 'B', meridian(43.0, 42.8))
    const b = t('C', 'B', meridian(42.8, 42.6)) // dovrebbe essere B → C
    orientNamesByGeometry([a, b], [])
    expect(b.fromName).toBe('B')
    expect(b.toName).toBe('C')
  })

  it('un capo senza nome prende quello dell\'altro lato della giunzione; se nessuno lo sa resta senza', () => {
    const a = t('Collepardo', undefined, meridian(43.0, 42.8))
    const b = t('Vico', 'Arpino', meridian(42.8, 42.6))
    propagateSharedEndpoints([a, b])
    expect(a.toName).toBe('Vico')
    const c = t('X', undefined, meridian(43.0, 42.8)), d = t(undefined, 'Y', meridian(42.8, 42.6))
    propagateSharedEndpoints([c, d])
    expect(c.toName).toBeUndefined()
    expect(d.fromName).toBeUndefined()
  })

  it('usa i tag from/to della relazione e toglie il nome del cammino dal nome della tappa', () => {
    expect(stageLabel('Cammino di San Benedetto - Tappa 01')).toBe('Tappa 01')
    expect(stageLabel('Tappa 5')).toBe('Tappa 5')
    const { rels, ways } = stages('Cammino di San Benedetto', 43.0, 3)
    // Tolgo i nomi "A - B" dal titolo e li metto nei tag from/to.
    rels.forEach((r, i) => { r.tags = { route: 'hiking', name: `Cammino di San Benedetto - Tappa 0${i + 1}`, from: `Da ${i}`, to: `A ${i}` } })
    const [res] = buildFromRegistry(entry('cammino-san-benedetto'), rels, ways, [], { isItalian: italian })
    expect(res.built.tappe.map(x => x.name)).toEqual(['Tappa 01', 'Tappa 02', 'Tappa 03'])
    expect(res.built.tappe.every(x => x.fromName && x.toName)).toBe(true)
  })
})

describe('refusi nei nomi dei capi', () => {
  const t = (from: string, to: string): TappaDraft => ({
    ordinal: 1, name: 'T', fromName: from, toName: to, lengthM: 20000, polyline: meridian(43.0, 42.8), source: 'official',
  })
  const anchors = [
    { id: 'a', name: 'Arpino', lat: 43.0, lon: 12 },
    { id: 'r', name: 'Roccasecca', lat: 42.8, lon: 12 },
    { id: 'lontano', name: 'Arpinello', lat: 30.0, lon: 12 },
  ]

  it('corregge "Aripino" in Arpino usando il paese vicino, e ne prende il collegamento', () => {
    const x = t('Aripino', 'Roccasecca')
    canonicalizeEndpointNames([x], anchors)
    expect(x.fromName).toBe('Arpino')
    expect(x.fromAnchorId).toBe('a')
    expect(x.toAnchorId).toBe('r')
  })

  it('non cambia un nome diverso da ogni paese vicino, né usa paesi lontani', () => {
    const x = t('Montecassio', 'Roccasecca')
    canonicalizeEndpointNames([x], anchors)
    expect(x.fromName).toBe('Montecassio')
    const y = t('Arpinello', 'Roccasecca') // esiste solo a 1500 km: non si usa
    canonicalizeEndpointNames([y], anchors)
    expect(y.fromName).toBe('Arpinello')
  })
})
