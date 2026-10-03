import { describe, it, expect } from 'vitest'
import { parseOsmXml } from '../cammini/osmXml'

// Questo XML è l'output VERO di `osmium tags-filter --overwrite -o out.osm sample.pbf r/route=hiking,foot -f osm`
// (osmium-tool 1.16.0) su un file fatto a mano con una relazione "Cammino di Test" (route=hiking) che
// contiene una way propria più una sotto-relazione "Tappa 01" (route=foot) con un'altra way — verificato
// a mano prima di scrivere il parser, non indovinato.
const REAL_OSMIUM_OUTPUT = `<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6" generator="osmium/1.16.0">
  <node id="1" version="1" lat="42.74" lon="11.86"/>
  <node id="2" version="1" lat="42.7" lon="11.9"/>
  <node id="10" version="1" lat="42.71" lon="11.91"/>
  <node id="11" version="1" lat="42.72" lon="11.92"/>
  <way id="100" version="1">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="path"/>
  </way>
  <way id="101" version="1">
    <nd ref="10"/>
    <nd ref="11"/>
    <tag k="highway" v="path"/>
  </way>
  <relation id="2000" version="1">
    <member type="way" ref="101" role=""/>
    <tag k="type" v="route"/>
    <tag k="route" v="foot"/>
    <tag k="name" v="Tappa 01"/>
  </relation>
  <relation id="1000" version="1">
    <member type="way" ref="100" role=""/>
    <member type="relation" ref="2000" role=""/>
    <tag k="type" v="route"/>
    <tag k="route" v="hiking"/>
    <tag k="name" v="Cammino di Test"/>
  </relation>
</osm>
`

describe('parseOsmXml', () => {
  it('legge nodi, way e relazioni (anche annidate) dall\'output reale di osmium', () => {
    const { relations, ways } = parseOsmXml(REAL_OSMIUM_OUTPUT)
    expect(relations.map(r => r.id).sort()).toEqual([1000, 2000])
    const root = relations.find(r => r.id === 1000)!
    expect(root.tags).toEqual({ type: 'route', route: 'hiking', name: 'Cammino di Test' })
    expect(root.members).toEqual([
      { type: 'way', ref: 100 },
      { type: 'relation', ref: 2000 },
    ])
    expect(ways.get(100)).toEqual([{ lat: 42.74, lon: 11.86 }, { lat: 42.7, lon: 11.9 }])
    expect(ways.get(101)).toEqual([{ lat: 42.71, lon: 11.91 }, { lat: 42.72, lon: 11.92 }])
  })

  it('way con un nodo senza coordinate nota (riferimento rimasto fuori dall\'estratto) dà null, non un buco', () => {
    const xml = `<osm version="0.6">
  <node id="1" lat="1" lon="2"/>
  <way id="5"><nd ref="1"/><nd ref="999"/></way>
</osm>`
    const { ways } = parseOsmXml(xml)
    expect(ways.get(5)).toEqual([{ lat: 1, lon: 2 }, null])
  })

  it('decodifica le entità XML nei tag (nomi con & o apostrofi)', () => {
    const xml = `<osm version="0.6">
  <relation id="1"><tag k="name" v="Cammino dei &quot;Due Santuari&quot; &amp; dintorni"/></relation>
</osm>`
    const { relations } = parseOsmXml(xml)
    expect(relations[0].tags?.name).toBe('Cammino dei "Due Santuari" & dintorni')
  })

  it('nessuna relazione o way: liste vuote, non un errore', () => {
    expect(parseOsmXml('<osm version="0.6"></osm>')).toEqual({ relations: [], ways: new Map() })
  })
})
