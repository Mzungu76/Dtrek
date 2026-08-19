import { describe, it, expect, afterEach, vi } from 'vitest'
import { classifyEffectiveType, readConnectionQuality, watchConnectionQuality } from '../connectionQuality'

// DTREK-AUDIT.md P2 #28 — nessuna stima di copertura di rete, dichiarato assente pur essendo un
// prerequisito critico per lo stack SOS. Una vera previsione lungo il percorso non è realizzabile
// senza un dataset di copertura cellulare (nessuno pubblico/OSM). Quello che è realisticamente
// disponibile — la qualità della connessione ATTUALE via Network Information API — non era usato
// da nessuna parte; questi test coprono la classificazione pura e il comportamento con/senza
// l'API disponibile (WebKit/iOS non la espone affatto — deve degradare a 'sconosciuta', mai
// fingere un dato che non ha).
describe('classifyEffectiveType', () => {
  it('classifica slow-2g/2g come debole', () => {
    expect(classifyEffectiveType('slow-2g')).toBe('debole')
    expect(classifyEffectiveType('2g')).toBe('debole')
  })

  it('classifica 3g/4g come buona', () => {
    expect(classifyEffectiveType('3g')).toBe('buona')
    expect(classifyEffectiveType('4g')).toBe('buona')
  })

  it('torna sconosciuta per un valore non riconosciuto o assente, mai un giudizio inventato', () => {
    expect(classifyEffectiveType(undefined)).toBe('sconosciuta')
    expect(classifyEffectiveType('5g')).toBe('sconosciuta')
    expect(classifyEffectiveType('')).toBe('sconosciuta')
  })
})

describe('readConnectionQuality / watchConnectionQuality — con e senza Network Information API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('torna sconosciuta quando navigator.connection non esiste (es. Safari/iOS)', () => {
    vi.stubGlobal('navigator', {})
    expect(readConnectionQuality()).toBe('sconosciuta')
  })

  it('legge la qualità reale quando navigator.connection è disponibile', () => {
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } })
    expect(readConnectionQuality()).toBe('buona')
  })

  it('watchConnectionQuality non chiama mai onChange se l\'API non è disponibile (no-op sicuro)', () => {
    vi.stubGlobal('navigator', {})
    let called = false
    const cleanup = watchConnectionQuality(() => { called = true })
    expect(called).toBe(false)
    expect(() => cleanup()).not.toThrow()
  })

  it('watchConnectionQuality si aggiorna sull\'evento change quando l\'API è disponibile', () => {
    let changeHandler: (() => void) | null = null
    const conn = {
      effectiveType: '2g',
      addEventListener: (_type: string, handler: () => void) => { changeHandler = handler },
      removeEventListener: () => {},
    }
    vi.stubGlobal('navigator', { connection: conn })

    const updates: string[] = []
    const cleanup = watchConnectionQuality((q) => updates.push(q))
    expect(changeHandler).not.toBeNull()

    conn.effectiveType = '4g'
    changeHandler!()
    expect(updates).toEqual(['buona'])
    cleanup()
  })
})
