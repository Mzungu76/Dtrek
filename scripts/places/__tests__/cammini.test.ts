import { describe, expect, it } from 'vitest'
import { clipToBbox, polylineLengthM, simplifyPolyline, stitchWays, trimToEndpoints, type LatLon } from '../../../lib/cammini/geometry'
import { parseTappaEndpoints, parseTappaNumber, splitIntoTappe } from '../../../lib/cammini/tappe'
import { buildCammino, camminoToPlaceCandidate, type OverpassRelation } from '../cammini/build'
import type { CamminoConfig } from '../cammini/config'
import { overpassQuery } from '../cammini/fetch'

// Linea nord→sud lungo un meridiano: 0.001° di latitudine ≈ 111 m.
function meridian(latFrom: number, latTo: number, lon = 12): LatLon[] {
  const pts: LatLon[] = []
  const step = latFrom > latTo ? -0.001 : 0.001
  for (let lat = latFrom; step < 0 ? lat >= latTo : lat <= latTo; lat = Math.round((lat + step) * 1e6) / 1e6) pts.push([lat, lon])
  return pts
}

const config: CamminoConfig = {
  id: 'test', name: 'Cammino di prova', nameRegex: 'Prova', excludeNameRegex: 'del Sud', region: 'Lazio',
  bbox: [41.0, 11.9, 43.0, 12.1],
  start: { name: 'Nord', lat: 42.5, lon: 12 }, end: { name: 'Sud', lat: 41.5, lon: 12 },
  theme: 'religioso',
}

function way(ref: number, line: LatLon[]) {
  return { type: 'way' as const, ref, geometry: line.map(([lat, lon]) => ({ lat, lon })) }
}

describe('geometria dei cammini', () => {
  it('stitchWays ricompone way disordinate e invertite in una sola catena', () => {
    const a = meridian(42.5, 42.3), b = meridian(42.3, 42.1), c = meridian(42.1, 41.9)
    const chains = stitchWays([c, [...a].reverse(), b])
    expect(chains).toHaveLength(1)
    expect(polylineLengthM(chains[0])).toBeCloseTo(polylineLengthM([...a, ...b.slice(1), ...c.slice(1)]), -1)
  })

  it('stitchWays non fabbrica salti: un buco oltre la tolleranza dà due catene', () => {
    expect(stitchWays([meridian(42.5, 42.4), meridian(42.0, 41.9)])).toHaveLength(2)
  })

  it('clipToBbox tiene solo i tratti interni, anche se la linea esce e rientra', () => {
    const line: LatLon[] = [[42, 12], [42.1, 12], [45, 12], [42.2, 12], [42.3, 12]]
    expect(clipToBbox(line, [41, 11.9, 43, 12.1])).toHaveLength(2)
  })

  it('simplifyPolyline riduce i punti allineati agli estremi', () => {
    expect(simplifyPolyline(meridian(42.5, 42.0), 10)).toHaveLength(2)
  })
})

describe('trimToEndpoints', () => {
  const line = meridian(42.8, 41.6)
  it('taglia ciò che sta oltre gli estremi dichiarati', () => {
    const r = trimToEndpoints(line, { lat: 42.5, lon: 12 }, { lat: 41.9, lon: 12 })
    expect(r.line[0][0]).toBeCloseTo(42.5, 2)
    expect(r.line[r.line.length - 1][0]).toBeCloseTo(41.9, 2)
    expect(r.trimmedStartM).toBeCloseTo(33_300, -3)
  })
  it('non taglia un capo se l\'estremo è lontano dalla linea', () => {
    const r = trimToEndpoints(line, { lat: 42.5, lon: 13 }, { lat: 41.9, lon: 12 })
    expect(r.trimmedStartM).toBe(0)
    expect(r.line[r.line.length - 1][0]).toBeCloseTo(41.9, 2)
  })
})

describe('nomi di tappa', () => {
  it('estrae numero e estremi', () => {
    expect(parseTappaNumber('Via Francigena – Tappa 12: Viterbo - Sutri')).toBe(12)
    expect(parseTappaNumber('Senza numero', '7')).toBe(7)
    expect(parseTappaNumber('Senza numero')).toBeNull()
    expect(parseTappaEndpoints('Via Francigena – Tappa 12: Viterbo - Sutri')).toEqual({ from: 'Viterbo', to: 'Sutri' })
    expect(parseTappaEndpoints('Tappa 3')).toBeNull()
  })
})

describe('splitIntoTappe', () => {
  const line = meridian(42.5, 41.6) // ~100 km
  const total = polylineLengthM(line)

  it('copre tutta la linea senza buchi e rispetta la finestra di lunghezza', () => {
    const tappe = splitIntoTappe(line, [])
    expect(tappe.reduce((s, t) => s + t.lengthM, 0)).toBeCloseTo(total, -1)
    for (const t of tappe.slice(0, -1)) {
      expect(t.lengthM).toBeGreaterThanOrEqual(12_000)
      expect(t.lengthM).toBeLessThanOrEqual(28_000)
      expect(t.endsAtAnchor).toBe(false)
    }
    expect(tappe.map(t => t.ordinal)).toEqual(tappe.map((_, i) => i + 1))
  })

  it('chiude la tappa in un borgo vicino al target e lo riporta', () => {
    // ~21 km dalla partenza: dentro la finestra [12, 28] e vicino ai 20 km di target.
    const borgo = { id: 'b1', name: 'Borgo di prova', lat: 42.31, lon: 12.0005, population: 3000 }
    const tappe = splitIntoTappe(line, [borgo])
    expect(tappe[0].toName).toBe('Borgo di prova')
    expect(tappe[0].toAnchorId).toBe('b1')
    expect(tappe[0].endsAtAnchor).toBe(true)
    expect(tappe[1].fromName).toBe('Borgo di prova')
  })

  it('ignora i borghi lontani dalla linea o troppo piccoli', () => {
    const far = { id: 'f', name: 'Lontano', lat: 42.31, lon: 12.05, population: 5000 }
    const tiny = { id: 't', name: 'Minuscolo', lat: 42.31, lon: 12, population: 10 }
    const tappe = splitIntoTappe(line, [far, tiny])
    expect(tappe.some(t => t.toAnchorId)).toBe(false)
  })

  it('una linea più corta del massimo è una sola tappa', () => {
    expect(splitIntoTappe(meridian(42.5, 42.4), [])).toHaveLength(1)
  })
})

describe('buildCammino', () => {
  const stage = (id: number, n: number, from: string, to: string, line: LatLon[]): OverpassRelation => ({
    type: 'relation', id,
    tags: { route: 'hiking', name: `Cammino di Prova – Tappa ${n}: ${from} - ${to}` },
    members: [way(id * 10, line.slice(0, Math.floor(line.length / 2) + 1)), way(id * 10 + 1, [...line.slice(Math.floor(line.length / 2))].reverse())],
  })

  it('usa le tappe ufficiali, in ordine di numero e orientate in continuità', () => {
    const s1 = stage(1, 1, 'A', 'B', meridian(42.5, 42.3))
    const s2 = stage(2, 2, 'B', 'C', meridian(42.3, 42.1))
    const s3 = stage(3, 3, 'C', 'D', meridian(42.1, 41.9))
    const s4 = stage(4, 4, 'D', 'E', meridian(41.9, 41.7))
    const main: OverpassRelation = {
      type: 'relation', id: 99, tags: { route: 'hiking', name: 'Cammino di Prova', ref: 'CP', website: 'https://example.org' },
      members: [4, 2, 1, 3].map(ref => ({ type: 'relation' as const, ref })),
    }
    // Ordine volutamente scombinato: l'input di Overpass non è ordinato.
    const built = buildCammino([s3, main, s1, s4, s2], config, [])
    expect(built.tappeSource).toBe('official')
    expect(built.tappe.map(t => t.fromName)).toEqual(['A', 'B', 'C', 'D'])
    expect(built.tappe.map(t => t.officialRelationId)).toEqual([1, 2, 3, 4])
    // Tutte orientate nord→sud (verso della partenza): la latitudine scende lungo la linea.
    expect(built.line[0][0]).toBeGreaterThan(built.line[built.line.length - 1][0])
    expect(built.lengthM).toBeCloseTo(polylineLengthM(meridian(42.5, 41.7)), -2)
  })

  it('senza tappe numerate le calcola, tenendo la catena più lunga', () => {
    const rel: OverpassRelation = {
      type: 'relation', id: 5, tags: { route: 'hiking', name: 'Cammino di Prova' },
      members: [way(1, meridian(42.5, 42.0)), way(2, meridian(42.0, 41.6)), way(3, meridian(42.45, 42.4, 12.05))],
    }
    const built = buildCammino([rel], config, [])
    expect(built.tappeSource).toBe('computed')
    expect(built.tappe.length).toBeGreaterThan(2)
    expect(built.tappe.every(t => t.source === 'computed')).toBe(true)
    expect(built.diagnostics.join(' ')).toContain('Scartate 1 catene minori')
  })

  it('taglia agli estremi, nomina i capi dalla config e non prende la descrizione da una variante', () => {
    const variante: OverpassRelation = {
      type: 'relation', id: 1, tags: { route: 'hiking', name: 'Cammino di Prova (variante)', description: 'This variant uses the Via Amerina.', website: 'https://variante.example' },
      members: [way(1, meridian(42.5, 42.45, 12.03))],
    }
    const principale: OverpassRelation = {
      type: 'relation', id: 2, tags: { route: 'hiking', name: 'Cammino di Prova', ref: 'CP', website: 'https://principale.example' },
      members: [way(2, meridian(42.7, 41.5))],
    }
    const cfg = { ...config, start: { name: 'Nord', lat: 42.5, lon: 12, anchorName: 'Nord' }, end: { name: 'Sud (centro)', lat: 41.7, lon: 12, anchorName: 'Sud' } }
    const anchors = [{ id: 'n', name: 'Nord', lat: 60, lon: 12 }, { id: 's', name: 'Sud', lat: 60, lon: 13 }]
    const built = buildCammino([variante, principale], cfg, anchors)
    expect(built.line[0][0]).toBeCloseTo(42.5, 2)
    expect(built.tappe[0].fromName).toBe('Nord')
    expect(built.tappe[0].fromAnchorId).toBe('n')
    expect(built.tappe[built.tappe.length - 1].toName).toBe('Sud (centro)')
    expect(built.tappe[built.tappe.length - 1].toAnchorId).toBe('s')
    const c = camminoToPlaceCandidate(built)
    expect(c.officialUrl).toBe('https://principale.example')
    expect(c.description ?? '').not.toContain('Amerina')
  })

  it('scarta le relazioni escluse per nome e quelle non a piedi', () => {
    const sud: OverpassRelation = { type: 'relation', id: 6, tags: { route: 'hiking', name: 'Cammino di Prova del Sud' }, members: [way(1, meridian(42.5, 42.0))] }
    const bici: OverpassRelation = { type: 'relation', id: 7, tags: { route: 'bicycle', name: 'Cammino di Prova' }, members: [way(2, meridian(42.5, 42.0))] }
    expect(() => buildCammino([sud, bici], config, [])).toThrow(/Nessuna relazione/)
  })

  it('ignora i nodi null della geometria fuori dal bbox di Overpass', () => {
    const rel: OverpassRelation = {
      type: 'relation', id: 8, tags: { route: 'hiking', name: 'Cammino di Prova' },
      members: [{ type: 'way', ref: 1, geometry: [null, ...meridian(42.5, 42.0).map(([lat, lon]) => ({ lat, lon })), null] }],
    }
    expect(buildCammino([rel], config, []).line.length).toBeGreaterThan(100)
  })

  it('produce un candidato "cammino" con provenienza e senza dati fabbricati', () => {
    const rel: OverpassRelation = {
      type: 'relation', id: 5, tags: { route: 'hiking', name: 'Cammino di Prova', website: 'https://example.org' },
      members: [way(1, meridian(42.5, 41.6))],
    }
    const c = camminoToPlaceCandidate(buildCammino([rel], config, []))
    expect(c.metaType).toBe('cammino')
    expect(c.source).toBe('osm')
    expect(c.sourceId).toBe('cammino/test')
    expect(c.officialUrl).toBe('https://example.org')
    expect(c.confidence).toBeLessThan(0.9) // tappe calcolate = meno affidabili delle ufficiali
    expect(c.latitude).toBeGreaterThan(41.6)
    expect(c.latitude).toBeLessThan(42.5)
  })
})

describe('risposta Overpass leggera (relazioni senza geometria + way a parte)', () => {
  it('ricollega le way ai membri per id e produce lo stesso risultato', () => {
    const line = meridian(42.5, 41.6)
    const rel: OverpassRelation = {
      type: 'relation', id: 5, tags: { route: 'hiking', name: 'Cammino di Prova' },
      members: [{ type: 'way', ref: 11 }, { type: 'way', ref: 12 }, { type: 'way', ref: 13 }],
    }
    const mid = Math.floor(line.length / 2)
    const ways = [
      { type: 'way' as const, id: 11, geometry: line.slice(0, mid + 1).map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way' as const, id: 12, geometry: line.slice(mid).map(([lat, lon]) => ({ lat, lon })) },
    ]
    const built = buildCammino([rel, ...ways], config, [])
    expect(built.lengthM).toBeCloseTo(polylineLengthM(line), -2)
    expect(built.diagnostics[0]).toContain('2 way con geometria')
  })
})

describe('overpassQuery', () => {
  it('chiede solo cammini a piedi, mai ciclabili', () => {
    const q = overpassQuery(config)
    expect(q).toContain('hiking|foot')
    expect(q).not.toMatch(/bicycle|mtb/)
    expect(q).toContain('41,11.9,43,12.1')
    // Mai la geometria dell'intera relazione: è ciò che mandava in timeout la prima versione.
    expect(q).not.toMatch(/\.all out geom|\.main out geom|out geom\(/)
  })
})

import { discoveryQuery, nameSearchQuery, toDiscoveryRelations, toMarkdown } from '../cammini/discover'
import { matchRegistry, REGISTRY } from '../../../lib/cammini/registry'
import { evaluateAll, groupFamilies } from '../../../lib/cammini/discovery'

describe('discover (query e parsing)', () => {
  it('la query chiede solo cammini a piedi, senza geometria', () => {
    const q = discoveryQuery(41.2, 43.8)
    expect(q).toContain('hiking|foot')
    expect(q).not.toMatch(/bicycle|mtb|geom/)
    expect(q).toContain('out body center;')
  })

  it('conta way e figli dai membri e deduplica per id', () => {
    const els = [
      { type: 'relation', id: 1, tags: { name: 'A' }, members: [{ type: 'way', ref: 9 }, { type: 'way', ref: 8 }, { type: 'relation', ref: 2 }] },
      { type: 'relation', id: 1, tags: { name: 'A' }, members: [] },
    ]
    const rels = toDiscoveryRelations(els)
    expect(rels).toHaveLength(1)
    expect(rels[0].wayMembers).toBe(2)
    expect(rels[0].childIds).toEqual([2])
  })

  it('la tabella markdown riporta ammessi e conteggi', () => {
    const rels = toDiscoveryRelations([
      { type: 'relation', id: 5, tags: { name: 'Via Francigena', network: 'iwn', distance: '900', wikidata: 'Q1' }, members: [{ type: 'relation', ref: 6 }, { type: 'relation', ref: 7 }, { type: 'relation', ref: 8 }] },
    ])
    const res = evaluateAll(rels)
    const md = toMarkdown(res, groupFamilies(res))
    expect(md).toContain('ammessi **1**')
    expect(md).toContain('relation/5')
  })
})

describe('registro nella scoperta', () => {
  it('la ricerca per nome è una sola query, a piedi, con i nomi escapati', () => {
    const q = nameSearchQuery(REGISTRY.filter(e => e.id === 'cammino-sant-antonio' || e.id === 'cammino-celeste'))
    expect(q).toContain('hiking|foot')
    expect(q).toContain("Cammino di Sant'Antonio|Cammino Celeste")
    expect(q).not.toMatch(/bicycle|mtb/)
    expect(q).toContain('out body center;')
  })

  it('la tabella markdown riporta cosa è NON TROVATO', () => {
    const rels = toDiscoveryRelations([{ type: 'relation', id: 7, tags: { name: 'Cammino Celeste', network: 'nwn', distance: '90' }, members: [{ type: 'way', ref: 1 }] }])
    const res = evaluateAll(rels)
    const fams = groupFamilies(res)
    const md = toMarkdown(res, fams, matchRegistry(fams))
    expect(md).toContain('Registro dei cammini approvati (1/')
    expect(md).toContain('**NON TROVATO**')
  })
})
