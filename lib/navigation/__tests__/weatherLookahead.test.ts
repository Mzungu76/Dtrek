// Fase 11 di docs/navigator-orizzonti-roadmap.md
import { describe, it, expect } from 'vitest'
import { projectWeatherAtEta } from '../weatherLookahead'
import type { HourlyWeatherFull } from '@/lib/openmeteo'

function hour(iso: string, overrides: Partial<HourlyWeatherFull> = {}): HourlyWeatherFull {
  return {
    time: iso, temperature: 15, windspeed: 5, precipitation: 0, cloudcover: 20, weathercode: 1,
    feelsLike: 15, humidity: 50, windDirection: 180, snowfall: 0, uvIndex: 3,
    ...overrides,
  }
}

const NOW_MS = new Date('2026-08-16T10:05:00Z').getTime()

describe('projectWeatherAtEta', () => {
  it('nessun avviso se non ci sono dati orari', () => {
    expect(projectWeatherAtEta([], new Date('2026-08-16T13:00:00Z'), NOW_MS)).toBeNull()
  })

  it('nessun avviso quando ETA e ora ricadono nello stesso bucket orario', () => {
    const hours = [hour('2026-08-16T10:00:00Z', { precipitation: 5 })]
    const result = projectWeatherAtEta(hours, new Date('2026-08-16T10:20:00Z'), NOW_MS)
    expect(result).toBeNull()
  })

  it('segnala pioggia in arrivo assente ora ma prevista all\'orario di arrivo stimato', () => {
    const hours = [
      hour('2026-08-16T10:00:00Z', { precipitation: 0 }),
      hour('2026-08-16T13:00:00Z', { precipitation: 3 }),
    ]
    const eta = new Date('2026-08-16T13:00:00Z')
    const result = projectWeatherAtEta(hours, eta, NOW_MS)
    expect(result?.message).toContain('Pioggia')
    expect(result?.etaDate).toEqual(eta)
  })

  it('segnala vento forte in arrivo assente ora ma previsto all\'orario di arrivo stimato', () => {
    const hours = [
      hour('2026-08-16T10:00:00Z', { windspeed: 5 }),
      hour('2026-08-16T13:00:00Z', { windspeed: 40 }),
    ]
    const result = projectWeatherAtEta(hours, new Date('2026-08-16T13:00:00Z'), NOW_MS)
    expect(result?.message).toContain('Vento forte')
  })

  it('segnala entrambi quando pioggia e vento peggiorano insieme', () => {
    const hours = [
      hour('2026-08-16T10:00:00Z', { precipitation: 0, windspeed: 5 }),
      hour('2026-08-16T13:00:00Z', { precipitation: 4, windspeed: 45 }),
    ]
    const result = projectWeatherAtEta(hours, new Date('2026-08-16T13:00:00Z'), NOW_MS)
    expect(result?.message).toContain('Pioggia')
    expect(result?.message).toContain('vento forte')
  })

  it('nessun avviso se la pioggia è già presente ora quanto all\'arrivo (non un peggioramento)', () => {
    const hours = [
      hour('2026-08-16T10:00:00Z', { precipitation: 5 }),
      hour('2026-08-16T13:00:00Z', { precipitation: 5 }),
    ]
    const result = projectWeatherAtEta(hours, new Date('2026-08-16T13:00:00Z'), NOW_MS)
    expect(result?.message).toBeNull()
  })

  it('nessun avviso se le condizioni all\'arrivo restano sotto le soglie', () => {
    const hours = [
      hour('2026-08-16T10:00:00Z', { precipitation: 0, windspeed: 5 }),
      hour('2026-08-16T13:00:00Z', { precipitation: 0.3, windspeed: 15 }),
    ]
    const result = projectWeatherAtEta(hours, new Date('2026-08-16T13:00:00Z'), NOW_MS)
    expect(result?.message).toBeNull()
  })
})
