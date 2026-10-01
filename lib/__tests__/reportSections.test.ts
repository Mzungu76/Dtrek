import { describe, it, expect } from 'vitest'
import { reportFixedSectionsFor, reportSectionTitle } from '../reportSections'

describe('reportFixedSectionsFor', () => {
  it('sentiero: tutte e 5 le sezioni fisse, nell\'ordine consueto', () => {
    expect(reportFixedSectionsFor({ metaType: 'sentiero' })).toEqual([
      'dati_punteggi', 'andamento', 'natura', 'poi', 'galleria_foto',
    ])
  })

  it('assente → trattato come sentiero (default di colonna)', () => {
    expect(reportFixedSectionsFor({})).toEqual(['dati_punteggi', 'andamento', 'natura', 'poi', 'galleria_foto'])
  })

  it('borgo_citta cammino_urbano (nessuna traccia): niente dati_punteggi/andamento/natura', () => {
    expect(reportFixedSectionsFor({ metaType: 'borgo_citta' })).toEqual(['poi', 'galleria_foto'])
  })

  it('borgo_citta trekking_misto (traccia GPS reale collegata): come un sentiero, tranne natura', () => {
    const hike = { metaType: 'borgo_citta' as const, trackPoints: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }
    expect(reportFixedSectionsFor(hike)).toEqual(['dati_punteggi', 'andamento', 'poi', 'galleria_foto'])
  })

  it('sito non naturale (es. museo): solo poi/galleria_foto', () => {
    expect(reportFixedSectionsFor({ metaType: 'sito', siteType: 'museo' })).toEqual(['poi', 'galleria_foto'])
  })

  it('sito naturale (cascata/grotta/belvedere/area_naturale): natura inclusa anche senza traccia', () => {
    for (const siteType of ['cascata', 'grotta', 'belvedere', 'area_naturale'] as const) {
      expect(reportFixedSectionsFor({ metaType: 'sito', siteType })).toEqual(['natura', 'poi', 'galleria_foto'])
    }
  })

  it('un sito non diventa mai idoneo alle metriche escursionistiche anche con una traccia iniettata per errore', () => {
    const hike = { metaType: 'sito' as const, trackPoints: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }
    expect(reportFixedSectionsFor(hike)).toEqual(['poi', 'galleria_foto'])
  })
})

describe('reportSectionTitle', () => {
  it('"poi" resta "Punti di interesse" per un sentiero', () => {
    expect(reportSectionTitle('poi', 'sentiero', 'Punti di interesse')).toBe('Punti di interesse')
    expect(reportSectionTitle('poi', undefined, 'Punti di interesse')).toBe('Punti di interesse')
  })

  it('"poi" diventa "Luoghi visitati" per borgo_citta e "Nei dintorni" per sito', () => {
    expect(reportSectionTitle('poi', 'borgo_citta', 'Punti di interesse')).toBe('Luoghi visitati')
    expect(reportSectionTitle('poi', 'sito', 'Punti di interesse')).toBe('Nei dintorni')
  })

  it('le altre chiavi non variano per tipologia', () => {
    expect(reportSectionTitle('natura', 'sito', 'Natura')).toBe('Natura')
    expect(reportSectionTitle('galleria_foto', 'borgo_citta', 'Galleria fotografica')).toBe('Galleria fotografica')
  })
})
