import { describe, it, expect } from 'vitest'
import { symbolToWmo, toRomeLocal, feelsLike, parseMetno, expandToHourly, dailyFrom, type MetnoResponse } from '../metno'

function entry(time: string, temp: number, opts: { windMs?: number; symbol1?: string; precip1?: number; symbol6?: string; precip6?: number; rh?: number } = {}) {
  return {
    time,
    data: {
      instant: { details: { air_temperature: temp, wind_speed: opts.windMs ?? 2, wind_from_direction: 180, relative_humidity: opts.rh ?? 60, cloud_area_fraction: 40 } },
      ...(opts.symbol1 ? { next_1_hours: { summary: { symbol_code: opts.symbol1 }, details: { precipitation_amount: opts.precip1 ?? 0 } } } : {}),
      ...(opts.symbol6 ? { next_6_hours: { summary: { symbol_code: opts.symbol6 }, details: { precipitation_amount: opts.precip6 ?? 0 } } } : {}),
    },
  }
}

describe('symbolToWmo', () => {
  it('mappa i simboli principali sui codici con etichetta', () => {
    expect(symbolToWmo('clearsky_day')).toBe(0)
    expect(symbolToWmo('partlycloudy_night')).toBe(2)
    expect(symbolToWmo('lightrain')).toBe(61)
    expect(symbolToWmo('heavyrain')).toBe(65)
    expect(symbolToWmo('rainshowers_day')).toBe(81)
    expect(symbolToWmo('snow')).toBe(73)
    expect(symbolToWmo('lightrainandthunder')).toBe(95)
    expect(symbolToWmo('heavyrainshowersandthunder_day')).toBe(99)
    expect(symbolToWmo('fog')).toBe(45)
    expect(symbolToWmo(undefined)).toBe(3)
  })
})

describe('toRomeLocal', () => {
  it('converte UTC in ora di Roma, con ora legale e solare', () => {
    expect(toRomeLocal('2026-07-01T10:00:00Z')).toBe('2026-07-01T12:00')
    expect(toRomeLocal('2026-01-15T10:00:00Z')).toBe('2026-01-15T11:00')
  })
})

describe('feelsLike', () => {
  it('col freddo e vento è più bassa della temperatura, con il caldo umido più alta', () => {
    expect(feelsLike(0, 30, 70)).toBeLessThan(-5)
    expect(feelsLike(32, 5, 70)).toBeGreaterThan(32)
    expect(feelsLike(18, 5, 50)).toBe(18)
  })
})

describe('parseMetno / expandToHourly / dailyFrom', () => {
  const raw: MetnoResponse = { properties: { timeseries: [
    entry('2026-07-01T10:00:00Z', 20, { windMs: 5, symbol1: 'fair_day', precip1: 0 }),
    entry('2026-07-01T11:00:00Z', 22, { symbol1: 'lightrain', precip1: 1.2 }),
    entry('2026-07-01T12:00:00Z', 25, { symbol6: 'rainandthunder', precip6: 6 }),
  ] } }

  it('converte unità e orari', () => {
    const rows = parseMetno(raw)
    expect(rows).toHaveLength(3)
    expect(rows[0].time).toBe('2026-07-01T12:00')
    expect(rows[0].windspeed).toBeCloseTo(18)
    expect(rows[1].weathercode).toBe(61)
    expect(rows[2].stepHours).toBe(6)
  })

  it('porta i tratti da 6 ore a passo orario dividendo la pioggia', () => {
    const rows = expandToHourly(parseMetno(raw))
    const tail = rows.filter((r) => r.time >= '2026-07-01T14:00')
    expect(tail.length).toBe(6) // 14:00-19:00
    expect(tail.every((r) => r.stepHours === 1)).toBe(true)
    expect(tail.reduce((s, r) => s + r.precipitation, 0)).toBeCloseTo(6)
  })

  it('il giorno prende massimi/minimi e il simbolo più severo di giorno', () => {
    const day = dailyFrom(expandToHourly(parseMetno(raw)))[0]
    expect(day.date).toBe('2026-07-01')
    expect(day.tempMax).toBe(25)
    expect(day.tempMin).toBe(20)
    expect(day.weathercode).toBe(95)
    expect(day.precipitation).toBeCloseTo(7.2)
  })

  it('ignora le righe senza temperatura', () => {
    const bad: MetnoResponse = { properties: { timeseries: [{ time: '2026-07-01T10:00:00Z', data: { instant: { details: {} } } }] } }
    expect(parseMetno(bad)).toEqual([])
    expect(parseMetno({})).toEqual([])
  })
})
