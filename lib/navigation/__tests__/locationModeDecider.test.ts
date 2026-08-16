// Fase 3 di docs/navigator-orizzonti-roadmap.md. `LocationModeDecider.update()` prende
// `nowMs` come parametro esplicito — non serve mockare i timer reali (setTimeout/Date.now) per
// testare l'isteresi, basta far avanzare quel valore a mano tra una chiamata e l'altra.
import { describe, it, expect } from 'vitest'
import { decideLocationMode, LocationModeDecider, type LocationModeSignals } from '../locationModeDecider'

function signals(overrides: Partial<LocationModeSignals> = {}): LocationModeSignals {
  return {
    state: 'navigating',
    instantSpeedMs: 1.2, // passo da escursione tipico, sotto FAST_SPEED_MS
    accuracyM: 10,        // ben sotto POOR_ACCURACY_M
    distanceToNextInstructionM: null,
    batteryLevel: 0.8,    // ben sopra LOW_BATTERY_FOR_DOWNSHIFT
    batteryCharging: false,
    ...overrides,
  }
}

describe('decideLocationMode — priorità dichiarata', () => {
  it('sceglie trekking quando nessun segnale è urgente', () => {
    expect(decideLocationMode(signals())).toBe('trekking')
  })

  it('off_route vince su ogni altro segnale, inclusa batteria scarica', () => {
    expect(decideLocationMode(signals({ state: 'off_route', batteryLevel: 0.05 }))).toBe('emergency')
  })

  it('wrong_direction vince su ogni altro segnale', () => {
    expect(decideLocationMode(signals({ state: 'wrong_direction' }))).toBe('emergency')
  })

  it('un bivio vicino (<100m) sceglie navigation', () => {
    expect(decideLocationMode(signals({ distanceToNextInstructionM: 80 }))).toBe('navigation')
  })

  it('un bivio lontano non scatta navigation da solo', () => {
    expect(decideLocationMode(signals({ distanceToNextInstructionM: 500 }))).toBe('trekking')
  })

  it('velocità sopra il passo da escursione (>2.5 m/s) sceglie navigation', () => {
    expect(decideLocationMode(signals({ instantSpeedMs: 3 }))).toBe('navigation')
  })

  it('accuracy scarsa (>30m) sceglie navigation', () => {
    expect(decideLocationMode(signals({ accuracyM: 45 }))).toBe('navigation')
  })

  it('batteria sotto il 30% e non in carica sceglie battery_save, solo se nient\'altro è urgente', () => {
    expect(decideLocationMode(signals({ batteryLevel: 0.2 }))).toBe('battery_save')
  })

  it('batteria scarica ma in carica non declassa a battery_save', () => {
    expect(decideLocationMode(signals({ batteryLevel: 0.2, batteryCharging: true }))).toBe('trekking')
  })

  it('livello batteria sconosciuto (null, es. iOS Safari) non viene mai trattato come scarico', () => {
    expect(decideLocationMode(signals({ batteryLevel: null }))).toBe('trekking')
  })
})

describe('LocationModeDecider — isteresi temporale', () => {
  it('passa a emergency immediatamente, senza aspettare il dwell', () => {
    const decider = new LocationModeDecider('trekking')
    const result = decider.update(signals({ state: 'off_route' }), 0)
    expect(result).toBe('emergency')
  })

  it('non cambia modalità finché il nuovo segnale non persiste per MODE_CHANGE_DWELL_MS (8s)', () => {
    const decider = new LocationModeDecider('trekking')
    const first = decider.update(signals({ accuracyM: 45 }), 0)
    const stillWaiting = decider.update(signals({ accuracyM: 45 }), 5000)
    const afterDwell = decider.update(signals({ accuracyM: 45 }), 8000)
    expect(first).toBeNull()
    expect(stillWaiting).toBeNull()
    expect(afterDwell).toBe('navigation')
  })

  it('un blip che rientra prima del dwell non fa scattare il cambio modalità', () => {
    const decider = new LocationModeDecider('trekking')
    decider.update(signals({ accuracyM: 45 }), 0)
    decider.update(signals({ accuracyM: 45 }), 3000)
    // Il segnale torna buono prima che il dwell trascorra — niente cambio, e il conteggio deve ripartire da capo.
    const backToNormal = decider.update(signals(), 4000)
    const afterWouldHaveDwelled = decider.update(signals(), 9000)
    expect(backToNormal).toBeNull()
    expect(afterWouldHaveDwelled).toBeNull()
  })

  it('un cambio di segnale desiderato durante l\'attesa riparte il conteggio del dwell', () => {
    const decider = new LocationModeDecider('trekking')
    decider.update(signals({ accuracyM: 45 }), 0) // punta a navigation
    decider.update(signals({ batteryLevel: 0.1 }), 5000) // cambia idea: ora punta a battery_save, il dwell riparte da qui
    const tooSoon = decider.update(signals({ batteryLevel: 0.1 }), 12000) // 7s dal nuovo pending, non ancora 8s
    const afterNewDwell = decider.update(signals({ batteryLevel: 0.1 }), 13000) // 8s dal nuovo pending
    expect(tooSoon).toBeNull()
    expect(afterNewDwell).toBe('battery_save')
  })

  it('non ripete lo stesso cambio due volte di seguito una volta applicato', () => {
    const decider = new LocationModeDecider('trekking')
    decider.update(signals({ accuracyM: 45 }), 0)
    const applied = decider.update(signals({ accuracyM: 45 }), 8000)
    const repeated = decider.update(signals({ accuracyM: 45 }), 16000)
    expect(applied).toBe('navigation')
    expect(repeated).toBeNull()
  })
})
