import { describe, it, expect } from 'vitest'
import { classifyDtmFailure } from '@/lib/dtm/dtmClient'
import { OpenTopographyApiError } from '@/lib/dtm/openTopographyClient'

// DTREK-AUDIT.md P1 #11 — rate limit (429) vs nessuna copertura genuina, indistinguibili prima di
// questo fix (entrambe collassavano in un fallimento generico, mai loggato/segnalato in modo
// diverso). classifyDtmFailure è la sola parte pura di fetchDtmTile: il resto richiede una
// chiamata di rete reale a OpenTopography, non riproducibile da questo sandbox.
describe('classifyDtmFailure', () => {
  it('riconosce HTTP 429 come rate limit', () => {
    expect(classifyDtmFailure(new OpenTopographyApiError('Too Many Requests', 429))).toBe('rate_limited')
  })

  it('tratta ogni altro status HTTP di OpenTopography come nessuna copertura', () => {
    expect(classifyDtmFailure(new OpenTopographyApiError('Bad Request', 400))).toBe('no_coverage')
    expect(classifyDtmFailure(new OpenTopographyApiError('Unauthorized — chiave non valida', 401))).toBe('no_coverage')
    expect(classifyDtmFailure(new OpenTopographyApiError('Internal Server Error', 500))).toBe('no_coverage')
  })

  it('tratta un timeout/errore generico (non HTTP) come nessuna copertura', () => {
    expect(classifyDtmFailure(new Error('The operation was aborted due to timeout'))).toBe('no_coverage')
  })

  it('tratta un GeoTIFF non decodificabile (errore generico da parseDtmGeoTiff) come nessuna copertura', () => {
    expect(classifyDtmFailure(new Error('Unsupported GeoTIFF compression'))).toBe('no_coverage')
  })

  it('non esplode su un valore lanciato non-Error', () => {
    expect(classifyDtmFailure('stringa lanciata direttamente')).toBe('no_coverage')
    expect(classifyDtmFailure(undefined)).toBe('no_coverage')
  })
})
