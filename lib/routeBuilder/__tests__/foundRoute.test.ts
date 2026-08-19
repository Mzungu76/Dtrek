import { describe, it, expect } from 'vitest'
import { isComfortVerdictStale } from '@/lib/routeBuilder/foundRoute'

// DTREK-AUDIT.md P2 #23 — comfortVerdict/comfortNote sono generati dall'LLM sui numeri stimati dal
// web (distanceKm/elevationGainM), PRIMA della risoluzione OSM/DTM reale — mai ri-verificati una
// volta arrivati i numeri reali. isComfortVerdictStale è la funzione pura che intercetta un
// disallineamento sostanziale, senza mai fabbricare un "obsoleto" quando manca un termine di
// confronto.
describe('isComfortVerdictStale', () => {
  it('non è obsoleto quando la stima e il dato reale sono vicini', () => {
    const estimated = { distanceKm: 12, elevationGainM: 500 }
    const resolved = { distanceMeters: 12200, elevationGain: 520, hasElevation: true }
    expect(isComfortVerdictStale(estimated, resolved)).toBe(false)
  })

  it('è obsoleto quando la distanza reale si discosta molto dalla stima', () => {
    const estimated = { distanceKm: 12, elevationGainM: 500 }
    const resolved = { distanceMeters: 6000, elevationGain: 520, hasElevation: true } // metà della stima
    expect(isComfortVerdictStale(estimated, resolved)).toBe(true)
  })

  it('è obsoleto quando il dislivello reale si discosta molto dalla stima', () => {
    const estimated = { distanceKm: 12, elevationGainM: 200 }
    const resolved = { distanceMeters: 12000, elevationGain: 900, hasElevation: true } // ben oltre la stima
    expect(isComfortVerdictStale(estimated, resolved)).toBe(true)
  })

  it('non controlla il dislivello finché non è disponibile un dato reale (hasElevation false)', () => {
    const estimated = { distanceKm: 12, elevationGainM: 200 }
    const resolved = { distanceMeters: 12000, elevationGain: 900, hasElevation: false }
    expect(isComfortVerdictStale(estimated, resolved)).toBe(false)
  })

  it('non fabbrica mai un "obsoleto" quando manca la stima da confrontare', () => {
    const estimated = { distanceKm: null, elevationGainM: null }
    const resolved = { distanceMeters: 12000, elevationGain: 900, hasElevation: true }
    expect(isComfortVerdictStale(estimated, resolved)).toBe(false)
  })

  it('uno scarto piccolo (stima web ragionevole) non fa scattare la soglia', () => {
    const estimated = { distanceKm: 10, elevationGainM: 400 }
    const resolved = { distanceMeters: 11000, elevationGain: 440, hasElevation: true } // ~10%
    expect(isComfortVerdictStale(estimated, resolved)).toBe(false)
  })

  it('gestisce un dislivello reale a zero senza dividere per zero', () => {
    const estimated = { distanceKm: 5, elevationGainM: 100 }
    const resolved = { distanceMeters: 5000, elevationGain: 0, hasElevation: true }
    expect(isComfortVerdictStale(estimated, resolved)).toBe(true) // 100 stimati contro 0 reali: scarto massimo
  })
})
