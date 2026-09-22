import { describe, it, expect } from 'vitest'
import {
  lombardiaTipologiaToSiteType,
  lombardiaFeatureToPlaceCandidate,
  arcgisFeatureToLombardiaFeature,
  countRawTipologiaForSubtype,
} from '../lombardia/fetch'
import type { LombardiaFeature } from '../lombardia/fetch'

describe('lombardiaTipologiaToSiteType', () => {
  it('mappa i 3 valori osservati dal vivo (round 1/2 di probe.ts, Milano/Lecco)', () => {
    expect(lombardiaTipologiaToSiteType('anfiteatro')).toBe('sito_archeologico')
    expect(lombardiaTipologiaToSiteType('Museo, galleria non a scopo di lucro e/o raccolta')).toBe('museo')
    expect(lombardiaTipologiaToSiteType('convento')).toBe('abbazia')
  })

  it('non case-sensitive', () => {
    expect(lombardiaTipologiaToSiteType('CONVENTO')).toBe('abbazia')
  })

  it('tipologia sconosciuta o assente → altro (mai un errore, stessa tolleranza di MIC_TYPE_MAP)', () => {
    expect(lombardiaTipologiaToSiteType('Qualcosa di non mappato')).toBe('altro')
    expect(lombardiaTipologiaToSiteType(undefined)).toBe('altro')
    expect(lombardiaTipologiaToSiteType(null)).toBe('altro')
  })

  it('estensioni verificate sul dry-run reale (651 record, 2026-09-22) — valori TIPOLOGIA reali dietro il 32.6% di altro del primo giro', () => {
    expect(lombardiaTipologiaToSiteType('ponte')).toBe('monumento')
    expect(lombardiaTipologiaToSiteType('oratorio')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('cappella')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('campanile')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('sacro monte')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('edificio di culto ed annessi')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('luogo di culto rupestre')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('edificio religioso fortificato')).toBe('chiesa')
    expect(lombardiaTipologiaToSiteType('mura difensive')).toBe('castello')
    expect(lombardiaTipologiaToSiteType('forte')).toBe('castello')
    expect(lombardiaTipologiaToSiteType('casaforte')).toBe('castello')
    expect(lombardiaTipologiaToSiteType('porta')).toBe('monumento')
    expect(lombardiaTipologiaToSiteType('terme')).toBe('sito_archeologico')
    expect(lombardiaTipologiaToSiteType('insediamento urbano')).toBe('sito_archeologico')
    expect(lombardiaTipologiaToSiteType('insediamento palafitticolo')).toBe('sito_archeologico')
    expect(lombardiaTipologiaToSiteType('insediamento fortificato')).toBe('sito_archeologico')
  })

  it("'tempio civico' è un memoriale civico (monumento), non un luogo di culto — deve avere precedenza su 'tempio' da solo", () => {
    expect(lombardiaTipologiaToSiteType('tempio civico')).toBe('monumento')
    expect(lombardiaTipologiaToSiteType('tempio')).toBe('chiesa')
  })

  it('valori genuinamente troppo generici/eterogenei restano deliberatamente altro (mai forzati in una categoria)', () => {
    expect(lombardiaTipologiaToSiteType('casa')).toBe('altro')
    expect(lombardiaTipologiaToSiteType('scuola')).toBe('altro')
    expect(lombardiaTipologiaToSiteType('ospedale')).toBe('altro')
    expect(lombardiaTipologiaToSiteType('stadio')).toBe('altro')
    expect(lombardiaTipologiaToSiteType('grattacielo')).toBe('altro')
    expect(lombardiaTipologiaToSiteType('centrale elettrica')).toBe('altro')
  })
})

describe('lombardiaFeatureToPlaceCandidate', () => {
  // Dato reale osservato (round 2, arcgis-lblgeo-geometry-sample-milano).
  const ANFITEATRO: LombardiaFeature = {
    idBene: '8839',
    denominazione: 'Anfiteatro romano',
    tipologia: 'anfiteatro',
    categoria: 'SA',
    comune: 'Milano',
    lat: 45.456901002109788,
    lon: 9.1788255283839248,
  }

  it('metaType sito, sourceId = IDBENE reale (mai inventato), source lombardia_sirbec', () => {
    const c = lombardiaFeatureToPlaceCandidate(ANFITEATRO)
    expect(c.metaType).toBe('sito')
    expect(c.source).toBe('lombardia_sirbec')
    expect(c.sourceId).toBe('8839')
    expect(c.subtype).toBe('sito_archeologico')
  })

  it('region fissa a Lombardia (fonte specifica per regione, come ptpr_lazio)', () => {
    expect(lombardiaFeatureToPlaceCandidate(ANFITEATRO).region).toBe('Lombardia')
  })

  it('latitude/longitude passate così come riproiettate dal server (outSR=4326), nessuna trasformazione qui', () => {
    const c = lombardiaFeatureToPlaceCandidate(ANFITEATRO)
    expect(c.latitude).toBe(ANFITEATRO.lat)
    expect(c.longitude).toBe(ANFITEATRO.lon)
  })

  it('confidence più alta quando la tipologia mappa a un subtype noto', () => {
    expect(lombardiaFeatureToPlaceCandidate(ANFITEATRO).confidence).toBe(0.85)
  })

  it('confidence più bassa quando la tipologia è assente o non mappata (altro)', () => {
    const c = lombardiaFeatureToPlaceCandidate({ ...ANFITEATRO, tipologia: undefined })
    expect(c.subtype).toBe('altro')
    expect(c.confidence).toBe(0.6)
  })

  it('denominazione vuota → nome di fallback, mai un candidato senza nome', () => {
    const c = lombardiaFeatureToPlaceCandidate({ ...ANFITEATRO, denominazione: '' })
    expect(c.name).toBe('Sito Lombardia')
  })

  it('metadata porta i campi grezzi SIRBeC per audit, mai usati per la classificazione al posto di subtype', () => {
    const c = lombardiaFeatureToPlaceCandidate(ANFITEATRO)
    expect(c.metadata).toMatchObject({ sirbecCategoria: 'SA', sirbecTipologia: 'anfiteatro' })
  })
})

describe('countRawTipologiaForSubtype', () => {
  it('conta i valori TIPOLOGIA reali che cadono su un subtype, ordinati per frequenza decrescente (dry-run reale 2026-09-22: 212/651 su altro)', () => {
    const features = [
      { tipologia: 'complesso monumentale' },
      { tipologia: 'complesso monumentale' },
      { tipologia: 'complesso monumentale' },
      { tipologia: 'area produttiva' },
      { tipologia: 'convento' }, // mappato ad abbazia, non deve comparire
    ]
    expect(countRawTipologiaForSubtype(features, 'altro')).toEqual([
      ['complesso monumentale', 3],
      ['area produttiva', 1],
    ])
  })

  it('tipologia assente conteggiata sotto "(assente)"', () => {
    expect(countRawTipologiaForSubtype([{ tipologia: undefined }], 'altro')).toEqual([['(assente)', 1]])
  })

  it('nessun record per quel subtype → array vuoto', () => {
    expect(countRawTipologiaForSubtype([{ tipologia: 'convento' }], 'altro')).toEqual([])
  })
})

describe('arcgisFeatureToLombardiaFeature', () => {
  it('feature reale (round 2, Milano) → LombardiaFeature con geometry.x/y come lon/lat', () => {
    const raw = {
      attributes: { IDBENE: 8839, DENOMINAZIONE: 'Anfiteatro romano', TIPOLOGIA: 'anfiteatro', CATEGORIA: 'SA', COMUNE: 'Milano' },
      geometry: { x: 9.1788255283839248, y: 45.456901002109788 },
    }
    const f = arcgisFeatureToLombardiaFeature(raw)
    expect(f).toMatchObject({ idBene: '8839', denominazione: 'Anfiteatro romano', lon: 9.1788255283839248, lat: 45.456901002109788 })
  })

  it('nessuna geometria → null (mai un candidato con coordinate NaN)', () => {
    const raw = { attributes: { IDBENE: 1, DENOMINAZIONE: 'X' } }
    expect(arcgisFeatureToLombardiaFeature(raw)).toBeNull()
  })

  it('IDBENE assente → null (mai un sourceId inventato)', () => {
    const raw = { attributes: { DENOMINAZIONE: 'X' }, geometry: { x: 9, y: 45 } }
    expect(arcgisFeatureToLombardiaFeature(raw)).toBeNull()
  })

  it('campi testuali vuoti trattati come assenti (stesso pattern str() di ptpr/extra-layers.ts)', () => {
    const raw = {
      attributes: { IDBENE: 1, DENOMINAZIONE: 'X', INDIRIZZO: '   ', COMUNE: null },
      geometry: { x: 9, y: 45 },
    }
    const f = arcgisFeatureToLombardiaFeature(raw)
    expect(f?.indirizzo).toBeUndefined()
    expect(f?.comune).toBeUndefined()
  })
})
