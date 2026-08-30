import { describe, it, expect } from 'vitest'
import { osmElementToPlaceCandidate } from '../osm/fetch'

const CASTELLO_ORSINI = {
  type: 'node' as const,
  id: 123456,
  tags: { historic: 'castle', name: 'Castello Orsini-Odescalchi' },
}

describe('osmElementToPlaceCandidate', () => {
  it('mappa historic=castle a SiteType castello (piano §9)', () => {
    const c = osmElementToPlaceCandidate(CASTELLO_ORSINI, { lat: 42.0958, lon: 12.0967 })
    expect(c?.metaType).toBe('sito')
    expect(c?.subtype).toBe('castello')
    expect(c?.name).toBe('Castello Orsini-Odescalchi')
  })

  it('sourceId = node/<id> o way/<id> — univoco solo col tipo elemento (README osm/)', () => {
    const c = osmElementToPlaceCandidate(CASTELLO_ORSINI, { lat: 42.0958, lon: 12.0967 })
    expect(c?.source).toBe('osm')
    expect(c?.sourceId).toBe('node/123456')
  })

  it('scarta un elemento senza coordinate risolte (way senza nodi trovati)', () => {
    const c = osmElementToPlaceCandidate(CASTELLO_ORSINI, null)
    expect(c).toBeNull()
  })

  it('scarta un elemento senza nome (piano §24 — mai dati senza significato)', () => {
    const c = osmElementToPlaceCandidate({ type: 'node', id: 1, tags: { historic: 'castle' } }, { lat: 42, lon: 12 })
    expect(c).toBeNull()
  })

  it('scarta un elemento la cui combinazione tag non è tra le categorie del piano §9', () => {
    const c = osmElementToPlaceCandidate({ type: 'node', id: 1, tags: { shop: 'bakery', name: 'Panificio' } }, { lat: 42, lon: 12 })
    expect(c).toBeNull()
  })

  it('mappa tutte le categorie del piano §9 a un SiteType valido', () => {
    const cases: [Record<string, string>, string][] = [
      [{ tourism: 'museum', name: 'X' }, 'museo'],
      [{ tourism: 'gallery', name: 'X' }, 'museo'],
      [{ tourism: 'attraction', name: 'X' }, 'altro'],
      [{ historic: 'archaeological_site', name: 'X' }, 'sito_archeologico'],
      [{ historic: 'monument', name: 'X' }, 'monumento'],
      [{ historic: 'ruins', name: 'X' }, 'altro'],
      [{ natural: 'waterfall', name: 'X' }, 'cascata'],
      [{ natural: 'cave_entrance', name: 'X' }, 'grotta'],
      [{ natural: 'peak', name: 'X' }, 'area_naturale'],
      [{ natural: 'viewpoint', name: 'X' }, 'belvedere'],
      [{ natural: 'spring', name: 'X' }, 'area_naturale'],
      [{ amenity: 'place_of_worship', name: 'X' }, 'chiesa'],
    ]
    for (const [tags, expected] of cases) {
      const c = osmElementToPlaceCandidate({ type: 'node', id: 1, tags }, { lat: 42, lon: 12 })
      expect(c?.subtype, `tags=${JSON.stringify(tags)}`).toBe(expected)
    }
  })

  it('porta il tag wikidata in metadata quando presente (per il futuro arricchimento, piano §11)', () => {
    const c = osmElementToPlaceCandidate({ ...CASTELLO_ORSINI, tags: { ...CASTELLO_ORSINI.tags, wikidata: 'Q3660151' } }, { lat: 42, lon: 12 })
    expect(c?.metadata?.wikidataTag).toBe('Q3660151')
  })

  it('confidence 0.7 — fonte crowdsourced, non un\'anagrafe ufficiale', () => {
    const c = osmElementToPlaceCandidate(CASTELLO_ORSINI, { lat: 42, lon: 12 })
    expect(c?.confidence).toBe(0.7)
  })
})
