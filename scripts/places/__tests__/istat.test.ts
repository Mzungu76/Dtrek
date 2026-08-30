import { describe, it, expect } from 'vitest'
import { istatRowToPlaceCandidate } from '../istat/fetch'
import type { IstatComuneGeoRow, IstatCodesRow } from '../istat/fetch'

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
