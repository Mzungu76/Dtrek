import { describe, it, expect } from 'vitest'
import { micTypeLabelToSiteType, micBindingToPlaceCandidate } from '../mic/fetch'
import type { MicBinding } from '../mic/fetch'

describe('micTypeLabelToSiteType', () => {
  it('mappa le etichette più comuni ai SiteType corretti (piano §8)', () => {
    expect(micTypeLabelToSiteType('Museo archeologico')).toBe('museo')
    expect(micTypeLabelToSiteType('Area archeologica')).toBe('sito_archeologico')
    expect(micTypeLabelToSiteType('Castello medievale')).toBe('castello')
    expect(micTypeLabelToSiteType('Abbazia cistercense')).toBe('abbazia')
    expect(micTypeLabelToSiteType('Chiesa parrocchiale')).toBe('chiesa')
    expect(micTypeLabelToSiteType('Palazzo storico')).toBe('palazzo')
    expect(micTypeLabelToSiteType('Teatro romano')).toBe('teatro')
    expect(micTypeLabelToSiteType('Monumento ai caduti')).toBe('monumento')
  })

  it('non case-sensitive', () => {
    expect(micTypeLabelToSiteType('MUSEO CIVICO')).toBe('museo')
  })

  it('etichetta sconosciuta o assente → altro (mai un errore, piano: fonte non deve bloccare la pipeline)', () => {
    expect(micTypeLabelToSiteType('Qualcosa di non mappato')).toBe('altro')
    expect(micTypeLabelToSiteType(undefined)).toBe('altro')
    expect(micTypeLabelToSiteType(null)).toBe('altro')
  })
})

describe('micBindingToPlaceCandidate', () => {
  const CERAMICA: MicBinding = {
    id: '104060',
    name: 'Pinacoteca civica e galleria di arte contemporanea di Jesi',
    typeLabel: 'Pinacoteca',
    comune: 'Jesi',
    address: 'Piazza Colocci 4',
    lat: 43.5233,
    lon: 13.2436,
  }

  it('metaType sito, sourceId = id numerico MiC reale (piano §48.12, mai inventato)', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.metaType).toBe('sito')
    expect(c.source).toBe('mic')
    expect(c.sourceId).toBe('104060')
    expect(c.subtype).toBe('museo')
  })

  it('sourceUrl punta alla risorsa MiC reale', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.sourceUrl).toBe('http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/104060')
  })

  it('nessun campo description valorizzato — licenza CC BY-SA 4.0 (piano §8/§44)', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.description).toBeUndefined()
  })

  it('confidence più bassa di ISTAT/PTPR quando la tipologia è nota da un\'euristica testuale', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.confidence).toBe(0.9)
  })

  it('confidence ulteriormente più bassa senza tipologia', () => {
    const c = micBindingToPlaceCandidate({ ...CERAMICA, typeLabel: undefined })
    expect(c.subtype).toBe('altro')
    expect(c.confidence).toBe(0.6)
  })
})
