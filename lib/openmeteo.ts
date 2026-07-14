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

export interface HourlyWeatherFull extends HourlyWeather {
  feelsLike: number
  humidity: number      // %
  windDirection: number // degrees
  snowfall: number      // mm water equivalent
  uvIndex: number
}

export interface DailyWeather {
  date: string
  tempMax: number
  tempMin: number
  precipitation: number
  windspeedMax: number
  weathercode: number
}

// Compact weather summary persisted alongside an activity (weather_at_hike column)
export interface WeatherAtHike {
  temperature: number   // °C, midday reading
  tempMin: number
  tempMax: number
  windspeed: number     // km/h, midday reading
  precipitation: number // mm, summed over the day
  weathercode: number   // WMO code, midday reading
}

export interface ClothingItem {
  icon: string
  item: string
  priority: 'essential' | 'recommended' | 'optional'
}

// Shapes of the raw Open-Meteo JSON responses — only the fields this module reads.
interface OpenMeteoHourlyRaw {
  time: string[]
  temperature_2m: number[]
  windspeed_10m: number[]
  precipitation: number[]
  cloudcover: number[]
  weathercode: number[]
}
interface OpenMeteoHistoricalResponse { hourly: OpenMeteoHourlyRaw }

interface OpenMeteoDailyRaw {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_sum: number[]
  windspeed_10m_max: number[]
  weathercode: number[]
}
interface OpenMeteoForecastResponse { daily: OpenMeteoDailyRaw }

// Every field optional here (unlike the two above): fetchDayHourly already reads these
// defensively via `?.[i] ?? 0`, so the type should reflect that the caller doesn't trust
// the endpoint to always include every variable.
interface OpenMeteoDayHourlyRaw {
  time?: string[]
  temperature_2m?: number[]
  windspeed_10m?: number[]
  precipitation?: number[]
  cloudcover?: number[]
  weathercode?: number[]
  apparent_temperature?: number[]
  relative_humidity_2m?: number[]
  winddirection_10m?: number[]
  snowfall?: number[]
  uv_index?: number[]
}
interface OpenMeteoDayHourlyResponse { hourly?: OpenMeteoDayHourlyRaw }

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

// Fetches and condenses the day's weather for a single GPS point + date into a
// compact summary suitable for persisting alongside an activity.
export async function fetchWeatherAtHike(lat: number, lon: number, date: string): Promise<WeatherAtHike | null> {
  const hourly = await fetchHistoricalWeather(lat, lon, date, date)
  if (!hourly.length) return null
  const noon = hourly.find(h => h.time.slice(11, 13) === '12') ?? hourly[Math.floor(hourly.length / 2)]
  return {
    temperature:   noon.temperature,
    tempMin:       Math.min(...hourly.map(h => h.temperature)),
    tempMax:       Math.max(...hourly.map(h => h.temperature)),
    windspeed:     noon.windspeed,
    precipitation: hourly.reduce((s, h) => s + h.precipitation, 0),
    weathercode:   noon.weathercode,
  }
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
  const d = await res.json() as OpenMeteoHistoricalResponse
  const { time, temperature_2m, windspeed_10m, precipitation, cloudcover, weathercode } = d.hourly
  return time.map((t, i) => ({
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
  const d = await res.json() as OpenMeteoForecastResponse
  const { time, temperature_2m_max, temperature_2m_min, precipitation_sum, windspeed_10m_max, weathercode } = d.daily
  return time.map((t, i) => ({
    date:          t,
    tempMax:       temperature_2m_max[i],
    tempMin:       temperature_2m_min[i],
    precipitation: precipitation_sum[i],
    windspeedMax:  windspeed_10m_max[i],
    weathercode:   weathercode[i],
  }))
}

// Fetch detailed hourly data for a specific date (past or future, max 16 days ahead)
export async function fetchDayHourly(
  lat: number,
  lon: number,
  date: string,  // YYYY-MM-DD
): Promise<HourlyWeatherFull[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(date + 'T00:00:00')
  const isPast = targetDate < today

  const HOURLY_VARS = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
    'windspeed_10m', 'winddirection_10m', 'precipitation', 'snowfall',
    'cloudcover', 'weathercode', 'uv_index',
  ].join(',')

  let url: string
  if (isPast) {
    url = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
      latitude:   lat.toFixed(4),
      longitude:  lon.toFixed(4),
      start_date: date,
      end_date:   date,
      hourly:     HOURLY_VARS,
      timezone:   'Europe/Rome',
    })
  } else {
    url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude:      lat.toFixed(4),
      longitude:     lon.toFixed(4),
      start_date:    date,
      end_date:      date,
      hourly:        HOURLY_VARS,
      timezone:      'Europe/Rome',
      forecast_days: '16',
    })
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo day-hourly error')
  const d = await res.json() as OpenMeteoDayHourlyResponse
  const h = d.hourly
  if (!h?.time?.length) throw new Error('No data')

  return h.time.map((t, i) => ({
    time:          t,
    temperature:   h.temperature_2m?.[i] ?? 0,
    windspeed:     h.windspeed_10m?.[i] ?? 0,
    precipitation: h.precipitation?.[i] ?? 0,
    cloudcover:    h.cloudcover?.[i] ?? 0,
    weathercode:   h.weathercode?.[i] ?? 0,
    feelsLike:     h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? 0,
    humidity:      h.relative_humidity_2m?.[i] ?? 0,
    windDirection: h.winddirection_10m?.[i] ?? 0,
    snowfall:      h.snowfall?.[i] ?? 0,
    uvIndex:       h.uv_index?.[i] ?? 0,
  }))
}

export interface GoodWeatherWindow {
  startTime: string // ISO hour, e.g. '2026-07-03T09:00'
  endTime:   string // ISO hour of the last good hour in the window
  hours:     number
}

// Same cutoffs clothingSuggestions() already uses for "needs a rain shell"/"needs a windbreaker" —
// reused here instead of inventing a second threshold set, so the two features never disagree
// about what counts as bad weather.
const STORM_CODES = [82, 86, 95, 96, 99]

function isGoodHour(h: HourlyWeatherFull): boolean {
  return h.precipitation < 1 && h.windspeed < 25 && !STORM_CODES.includes(h.weathercode)
}

/**
 * Contiguous stretches of "good enough to hike" hours within a day's hourly forecast —
 * an escursionista-facing summary on top of the raw hourly strip WeatherWidget already shows,
 * not a new data source. Windows shorter than 2h are dropped: a single clear hour between two
 * rainy ones isn't a usable planning window.
 */
export function findGoodWeatherWindows(hourly: HourlyWeatherFull[]): GoodWeatherWindow[] {
  const windows: GoodWeatherWindow[] = []
  let windowStart: HourlyWeatherFull | null = null
  let windowHours = 0

  function closeWindow(last: HourlyWeatherFull) {
    if (windowStart && windowHours >= 2) {
      windows.push({ startTime: windowStart.time, endTime: last.time, hours: windowHours })
    }
    windowStart = null
    windowHours = 0
  }

  for (const h of hourly) {
    if (isGoodHour(h)) {
      if (!windowStart) windowStart = h
      windowHours++
    } else if (windowStart) {
      const prevIndex = hourly.indexOf(h) - 1
      closeWindow(hourly[prevIndex])
    }
  }
  if (windowStart) closeWindow(hourly[hourly.length - 1])

  return windows
}

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export function windDirLabel(deg: number): string {
  return WIND_DIRS[Math.round(deg / 45) % 8]
}

// Clothing and gear suggestions based on weather and hike parameters
export function clothingSuggestions(
  daytimeHours: HourlyWeatherFull[],
  altitudeMax = 0,
  elevationGain = 0,
): ClothingItem[] {
  if (!daytimeHours.length) return []

  const temps     = daytimeHours.map(h => h.temperature)
  const tempMin   = Math.min(...temps)
  const tempMax   = Math.max(...temps)
  const tempMid   = (tempMin + tempMax) / 2
  // Lapse rate correction to summit temperature
  const summitTemp = tempMid - elevationGain * 0.0065
  const maxWind   = Math.max(...daytimeHours.map(h => h.windspeed))
  const totalRain = daytimeHours.reduce((s, h) => s + h.precipitation, 0)
  const totalSnow = daytimeHours.reduce((s, h) => s + (h.snowfall ?? 0), 0)
  const maxUV     = Math.max(...daytimeHours.map(h => h.uvIndex ?? 0))
  const isHigh    = altitudeMax > 2000
  const isAlpine  = altitudeMax > 3000

  const items: ClothingItem[] = []

  items.push({ icon: '🥾', item: 'Scarpe da trekking', priority: 'essential' })
  items.push({ icon: '💧', item: 'Acqua (min. 1.5 L)', priority: 'essential' })

  if (summitTemp < 5) {
    items.push({ icon: '🧥', item: 'Giacca invernale / softshell pesante', priority: 'essential' })
    items.push({ icon: '🧤', item: 'Guanti e cappello invernale', priority: 'essential' })
    items.push({ icon: '🧣', item: 'Strato termico intermedio', priority: 'recommended' })
  } else if (summitTemp < 12) {
    items.push({ icon: '🧥', item: 'Giacca a vento / softshell leggero', priority: 'essential' })
    items.push({ icon: '🧤', item: 'Guanti leggeri', priority: 'recommended' })
  } else if (summitTemp < 18) {
    items.push({ icon: '🧣', item: 'Felpa o pile di ricambio', priority: 'recommended' })
  }

  if (totalRain > 5 || totalSnow > 1) {
    items.push({ icon: '🌧️', item: 'Giacca impermeabile', priority: 'essential' })
    items.push({ icon: '🎒', item: 'Cover antipioggia zaino', priority: 'essential' })
  } else if (totalRain > 1) {
    items.push({ icon: '🌦️', item: 'Giacca antipioggia leggera', priority: 'recommended' })
  }

  if (totalSnow > 2) {
    items.push({ icon: '🏔️', item: 'Ghette / rampanti leggeri', priority: 'recommended' })
  }

  if (maxWind > 40) {
    items.push({ icon: '💨', item: 'Protezione viso (buff / balaclava)', priority: 'essential' })
  } else if (maxWind > 25) {
    items.push({ icon: '💨', item: 'Guscio antivento', priority: 'recommended' })
  }

  if (maxUV >= 6) {
    items.push({ icon: '🕶️', item: 'Occhiali da sole + SPF 50+', priority: 'essential' })
    items.push({ icon: '🧢', item: 'Cappello a tesa larga', priority: 'essential' })
  } else if (maxUV >= 3) {
    items.push({ icon: '🕶️', item: 'Occhiali da sole', priority: 'recommended' })
    items.push({ icon: '🧴', item: 'Crema solare', priority: 'recommended' })
  }

  if (isHigh) {
    items.push({ icon: '⚡', item: 'Alimenti energetici (barrette, frutta secca)', priority: 'recommended' })
    items.push({ icon: '🗺️', item: 'Mappa / GPS offline', priority: 'recommended' })
  }
  if (isAlpine) {
    items.push({ icon: '🏔️', item: 'Equipaggiamento alpinistico (corda, imbracatura)', priority: 'essential' })
  }

  if (elevationGain > 600) {
    items.push({ icon: '🪄', item: 'Bastoncini da trekking', priority: 'recommended' })
  }

  items.push({ icon: '🩹', item: 'Kit di pronto soccorso', priority: 'optional' })

  return items
}
