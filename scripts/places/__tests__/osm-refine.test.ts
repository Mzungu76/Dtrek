import { describe, it, expect } from 'vitest'
import { pickBestOsmPlaceMatch } from '../osm/refine-borgo-coords'
import type { DtrekBorgoRow, OsmPlaceCandidate } from '../osm/refine-borgo-coords'

// Coordinate reali osservate in produzione (vedi commento in cima a refine-borgo-coords.ts): il
// centroide ISTAT di Nepi anche dopo il fix del centroide (poligono → area-pesata) resta a ~2,6km
// dal vero borgo — esattamente il caso che questo script deve correggere.
const NEPI_ISTAT: DtrekBorgoRow = { id: 'nepi-1', name: 'Nepi', latitude: 42.2230402769495, longitude: 12.3312790366153 }
const NEPI_OSM_TRUE_POSITION = { lat: 42.230, lon: 12.353 } // punto plausibile del vero borgo, a scopo di test

describe('pickBestOsmPlaceMatch', () => {
  it('trova il nodo place= con lo stesso nome anche a diversi km dal centroide ISTAT', () => {
    const nearby: OsmPlaceCandidate[] = [
      { osmId: 111, place: 'town', name: 'Nepi', lat: NEPI_OSM_TRUE_POSITION.lat, lon: NEPI_OSM_TRUE_POSITION.lon },
    ]
    const match = pickBestOsmPlaceMatch(NEPI_ISTAT, nearby)
    expect(match?.osmId).toBe(111)
    expect(match?.confidence).toBe(1)
  })

  it('nessun match se nel raggio c\'è solo un insediamento con un nome diverso', () => {
    const nearby: OsmPlaceCandidate[] = [
      { osmId: 222, place: 'hamlet', name: 'Casale della Farnesiana', lat: 42.22, lon: 12.33 },
    ]
    expect(pickBestOsmPlaceMatch(NEPI_ISTAT, nearby)).toBeNull()
  })

  it('nessun candidato nel raggio → null, mai un fallback arbitrario', () => {
    expect(pickBestOsmPlaceMatch(NEPI_ISTAT, [])).toBeNull()
  })

  // Caso reale nel catalogo: "Trevignano Romano" (Lazio, sul lago di Bracciano) e "Trevignano"
  // (Veneto, provincia di Treviso) sono due Comuni diversi che condividono una parola — un match
  // token-based troppo permissivo su un nome solo PARZIALMENTE sovrapposto ("Trevignano" da solo,
  // senza "Romano") deve restare sotto soglia, non abbastanza simile da considerarlo lo stesso
  // posto (score 0.5 = 1 token in comune su 2 totali, sotto NAME_MATCH_THRESHOLD=0.6).
  it('un nome solo parzialmente sovrapposto (un token in comune su due) non supera la soglia', () => {
    const trevignanoRomano: DtrekBorgoRow = { id: 'tr-1', name: 'Trevignano Romano', latitude: 42.1509, longitude: 12.2535 }
    const nearby: OsmPlaceCandidate[] = [
      { osmId: 333, place: 'village', name: 'Trevignano', lat: 42.15, lon: 12.25 },
    ]
    expect(pickBestOsmPlaceMatch(trevignanoRomano, nearby)).toBeNull()
  })

  it('con più candidati validi, a parità di punteggio nome sceglie il più vicino alla coordinata attuale', () => {
    const nearby: OsmPlaceCandidate[] = [
      { osmId: 1, place: 'town', name: 'Nepi', lat: 42.30, lon: 12.40 }, // stesso nome, più lontano
      { osmId: 2, place: 'town', name: 'Nepi', lat: NEPI_OSM_TRUE_POSITION.lat, lon: NEPI_OSM_TRUE_POSITION.lon }, // più vicino
    ]
    const match = pickBestOsmPlaceMatch(NEPI_ISTAT, nearby)
    expect(match?.osmId).toBe(2)
  })
})
