// Previsioni meteo da MET Norway (Locationforecast 2.0, api.met.no). Dati CC BY 4.0 / NLOD, gratuiti
// anche per uso commerciale con attribuzione e un User-Agent che identifichi l'app; nessuna chiave.
// Solo previsioni: MET Norway non offre lo storico. Questo file è puro (nessuna rete): normalizza la
// risposta nei tipi già usati dall'app (orario/giornaliero, codici WMO per le icone) ed è testato in
// lib/weather/__tests__/metno.test.ts. La chiamata vera sta in app/api/weather/route.ts.

export interface MetnoHourly {
  /** Ora locale (Europe/Rome) "YYYY-MM-DDTHH:00". */
  time: string
  temperature: number      // °C
  feelsLike: number        // °C
  windspeed: number        // km/h
  windDirection: number    // gradi
  humidity: number         // %
  cloudcover: number       // %
  precipitation: number    // mm nell'intervallo (1 h, oppure 6 h nei tratti a passo lungo)
  snowfall: number         // mm di acqua equivalente, stimati
  uvIndex: number          // 0 se non fornito
  weathercode: number      // WMO
  /** Ore coperte dal dato (1, oppure 6 nella parte lontana della previsione). */
  stepHours: number
}

export interface MetnoDaily {
  date: string
  tempMax: number
  tempMin: number
  precipitation: number
  windspeedMax: number
  weathercode: number
}

interface MetnoTimeseriesEntry {
  time: string
  data: {
    instant: { details: Record<string, number | undefined> }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_12_hours?: { summary?: { symbol_code?: string } }
  }
}

export interface MetnoResponse {
  properties?: { timeseries?: MetnoTimeseriesEntry[] }
}

/** Codice simbolo MET (es. "lightrainshowersandthunder_day") → codice WMO tra quelli con etichetta
 *  in wmoInfo (lib/weather.ts). */
export function symbolToWmo(symbol: string | undefined): number {
  if (!symbol) return 3
  const base = symbol.replace(/_(day|night|polartwilight)$/, '')
  const thunder = base.includes('thunder')
  if (thunder) return base.includes('heavy') ? 99 : 95
  if (base === 'clearsky') return 0
  if (base === 'fair') return 1
  if (base === 'partlycloudy') return 2
  if (base === 'cloudy') return 3
  if (base === 'fog') return 45
  const showers = base.includes('showers')
  const intensity = base.startsWith('light') ? 0 : base.startsWith('heavy') ? 2 : 1
  if (base.includes('snow')) return showers ? (intensity === 2 ? 86 : 85) : [71, 73, 75][intensity]
  if (base.includes('sleet')) return showers ? 85 : [71, 73, 75][intensity] // nevischio: reso come neve
  if (base.includes('rain')) return showers ? [80, 81, 82][intensity] : [61, 63, 65][intensity]
  return 3
}

/** Gravità crescente, per scegliere il simbolo che rappresenta una giornata. */
function severity(code: number): number {
  if (code >= 95) return 6
  if (code >= 85 || (code >= 71 && code <= 77)) return 5
  if (code >= 80) return 4
  if (code >= 61) return 4
  if (code >= 51) return 3
  if (code === 45 || code === 48) return 2
  if (code === 3) return 1
  return 0
}

const ROME_FORMAT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** "2026-09-30T13:00:00Z" → "2026-09-30T15:00" in ora di Roma. */
export function toRomeLocal(utcIso: string): string {
  const parts = ROME_FORMAT.format(new Date(utcIso)) // "2026-09-30 15:00"
  return parts.replace(' ', 'T')
}

/** Temperatura percepita: wind chill sotto 10 °C con vento, indice di calore sopra 27 °C, altrimenti
 *  la temperatura dell'aria. Stima semplice, non un dato misurato. */
export function feelsLike(tempC: number, windKmh: number, humidityPct: number): number {
  if (tempC <= 10 && windKmh > 4.8) {
    const v = Math.pow(windKmh, 0.16)
    return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v
  }
  if (tempC >= 27 && humidityPct >= 40) {
    const t = tempC, r = humidityPct
    return -8.785 + 1.611 * t + 2.339 * r - 0.1461 * t * r - 0.01231 * t * t - 0.01642 * r * r + 0.002212 * t * t * r + 0.0007255 * t * r * r - 0.000003582 * t * t * r * r
  }
  return tempC
}

export function parseMetno(raw: MetnoResponse): MetnoHourly[] {
  const series = raw.properties?.timeseries ?? []
  const out: MetnoHourly[] = []
  for (const entry of series) {
    const d = entry.data.instant.details
    const temperature = d.air_temperature
    if (temperature == null) continue
    const windKmh = (d.wind_speed ?? 0) * 3.6
    const humidity = d.relative_humidity ?? 0
    const one = entry.data.next_1_hours
    const six = entry.data.next_6_hours
    const window = one ?? six
    const stepHours = one ? 1 : 6
    const precipitation = window?.details?.precipitation_amount ?? 0
    const weathercode = symbolToWmo(window?.summary?.symbol_code ?? entry.data.next_12_hours?.summary?.symbol_code)
    const isSnow = weathercode >= 71 && weathercode <= 77 || weathercode === 85 || weathercode === 86
    out.push({
      time: toRomeLocal(entry.time),
      temperature,
      feelsLike: feelsLike(temperature, windKmh, humidity),
      windspeed: windKmh,
      windDirection: d.wind_from_direction ?? 0,
      humidity,
      cloudcover: d.cloud_area_fraction ?? 0,
      precipitation,
      snowfall: isSnow ? precipitation : 0,
      uvIndex: d.ultraviolet_index_clear_sky ?? 0,
      weathercode,
      stepHours,
    })
  }
  return out
}

/** Porta il passo a 1 ora ripetendo i tratti da 6 ore: chi legge l'orario (grafici, finestre di bel
 *  tempo) si aspetta una riga per ora. La pioggia dell'intervallo lungo è divisa per le ore coperte. */
export function expandToHourly(rows: MetnoHourly[]): MetnoHourly[] {
  const out: MetnoHourly[] = []
  for (const r of rows) {
    if (r.stepHours === 1) { out.push(r); continue }
    const [datePart, timePart] = r.time.split('T')
    const startHour = Number(timePart.slice(0, 2))
    for (let i = 0; i < r.stepHours; i++) {
      const h = startHour + i
      if (h > 23) break // non attraversiamo la mezzanotte: la riga successiva parte da lì
      out.push({ ...r, time: `${datePart}T${String(h).padStart(2, '0')}:00`, precipitation: r.precipitation / r.stepHours, snowfall: r.snowfall / r.stepHours, stepHours: 1 })
    }
  }
  return out
}

export function dailyFrom(rows: MetnoHourly[]): MetnoDaily[] {
  const byDay = new Map<string, MetnoHourly[]>()
  for (const r of rows) {
    const day = r.time.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), r])
  }
  const out: MetnoDaily[] = []
  for (const [date, list] of Array.from(byDay.entries())) {
    const daytime = list.filter((r) => { const h = Number(r.time.slice(11, 13)); return h >= 8 && h <= 20 })
    const rep = (daytime.length > 0 ? daytime : list).reduce((best, r) => (severity(r.weathercode) > severity(best.weathercode) ? r : best))
    out.push({
      date,
      tempMax: Math.max(...list.map((r) => r.temperature)),
      tempMin: Math.min(...list.map((r) => r.temperature)),
      precipitation: list.reduce((s, r) => s + r.precipitation, 0),
      windspeedMax: Math.max(...list.map((r) => r.windspeed)),
      weathercode: rep.weathercode,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
