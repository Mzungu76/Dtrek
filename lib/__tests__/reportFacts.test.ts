import { describe, it, expect } from 'vitest'
import { reportFacts, reportNoun, reportSummaryLine } from '../reportFacts'

describe('reportFacts', () => {
  it('sentiero (o tipologia assente): km, D+, durata e calorie', () => {
    const f = reportFacts({ distanceMeters: 12340, elevationGain: 560, totalTimeSeconds: 14400, calories: 800 })
    expect(f.map(x => x.label)).toEqual(['Distanza', 'Dislivello', 'Durata', 'Calorie'])
    expect(f[0].value).toBe('12.3 km')
  })

  it('sentiero senza calorie: ripiega sulla FC media, poi su nulla', () => {
    expect(reportFacts({ totalTimeSeconds: 60, avgHeartRate: 120 }).at(-1)?.label).toBe('FC media')
    expect(reportFacts({ totalTimeSeconds: 60 })).toHaveLength(3)
  })

  it('borgo: luoghi visitati e durata, mai distanza né dislivello', () => {
    const f = reportFacts({ metaType: 'borgo_citta', distanceMeters: 4000, elevationGain: 80, totalTimeSeconds: 7200, stopsCount: 5 })
    expect(f.map(x => x.label)).toEqual(['Luoghi visitati', 'Durata'])
    expect(f[0].value).toBe('5')
  })

  it('borgo senza tappe né durata: nessuna cifra (la striscia sparisce)', () => {
    expect(reportFacts({ metaType: 'borgo_citta' })).toEqual([])
  })

  it('sito: tipo e verifica, nessuna cifra escursionistica a zero', () => {
    const f = reportFacts({ metaType: 'sito', siteType: 'castello', verified: false })
    expect(f).toEqual([{ value: 'Castello', label: 'Tipo' }, { value: 'Non verificata', label: 'Visita' }])
  })

  it('sito senza siteType né informazione di verifica: vuoto', () => {
    expect(reportFacts({ metaType: 'sito' })).toEqual([])
  })
})

describe('reportNoun / reportSummaryLine', () => {
  it('Escursione solo per il sentiero', () => {
    expect(reportNoun(undefined)).toBe('Escursione')
    expect(reportNoun('sito')).toBe('Visita')
    expect(reportNoun('borgo_citta')).toBe('Visita')
  })

  it('anteprima: per un sito mai "0.0 km"', () => {
    expect(reportSummaryLine({ metaType: 'sito', siteType: 'museo', verified: true })).toBe('Museo')
    expect(reportSummaryLine({ distanceMeters: 5000, elevationGain: 100 })).toBe('5.0 km · 100 m di dislivello')
    expect(reportSummaryLine({ metaType: 'borgo_citta', stopsCount: 3 })).toBe('3 luoghi visitati')
  })
})

import { entryCounts, entryCountsLabel } from '../reportFacts'

describe('entryCounts / entryCountsLabel', () => {
  it('separa escursioni e visite', () => {
    const c = entryCounts([{ metaType: 'sentiero' }, {}, { metaType: 'sito' }, { metaType: 'borgo_citta' }, { metaType: 'sito' }])
    expect(c).toEqual({ hikes: 2, visits: 3 })
    expect(entryCountsLabel(c)).toBe('2 escursioni · 3 visite')
  })

  it('singolare e parti a zero', () => {
    expect(entryCountsLabel({ hikes: 1, visits: 0 })).toBe('1 escursione')
    expect(entryCountsLabel({ hikes: 0, visits: 1 })).toBe('1 visita')
    expect(entryCountsLabel({ hikes: 0, visits: 0 })).toBe('0 escursioni')
  })
})
