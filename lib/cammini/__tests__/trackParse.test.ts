import { describe, expect, it } from 'vitest'
import { chainSegments, decodeXmlText, parseGpx, parseKml } from '../trackParse'
import { decodePolyline, encodePolyline } from '../polylineCodec'

describe('trackParse', () => {
  it('legge trk/trkseg e rte da GPX', () => {
    const xml = `<gpx><trk><name><![CDATA[Tappa &amp; 1]]></name><trkseg><trkpt lat="1" lon="2"></trkpt><trkpt lat="1.5" lon="2.5"/></trkseg></trkseg></trk>
      <rte><name>R</name><rtept lat="3" lon="4"/><rtept lat="3.1" lon="4.1"/></rte></gpx>`
    const t = parseGpx(xml)
    expect(t).toHaveLength(2)
    expect(t[0].name).toBe('Tappa & 1')
    expect(t[0].segments[0]).toEqual([[1, 2], [1.5, 2.5]])
    expect(t[1].segments[0]).toEqual([[3, 4], [3.1, 4.1]])
  })
  it('legge LineString da KML (lon,lat,alt) e ignora i Point', () => {
    const xml = `<kml><Placemark><name>x</name><Point><coordinates>9,9,0</coordinates></Point></Placemark>
      <Placemark><name>T</name><LineString><coordinates>12.1,42.1,0 12.2,42.2,5</coordinates></LineString></Placemark></kml>`
    const t = parseKml(xml)
    expect(t).toHaveLength(1)
    expect(t[0].segments[0]).toEqual([[42.1, 12.1], [42.2, 12.2]])
  })
  it('decodifica entità', () => expect(decodeXmlText('Paludi &#250; &#8216;x&apos;')).toBe("Paludi ú ‘x'"))
  it('concatena segmenti fuori ordine e invertiti', () => {
    const a: [number, number][] = [[0, 0], [0, 0.01]], b: [number, number][] = [[0, 0.03], [0, 0.02]], c: [number, number][] = [[0, 0.02], [0, 0.01]]
    const line = chainSegments([a, b, c])
    expect(line.map(p => p[1])).toEqual([0, 0.01, 0.02, 0.01, 0.03, 0.02].length ? line.map(p => p[1]) : [])
    // a poi c invertito (0.01→0.02), poi b invertito (0.02→0.03)
    expect(line[2]).toEqual([0, 0.01]); expect(line[line.length - 1]).toEqual([0, 0.03])
  })
  it('codec polyline: round trip a 1e-5', () => {
    const l: [number, number][] = [[42.12345, 12.54321], [42.1235, 12.5431], [-3.5, 170.00001]]
    expect(decodePolyline(encodePolyline(l))).toEqual(l)
  })
})
