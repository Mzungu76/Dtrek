import { describe, it, expect } from 'vitest'
import {
  borgoIdentitarioToPlaceCandidate,
  centroStoricoToPlaceCandidate,
  cittaDiFondazioneToPlaceCandidate,
  CITTA_DI_FONDAZIONE,
} from '../ptpr/extra-layers'
import type { PtprBorgoIdentitarioRow, PtprCentroStoricoRow } from '../ptpr/extra-layers'

// Fixture basata sui campi reali (verificati sul file caricato dall'utente in questa sessione:
// Aree_borghi_identitari.dbf — OGGETTO, LOCALITA_, INDIRIZZO, DESTINAZIO, USO_ATTUAL, AMBITO,
// ID_RL — non NOME/COMUNE/VINCOLO come nei layer archeologici gemelli).
const BORGO_MONTELLO: PtprBorgoIdentitarioRow = {
  idRl: '1234', oggetto: 'Borgo Montello', localita: 'Borgo Montello',
  indirizzo: 'Via Borgo Montello', destinazione: 'Rurale', usoAttuale: 'Residenziale',
  ambito: 'Agro Pontino', lat: 41.5321, lon: 12.9587,
}

const VITERBO_CENTRO: PtprCentroStoricoRow = {
  idRl: '5678', nome: null, comune: 'Viterbo', vincolo: null, lat: 42.4173, lon: 12.1069,
}

describe('borgoIdentitarioToPlaceCandidate', () => {
  it('produce un candidato borgo_citta con subtype indefinito (piano §6 — mai dedotto da una fonte)', () => {
    const c = borgoIdentitarioToPlaceCandidate(BORGO_MONTELLO)
    expect(c.metaType).toBe('borgo_citta')
    expect(c.subtype).toBeUndefined()
    expect(c.name).toBe('Borgo Montello')
  })

  it('porta i segnali OGGETTO/LOCALITA_/USO_ATTUAL/AMBITO in metadata (piano §6, mai come subtype diretto)', () => {
    const c = borgoIdentitarioToPlaceCandidate(BORGO_MONTELLO)
    expect(c.metadata?.ptprBorgoIdentitario).toBe(true)
    expect(c.metadata?.localita).toBe('Borgo Montello')
    expect(c.metadata?.usoAttuale).toBe('Residenziale')
    expect(c.metadata?.ambito).toBe('Agro Pontino')
  })

  it('source/sourceId ricostruibili (piano §48.12)', () => {
    const c = borgoIdentitarioToPlaceCandidate(BORGO_MONTELLO)
    expect(c.source).toBe('ptpr_lazio')
    expect(c.sourceId).toBe('borgo_identitario:1234')
  })

  it('ricade su LOCALITA_ quando OGGETTO manca (nessun campo COMUNE in questo layer)', () => {
    const c = borgoIdentitarioToPlaceCandidate({ ...BORGO_MONTELLO, oggetto: null })
    expect(c.name).toBe('Borgo Montello') // torna a LOCALITA_
    expect(c.municipality).toBeUndefined()
  })
})

describe('centroStoricoToPlaceCandidate', () => {
  it('usa il nome del Comune come nome del candidato (il centro storico non ha un nome proprio)', () => {
    const c = centroStoricoToPlaceCandidate(VITERBO_CENTRO)
    expect(c.name).toBe('Viterbo')
    expect(c.subtype).toBeUndefined()
  })

  it('porta historicalCenter in metadata (piano §6/§7)', () => {
    const c = centroStoricoToPlaceCandidate(VITERBO_CENTRO)
    expect(c.metadata?.historicalCenter).toBe(true)
  })

  it('coordinate vicine al centroide ISTAT del Comune → pensato per l\'auto-merge del dedup, non una nuova Meta', () => {
    const c = centroStoricoToPlaceCandidate(VITERBO_CENTRO)
    // Stesse coordinate usate nella fixture ISTAT di Viterbo (scripts/places/__tests__/istat.test.ts)
    expect(c.latitude).toBeCloseTo(42.4173, 3)
    expect(c.longitude).toBeCloseTo(12.1069, 3)
  })
})

describe('cittaDiFondazioneToPlaceCandidate', () => {
  it('copre esattamente i 5 comuni noti (Agro Pontino, fondazione anni \'30)', () => {
    expect(CITTA_DI_FONDAZIONE.map(e => e.name).sort()).toEqual(
      ['Aprilia', 'Latina', 'Pomezia', 'Pontinia', 'Sabaudia'],
    )
  })

  it('produce cityOfFoundation in metadata, subtype indefinito', () => {
    const latina = CITTA_DI_FONDAZIONE.find(e => e.name === 'Latina')!
    const c = cittaDiFondazioneToPlaceCandidate(latina)
    expect(c.subtype).toBeUndefined()
    expect(c.metadata?.cityOfFoundation).toBe(true)
    expect(c.municipalityIstatCode).toBe('059011')
  })

  it('sourceId include il codice ISTAT verificato, mai inventato (piano §48.12)', () => {
    const aprilia = CITTA_DI_FONDAZIONE.find(e => e.name === 'Aprilia')!
    const c = cittaDiFondazioneToPlaceCandidate(aprilia)
    expect(c.sourceId).toBe('citta_fondazione:059001')
  })
})
