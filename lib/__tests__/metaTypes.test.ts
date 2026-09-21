import { describe, it, expect } from 'vitest'
import { inferSiteTypeFromName } from '../metaTypes'

describe('inferSiteTypeFromName', () => {
  it('non tocca un subtype già specifico, anche se il nome direbbe altro', () => {
    // Il dato strutturato reale ha sempre priorità sul nome — mai una "correzione" non richiesta.
    expect(inferSiteTypeFromName('Museo civico "Luigi Rossi Danielli"', 'castello')).toBe('castello')
  })

  it('"altro" con un nome che contiene una parola chiave viene corretto', () => {
    expect(inferSiteTypeFromName('Museo civico "Luigi Rossi Danielli"', 'altro')).toBe('museo')
    expect(inferSiteTypeFromName('Ex Chiesa Santa Maria dell\'Immacolata Concezione', 'altro')).toBe('chiesa')
    expect(inferSiteTypeFromName('Castello Orsini-Odescalchi', 'altro')).toBe('castello')
  })

  it('subtype assente (undefined/null) con un nome riconoscibile viene comunque classificato', () => {
    expect(inferSiteTypeFromName('Abbazia di San Martino al Cimino', undefined)).toBe('abbazia')
    expect(inferSiteTypeFromName('Abbazia di San Martino al Cimino', null)).toBe('abbazia')
  })

  it('resta "altro" (o assente) quando nemmeno il nome aiuta — mai una categoria inventata', () => {
    expect(inferSiteTypeFromName('Torre Alfina', 'altro')).toBe('altro')
    expect(inferSiteTypeFromName('Torre Alfina', undefined)).toBeUndefined()
  })

  it('case-insensitive', () => {
    expect(inferSiteTypeFromName('MUSEO ARCHEOLOGICO NAZIONALE', 'altro')).toBe('museo')
  })
})
