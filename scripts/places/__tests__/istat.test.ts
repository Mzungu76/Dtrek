import { describe, it, expect } from 'vitest'
import proj4 from 'proj4'
import { istatRowToPlaceCandidate, centroidOf } from '../istat/fetch'
import type { IstatComuneGeoRow, IstatCodesRow } from '../istat/fetch'

// Importare '../istat/fetch' sopra registra già 'EPSG:32632' in proj4 (proj4.defs(...) in cima a
// quel file, eseguito al load del modulo) — qui si riusa la stessa definizione condivisa solo per
// calcolare a mano il punto atteso in WGS84 di un centroide UTM noto, senza duplicare la stringa
// di proiezione.
function utmToWgs84(x: number, y: number): [lon: number, lat: number] {
  return proj4('EPSG:32632', 'EPSG:4326', [x, y]) as [number, number]
}

// Quadrato in coordinate UTM32N (metri) attorno a un punto plausibile per il Lazio — i valori
// numerici non corrispondono a un luogo reale, servono solo come geometria piana di test.
function squareRing(cx: number, cy: number, halfSide: number): number[][] {
  return [
    [cx - halfSide, cy - halfSide], [cx + halfSide, cy - halfSide],
    [cx + halfSide, cy + halfSide], [cx - halfSide, cy + halfSide],
    [cx - halfSide, cy - halfSide], // chiuso: ultimo punto = primo
  ]
}

// Fixture coerenti con i campi shapefile documentati da ISTAT (PRO_COM, COMUNE, COD_PROV,
// COD_REG — vedi commento in cima a fetch.ts) e con le colonne attese della tabella di codifica.
// Codice ISTAT reale di Viterbo: 056059 (provincia di Viterbo, codice provincia 56, regione Lazio,
// codice regione 12) — usato qui solo come valore plausibile, non riverificato byte-per-byte
// contro il file reale in questa sessione (vedi nota di rete in fetch.ts).
const VITERBO_GEO: IstatComuneGeoRow = {
  proCom: '056059',
  comune: 'VITERBO',
  codProv: '56',
  codReg: '12',
  lat: 42.4173,
  lon: 12.1069,
}

const VITERBO_CODES: IstatCodesRow = {
  proCom: '056059',
  comune: 'Viterbo',
  provincia: 'Viterbo',
  regione: 'Lazio',
}

describe('istatRowToPlaceCandidate', () => {
  it('produce un candidato borgo_citta con subtype indefinito (piano §6)', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO, VITERBO_CODES)
    expect(c.metaType).toBe('borgo_citta')
    expect(c.subtype).toBeUndefined()
  })

  it('preferisce il nome dalla tabella di codifica quando disponibile (case corretto)', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO, VITERBO_CODES)
    expect(c.name).toBe('Viterbo')
    expect(c.municipality).toBe('Viterbo')
    expect(c.province).toBe('Viterbo')
    expect(c.region).toBe('Lazio')
  })

  it('usa source/sourceId = istat/codice PRO_COM (piano §48.12)', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO, VITERBO_CODES)
    expect(c.source).toBe('istat')
    expect(c.sourceId).toBe('056059')
    expect(c.municipalityIstatCode).toBe('056059')
  })

  it('senza tabella di codifica, ricade sul nome dello shapefile e sul fallback regione per codice', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO)
    expect(c.name).toBe('VITERBO')
    expect(c.region).toBe('Lazio') // COD_REG 12 → fallback REGION_NAME_BY_CODE
    expect(c.province).toBeUndefined()
  })

  it('propaga le coordinate del centroide senza alterarle', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO, VITERBO_CODES)
    expect(c.latitude).toBe(42.4173)
    expect(c.longitude).toBe(12.1069)
  })

  it('confidence sempre 1 — fonte strutturata (piano §14, nota in types.ts)', () => {
    const c = istatRowToPlaceCandidate(VITERBO_GEO, VITERBO_CODES)
    expect(c.confidence).toBe(1)
  })
})

// Regressione del bug reale osservato in produzione: il centroide "istat" di Nepi risultava ~8km
// dal suo vero centro (verificato contro un punto di interesse noto al suo interno) — causa: la
// vecchia centroidOf mediava i vertici grezzi del confine invece di calcolare il vero centroide
// pesato per area, ed usava solo il primo anello di un MultiPolygon. Vedi il commento su
// ringAreaCentroid/centroidOf in fetch.ts per l'analisi completa.
describe('centroidOf', () => {
  it('per un quadrato semplice il centroide coincide con il centro geometrico', () => {
    const ring = squareRing(300_000, 4_700_000, 1000)
    const c = centroidOf({ type: 'Polygon', coordinates: [ring] })
    const [expectedLon, expectedLat] = utmToWgs84(300_000, 4_700_000)
    expect(c?.lat).toBeCloseTo(expectedLat, 9)
    expect(c?.lon).toBeCloseTo(expectedLon, 9)
  })

  it('NON si sposta se un lato del poligono è digitalizzato con molti più punti degli altri', () => {
    // Stesso quadrato di sopra, ma il lato superiore è suddiviso in 20 segmenti invece di uno solo
    // — punti aggiuntivi ma COLLINEARI (lo stesso segmento, solo più vertici): la vera area/forma
    // del poligono non cambia, quindi il centroide corretto deve restare identico. La vecchia
    // implementazione (media grezza dei vertici) veniva invece "tirata" verso il lato più denso —
    // esattamente il meccanismo sospettato per l'offset di Nepi.
    const cx = 300_000, cy = 4_700_000, half = 1000
    // Percorre il confine in un unico verso coerente (qui: antiorario) — dal vertice in basso a
    // destra al vertice in basso a sinistra passando per il lato superiore, da destra a sinistra,
    // suddiviso in 20 segmenti collineari invece di uno solo.
    const denseTopEdge: number[][] = []
    for (let i = 0; i <= 20; i++) denseTopEdge.push([cx + half - (2 * half * i) / 20, cy + half])
    const ring = [
      [cx - half, cy - half], [cx + half, cy - half],
      ...denseTopEdge,
      [cx - half, cy - half],
    ]
    const c = centroidOf({ type: 'Polygon', coordinates: [ring] })
    const [expectedLon, expectedLat] = utmToWgs84(cx, cy)
    expect(c?.lat).toBeCloseTo(expectedLat, 6)
    expect(c?.lon).toBeCloseTo(expectedLon, 6)
  })

  it('un MultiPolygon pesa TUTTE le parti per area, non solo la prima', () => {
    // Un quadrato grande a (0,0) e uno piccolo a (10000,0) (un'"exclave") — il centroide combinato
    // deve stare fra i due, molto più vicino al grande (l'area lo pesa), ma deve comunque spostarsi
    // rispetto al centroide del solo poligono grande: se la seconda parte venisse ignorata (il bug
    // precedente, coordinates[0][0] = solo il primo anello del primo poligono) il risultato
    // coinciderebbe esattamente con quello di un Polygon singolo, senza alcuno spostamento.
    const big = squareRing(300_000, 4_700_000, 1000) // area 2000×2000
    const small = squareRing(310_000, 4_700_000, 50) // area 100×100, molto più piccola
    const multi = centroidOf({ type: 'MultiPolygon', coordinates: [[big], [small]] })
    const onlyBig = centroidOf({ type: 'Polygon', coordinates: [big] })
    expect(multi).not.toBeNull()
    expect(onlyBig).not.toBeNull()
    // Spostato verso est (longitudine maggiore) rispetto al solo poligono grande, ma di poco (la
    // piccola parte pesa molto meno) — sempre più vicino al grande che al piccolo.
    expect(multi!.lon).toBeGreaterThan(onlyBig!.lon)
    const distToBig = Math.abs(multi!.lon - onlyBig!.lon)
    const distToSmallCenter = Math.abs(multi!.lon - utmToWgs84(310_000, 4_700_000)[0])
    expect(distToBig).toBeLessThan(distToSmallCenter)
  })

  it('un anello degenere (meno di 3 punti) o un\'area nulla non produce un centroide', () => {
    expect(centroidOf({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBeNull()
    expect(centroidOf({ type: 'Polygon', coordinates: [[]] })).toBeNull()
  })
})
