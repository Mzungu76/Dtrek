import { describe, it, expect } from 'vitest'
import {
  extractDesignation, extractFeatureBlocks, extractGeometry, extractFlatProperties,
} from '@/lib/natura2000/natura2000Client'

// DTREK-AUDIT.md P1 #12 — natura2000Client.ts dichiara nel proprio commento di testa di non
// essere mai stato verificato contro una risposta reale (egress verso wms.pcn.minambiente.it
// bloccato dalla policy di rete anche in questo sandbox — stesso limite di prima). Queste fixture
// GML sono costruite a mano seguendo esattamente le convenzioni WFS 1.1.0/GML 3.1.1 già
// documentate nel modulo (featureMember singolo, wrapper featureMembers, posList con ordine
// lat/lon per URN CRS, coordinates legacy lon/lat, sic_zsc/zps come stringhe di designazione
// dirette) — verificano la coerenza interna del parser con le proprie assunzioni dichiarate, non
// sostituiscono una verifica contro il server reale.

const RING_POS_LIST = '41.0 12.0 41.0 12.1 41.1 12.1 41.1 12.0 41.0 12.0'
const HOLE_POS_LIST = '41.02 12.02 41.02 12.08 41.08 12.08 41.08 12.02 41.02 12.02'

function featureMemberXml(innerAttrs: string, geomXml: string): string {
  return `<gml:featureMember>
    <ms:aree_natura2000 gml:id="aree_natura2000.1">
      <ms:the_geom>${geomXml}</ms:the_geom>
      ${innerAttrs}
    </ms:aree_natura2000>
  </gml:featureMember>`
}

const SIMPLE_POLYGON = `<gml:MultiPolygon srsName="urn:ogc:def:crs:EPSG::4326"><gml:polygonMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${RING_POS_LIST}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:polygonMember></gml:MultiPolygon>`

describe('extractFeatureBlocks', () => {
  it('estrae un blocco per ogni gml:featureMember', () => {
    const xml = featureMemberXml('<ms:site_code>IT1234567</ms:site_code>', SIMPLE_POLYGON) +
      featureMemberXml('<ms:site_code>IT7654321</ms:site_code>', SIMPLE_POLYGON)
    const blocks = extractFeatureBlocks(xml, 'ms:aree_natura2000')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('IT1234567')
    expect(blocks[1]).toContain('IT7654321')
  })

  it('estrae dal wrapper gml:featureMembers (variante WFS 1.1.0)', () => {
    const xml = `<gml:featureMembers>
      <ms:aree_natura2000 gml:id="1"><ms:the_geom>${SIMPLE_POLYGON}</ms:the_geom><ms:site_code>IT0000001</ms:site_code></ms:aree_natura2000>
      <ms:aree_natura2000 gml:id="2"><ms:the_geom>${SIMPLE_POLYGON}</ms:the_geom><ms:site_code>IT0000002</ms:site_code></ms:aree_natura2000>
    </gml:featureMembers>`
    const blocks = extractFeatureBlocks(xml, 'ms:aree_natura2000')
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toContain('IT0000002')
  })

  it('ritorna un array vuoto per un FeatureCollection senza feature', () => {
    const xml = '<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" numberOfFeatures="0"/>'
    expect(extractFeatureBlocks(xml, 'ms:aree_natura2000')).toEqual([])
  })
})

describe('extractGeometry', () => {
  it('estrae un Polygon da gml:posList (ordine lat,lon URN → [lon,lat] GeoJSON)', () => {
    const geom = extractGeometry(SIMPLE_POLYGON)
    expect(geom).not.toBeNull()
    expect(geom!.type).toBe('Polygon')
    const ring = (geom as { type: 'Polygon'; coordinates: [number, number][][] }).coordinates[0]
    // Primo punto del posList: lat=41.0, lon=12.0 → atteso [lon, lat] = [12.0, 41.0]
    expect(ring[0]).toEqual([12.0, 41.0])
    expect(ring).toHaveLength(5) // anello chiuso, 4 vertici + ripetizione del primo
  })

  it('estrae anche il ring interno (foro) da gml:interior', () => {
    const xml = `<gml:Polygon>
      <gml:exterior><gml:LinearRing><gml:posList>${RING_POS_LIST}</gml:posList></gml:LinearRing></gml:exterior>
      <gml:interior><gml:LinearRing><gml:posList>${HOLE_POS_LIST}</gml:posList></gml:LinearRing></gml:interior>
    </gml:Polygon>`
    const geom = extractGeometry(xml)
    expect(geom!.type).toBe('Polygon')
    expect((geom as { coordinates: unknown[][] }).coordinates).toHaveLength(2)
  })

  it('supporta la sintassi legacy gml:coordinates (lon,lat già nell\'ordine giusto)', () => {
    const xml = '<gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>12.0,41.0 12.1,41.0 12.1,41.1 12.0,41.1 12.0,41.0</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon>'
    const geom = extractGeometry(xml)
    expect(geom!.type).toBe('Polygon')
    const ring = (geom as { coordinates: [number, number][][] }).coordinates[0]
    expect(ring[0]).toEqual([12.0, 41.0])
  })

  it('produce un MultiPolygon quando più gml:Polygon compaiono nella stessa feature', () => {
    const onePolygon = '<gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>' + RING_POS_LIST + '</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>'
    const xml = `<gml:MultiPolygon><gml:polygonMember>${onePolygon}</gml:polygonMember><gml:polygonMember>${onePolygon}</gml:polygonMember></gml:MultiPolygon>`
    const geom = extractGeometry(xml)
    expect(geom!.type).toBe('MultiPolygon')
    expect((geom as { coordinates: unknown[] }).coordinates).toHaveLength(2)
  })

  it('ritorna null se non c\'è alcun gml:Polygon nel blocco', () => {
    expect(extractGeometry('<ms:aree_natura2000><ms:site_code>IT1234567</ms:site_code></ms:aree_natura2000>')).toBeNull()
  })
})

describe('extractFlatProperties', () => {
  it('estrae solo campi con testo semplice, mai il campo geometria annidato', () => {
    const block = featureMemberXml('<ms:site_code>IT1234567</ms:site_code><ms:denominazi>Monte Test</ms:denominazi>', SIMPLE_POLYGON)
    const props = extractFlatProperties(block)
    expect(props.site_code).toBe('IT1234567')
    expect(props.denominazi).toBe('Monte Test')
    expect(props.the_geom).toBeUndefined() // contiene XML annidato, non testo semplice
  })

  it('ignora campi vuoti', () => {
    const props = extractFlatProperties('<ms:foo></ms:foo><ms:bar>valore</ms:bar>')
    expect(props.foo).toBeUndefined()
    expect(props.bar).toBe('valore')
  })
})

describe('extractDesignation', () => {
  it('preferisce sic_zsc su designazione generica quando entrambi presenti', () => {
    expect(extractDesignation({ sic_zsc: 'ZSC', tipo: 'ZPS' })).toBe('ZSC')
  })

  it('riconosce SIC da sic_zsc', () => {
    expect(extractDesignation({ sic_zsc: 'SIC' })).toBe('SIC')
  })

  it('riconosce ZPS dal campo zps dedicato', () => {
    expect(extractDesignation({ zps: 'ZPS' })).toBe('ZPS')
  })

  it('ripiega sui campi di designazione generici (tipo/tipologia) se sic_zsc/zps assenti', () => {
    expect(extractDesignation({ tipo: 'Zona a Protezione Speciale (ZPS)' })).toBe('ZPS')
    expect(extractDesignation({ tipologia: 'SIC' })).toBe('SIC')
  })

  it('torna unknown senza fabbricare una designazione da un valore non riconosciuto', () => {
    expect(extractDesignation({ tipo: 'qualcosa di mai visto' })).toBe('unknown')
    expect(extractDesignation({})).toBe('unknown')
  })
})
