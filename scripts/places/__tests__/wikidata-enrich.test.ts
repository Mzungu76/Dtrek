import { describe, it, expect } from 'vitest'
import { pickBestWikidataMatch } from '../wikidata/enrich'
import type { DtrekPlaceRow, WikidataCandidate } from '../wikidata/enrich'

const CALCATA_PLACE: DtrekPlaceRow = { id: 'abc-123', name: 'Calcata', latitude: 42.2278, longitude: 12.3392 }

describe('pickBestWikidataMatch', () => {
  it('trova un match quando il nome combacia (già filtrato per raggio dal chiamante)', () => {
    const nearby: WikidataCandidate[] = [
      { qid: 'Q3663434', label: 'Calcata', lat: 42.2278, lon: 12.3392 },
    ]
    const match = pickBestWikidataMatch(CALCATA_PLACE, nearby)
    expect(match?.qid).toBe('Q3663434')
  })

  it('nessun match se il nome non combacia abbastanza (piano §14 — mai fondere un match incerto)', () => {
    const nearby: WikidataCandidate[] = [
      { qid: 'Q999', label: 'Chiesa di San Pietro', lat: 42.2278, lon: 12.3392 },
    ]
    expect(pickBestWikidataMatch(CALCATA_PLACE, nearby)).toBeNull()
  })

  it('nessun candidato nel raggio → null, mai un fallback arbitrario', () => {
    expect(pickBestWikidataMatch(CALCATA_PLACE, [])).toBeNull()
  })

  it('con più candidati, sceglie quello con la similarità di nome più alta', () => {
    const nearby: WikidataCandidate[] = [
      { qid: 'Q1', label: 'Calcata Vecchia', lat: 42.2278, lon: 12.3392 },
      { qid: 'Q2', label: 'Calcata', lat: 42.2278, lon: 12.3392 },
    ]
    const match = pickBestWikidataMatch(CALCATA_PLACE, nearby)
    expect(match?.qid).toBe('Q2')
  })
})
