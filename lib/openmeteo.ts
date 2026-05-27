// Open-Meteo API — 100% gratuita, nessuna chiave richiesta
// https://open-meteo.com/

export interface HourlyWeather {
  time: string
  temperature: number   // °C
  windspeed: number     // km/h
  precipitation: number // mm
  cloudcover: number    // %
  weathercode: number   // WMO code
}

export interface DailyWeather {
  date: string
  tempMax: number
  tempMin: number
  precipitation: number
  windspeedMax: number
  weathercode: number
}

// WMO 4677 codes → Italian label + emoji
const WMO: Record<number, [string, string]> = {
  0:  ['☀️', 'Cielo sereno'],
  1:  ['🌤', 'Per lo più sereno'],
  2:  ['⛅', 'Parz. nuvoloso'],
  3:  ['☁️', 'Coperto'],
  45: ['🌫', 'Nebbia'],
  48: ['🌫', 'Nebbia con brina'],
  51: ['🌦', 'Pioviggine leggera'],
  53: ['🌦', 'Pioviggine'],
  55: ['🌦', 'Pioviggine intensa'],
  61: ['🌧', 'Pioggia leggera'],
  63: ['🌧', 'Pioggia'],
  65: ['🌧', 'Pioggia intensa'],
  71: ['❄️', 'Neve leggera'],
  73: ['❄️', 'Neve'],
  75: ['❄️', 'Neve intensa'],
  77: ['🌨', 'Granuli di neve'],
  80: ['🌦', 'Rovesci leggeri'],
  81: ['🌧', 'Rovesci'],
  82: ['⛈', 'Rovesci violenti'],
  85: ['🌨', 'Rovesci di neve'],
  86: ['🌨', 'Rovesci neve intensi'],
  95: ['⛈', 'Temporale'],
  96: ['⛈', 'Temporale con grandine'],
  99: ['⛈', 'Temporale, grandine forte'],
}

export function wmoInfo(code: number): { emoji: string; label: string } {
  const entry = WMO[code] ?? ['❓', `Codice ${code}`]
  return { emoji: entry[0], label: entry[1] }
}

export async function fetchHistoricalWeather(
  lat: number,
  lon: number,
  startDate: string,  // YYYY-MM-DD
  endDate: string,
): Promise<HourlyWeather[]> {
  const url = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lon.toFixed(4),
    start_date: startDate,
    end_date:   endDate,
    hourly:     'temperature_2m,windspeed_10m,precipitation,cloudcover,weathercode',
    timezone:   'Europe/Rome',
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo historical error')
  const d = await res.json()
  const { time, temperature_2m, windspeed_10m, precipitation, cloudcover, weathercode } = d.hourly
  return (time as string[]).map((t, i) => ({
    time:          t,
    temperature:   temperature_2m[i],
    windspeed:     windspeed_10m[i],
    precipitation: precipitation[i],
    cloudcover:    cloudcover[i],
    weathercode:   weathercode[i],
  }))
}

export async function fetchForecastWeather(
  lat: number,
  lon: number,
  days = 7,
): Promise<DailyWeather[]> {
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude:      lat.toFixed(4),
    longitude:     lon.toFixed(4),
    daily:         'temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode',
    timezone:      'Europe/Rome',
    forecast_days: String(Math.min(days, 16)),
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo forecast error')
  const d = await res.json()
  const { time, temperature_2m_max, temperature_2m_min, precipitation_sum, windspeed_10m_max, weathercode } = d.daily
  return (time as string[]).map((t, i) => ({
    date:         t,
    tempMax:      temperature_2m_max[i],
    tempMin:      temperature_2m_min[i],
    precipitation: precipitation_sum[i],
    windspeedMax: windspeed_10m_max[i],
    weathercode:  weathercode[i],
  }))
}
