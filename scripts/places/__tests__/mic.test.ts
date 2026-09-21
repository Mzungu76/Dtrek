import { describe, it, expect } from 'vitest'
import { micTypeLabelToSiteType, micBindingToPlaceCandidate, filterToKnownRegions, stripMailto, hasCoordinates } from '../mic/fetch'
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

  it('description assente nel binding → candidato senza description e senza fieldProvenance per quel campo', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.description).toBeUndefined()
    expect(c.metadata?.fieldProvenance).toBeUndefined()
  })

  it('description presente nel binding (verificato reale su Canepina/105665, MIC_DATA_SOURCES.md §3bis) → popolata con provenienza CC BY-SA 4.0 (piano §8/§44)', () => {
    const c = micBindingToPlaceCandidate({ ...CERAMICA, description: 'Testo descrittivo reale.' })
    expect(c.description).toBe('Testo descrittivo reale.')
    const provenance = (c.metadata?.fieldProvenance as Record<string, unknown>)?.description as Record<string, unknown>
    expect(provenance).toMatchObject({
      value: 'Testo descrittivo reale.',
      source: 'mic',
      sourceUrl: c.sourceUrl,
      confidence: 'high',
      status: 'ok',
    })
    expect(provenance.retrievedAt).toBeTypeOf('string')
    expect(provenance).not.toHaveProperty('sourceUpdatedAt')
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

  it('region passa al candidato quando presente nel binding (bug: mai letta prima del 2026-09-17, buildSparqlQuery non la selezionava)', () => {
    const c = micBindingToPlaceCandidate({ ...CERAMICA, region: 'Marche' })
    expect(c.region).toBe('Marche')
  })

  it('region undefined se assente nel binding (comune noto, hasRegion opzionale non popolato)', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.region).toBeUndefined()
  })

  it('usa dc:type come fallback quando typeLabel è assente (caso reale: Canepina/105665, MIC_DATA_SOURCES.md §3bis — loc:hasCulturalInstituteOrSiteType mai presente per quel record, dc:type sì)', () => {
    const c = micBindingToPlaceCandidate({
      ...CERAMICA,
      typeLabel: undefined,
      dcType: 'Museo, Galleria e/o raccolta',
    })
    expect(c.subtype).toBe('museo')
    expect(c.confidence).toBe(0.9)
    expect(c.rawType).toBe('Museo, Galleria e/o raccolta')
    expect(c.metadata?.micDcType).toBe('Museo, Galleria e/o raccolta')
  })

  it('typeLabel ha precedenza su dc:type quando entrambi sono presenti', () => {
    const c = micBindingToPlaceCandidate({
      ...CERAMICA,
      typeLabel: 'Castello',
      dcType: 'Museo, Galleria e/o raccolta',
    })
    expect(c.subtype).toBe('castello')
    expect(c.rawType).toBe('Castello')
  })

  // Predicati del valore letterale verificati reali su Canepina/105665 (probe
  // contatti-canepina-un-salto-oltre, MIC_DATA_SOURCES.md §12): sm:telephoneNumber, sm:emailAddress
  // ("mailto:...", da ripulire), sm:URL — website esisteva già nell'interfaccia ma non era mai stato
  // popolato dalla query prima di verificare questi predicati.
  it('contatti assenti nel binding → candidato senza phone/email/website e senza la loro provenienza', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    expect(c.phone).toBeUndefined()
    expect(c.email).toBeUndefined()
    expect(c.website).toBeUndefined()
    expect(c.metadata?.fieldProvenance).toBeUndefined()
  })

  it('contatti presenti nel binding → popolati con provenienza, email ripulita dal prefisso mailto:', () => {
    const c = micBindingToPlaceCandidate({
      ...CERAMICA,
      phone: '0761653008',
      email: 'mailto:info@cmcimini.it',
      website: 'http://www.cmcimini.it',
    })
    expect(c.phone).toBe('0761653008')
    expect(c.email).toBe('info@cmcimini.it')
    expect(c.website).toBe('http://www.cmcimini.it')
    const provenance = c.metadata?.fieldProvenance as Record<string, { value: unknown }>
    expect(provenance.phone).toMatchObject({ value: '0761653008', source: 'mic', confidence: 'high' })
    expect(provenance.email).toMatchObject({ value: 'info@cmcimini.it' })
    expect(provenance.website).toMatchObject({ value: 'http://www.cmcimini.it' })
  })

  it('geocoded=true (fallback Nominatim, bug reale 2026-09-21: Lombardia/Toscana senza geometria diretta in ArCo) → confidenza ridotta e coordinatesGeocoded in metadata', () => {
    const geocodedBinding = { ...CERAMICA, geocoded: true }
    const c = micBindingToPlaceCandidate(geocodedBinding)
    const direct = micBindingToPlaceCandidate(CERAMICA)
    expect(c.confidence).toBeLessThan(direct.confidence)
    expect(c.metadata?.coordinatesGeocoded).toBe(true)
  })

  it('geocoded=true → fieldProvenance per lat/lon separata, source nominatim e confidenza low (mai spacciata per affidabile quanto ArCo)', () => {
    const c = micBindingToPlaceCandidate({ ...CERAMICA, geocoded: true })
    const provenance = c.metadata?.fieldProvenance as Record<string, { value: unknown; source: string; confidence: string }>
    expect(provenance.latitude).toMatchObject({ value: CERAMICA.lat, source: 'nominatim', confidence: 'low' })
    expect(provenance.longitude).toMatchObject({ value: CERAMICA.lon, source: 'nominatim', confidence: 'low' })
  })

  it('geocoded assente/false → nessuna provenienza lat/lon, nessun coordinatesGeocoded (comportamento identico a prima di questo fix)', () => {
    const c = micBindingToPlaceCandidate(CERAMICA)
    const provenance = c.metadata?.fieldProvenance as Record<string, unknown> | undefined
    expect(provenance?.latitude).toBeUndefined()
    expect(c.metadata?.coordinatesGeocoded).toBeUndefined()
  })
})

describe('hasCoordinates', () => {
  it('true quando lat e lon sono entrambi definiti', () => {
    expect(hasCoordinates({ id: '1', name: 'X', lat: 43.5, lon: 13.2 })).toBe(true)
  })

  it('false quando lat o lon sono assenti (record MiC senza geometria diretta, prima della geocodifica)', () => {
    expect(hasCoordinates({ id: '1', name: 'X', lon: 13.2 })).toBe(false)
    expect(hasCoordinates({ id: '1', name: 'X', lat: 43.5 })).toBe(false)
    expect(hasCoordinates({ id: '1', name: 'X' })).toBe(false)
  })
})

describe('stripMailto', () => {
  it('rimuove il prefisso mailto: (formato reale osservato su sm:emailAddress)', () => {
    expect(stripMailto('mailto:info@cmcimini.it')).toBe('info@cmcimini.it')
  })

  it('non case-sensitive, nessun effetto se il prefisso è già assente', () => {
    expect(stripMailto('MAILTO:info@cmcimini.it')).toBe('info@cmcimini.it')
    expect(stripMailto('info@cmcimini.it')).toBe('info@cmcimini.it')
  })
})

describe('filterToKnownRegions', () => {
  it('tiene le 20 regioni italiane reali, esattamente come scritte nel grafo (round 3: "Lazio")', () => {
    expect(filterToKnownRegions(['Lazio', 'Marche', "Valle d'Aosta"])).toEqual(['Lazio', 'Marche', "Valle d'Aosta"])
  })

  it('scarta valori che non sono una delle 20 regioni (bug: "100 regioni trovate nel grafo", causa del crash con stima negativa di Virtuoso)', () => {
    expect(filterToKnownRegions(['Lazio', 'Roma', 'lazio', 'Repubblica di San Marino', ''])).toEqual(['Lazio'])
  })

  it('lista vuota → lista vuota, nessun errore', () => {
    expect(filterToKnownRegions([])).toEqual([])
  })
})
