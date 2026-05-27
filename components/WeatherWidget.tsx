'use client'
import { useState, useEffect } from 'react'
import { fetchHistoricalWeather, fetchForecastWeather, wmoInfo } from '@/lib/openmeteo'
import type { HourlyWeather, DailyWeather } from '@/lib/openmeteo'

interface HistoricalProps {
  mode: 'historical'
  lat: number
  lon: number
  date: string  // YYYY-MM-DD
}

interface ForecastProps {
  mode: 'forecast'
  lat: number
  lon: number
  days?: number
}

type Props = HistoricalProps | ForecastProps

export default function WeatherWidget(props: Props) {
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [hourly,  setHourly]  = useState<HourlyWeather[]>([])
  const [daily,   setDaily]   = useState<DailyWeather[]>([])

  useEffect(() => {
    setLoading(true)
    setError(null)
    if (props.mode === 'historical') {
      fetchHistoricalWeather(props.lat, props.lon, props.date, props.date)
        .then(h => {
          // Keep only daytime hours (6-21)
          setHourly(h.filter(x => {
            const hh = parseInt(x.time.slice(11, 13))
            return hh >= 6 && hh <= 21
          }))
        })
        .catch(() => setError('Dati meteo non disponibili'))
        .finally(() => setLoading(false))
    } else {
      fetchForecastWeather(props.lat, props.lon, props.days ?? 7)
        .then(setDaily)
        .catch(() => setError('Previsioni non disponibili'))
        .finally(() => setLoading(false))
    }
  }, [props.mode, props.lat, props.lon, (props as any).date, (props as any).days])

  if (loading) return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 animate-pulse h-24" />
  )
  if (error) return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
  )

  if (props.mode === 'historical') {
    if (hourly.length === 0) return null
    const noon = hourly.find(h => h.time.slice(11, 13) === '12') ?? hourly[Math.floor(hourly.length / 2)]
    const info  = wmoInfo(noon.weathercode)
    const rain  = hourly.reduce((s, h) => s + h.precipitation, 0)
    const tMin  = Math.min(...hourly.map(h => h.temperature))
    const tMax  = Math.max(...hourly.map(h => h.temperature))

    return (
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
        <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-2">Meteo del giorno</p>
        <div className="flex items-center gap-4">
          <span className="text-4xl">{info.emoji}</span>
          <div>
            <p className="font-semibold text-stone-800">{info.label}</p>
            <p className="text-sm text-stone-600">{tMin.toFixed(0)}° – {tMax.toFixed(0)}°C · vento {noon.windspeed} km/h</p>
            {rain > 0 && <p className="text-sm text-sky-700">💧 Precipitazioni: {rain.toFixed(1)} mm</p>}
          </div>
        </div>
        {/* Hourly strip */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {hourly.filter((_, i) => i % 3 === 0).map(h => {
            const inf = wmoInfo(h.weathercode)
            return (
              <div key={h.time} className="flex-shrink-0 text-center text-xs">
                <p className="text-stone-400">{h.time.slice(11, 16)}</p>
                <p className="text-lg">{inf.emoji}</p>
                <p className="font-semibold text-stone-700">{h.temperature.toFixed(0)}°</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Forecast mode
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Previsioni meteo</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {daily.map(d => {
          const info = wmoInfo(d.weathercode)
          const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })
          return (
            <div key={d.date} className="flex-shrink-0 text-center min-w-[56px]">
              <p className="text-xs text-stone-500 capitalize">{dayLabel}</p>
              <p className="text-2xl my-0.5">{info.emoji}</p>
              <p className="text-xs font-semibold text-stone-700">{d.tempMax.toFixed(0)}°<span className="text-stone-400 font-normal">/{d.tempMin.toFixed(0)}°</span></p>
              {d.precipitation > 0 && <p className="text-xs text-sky-600">{d.precipitation.toFixed(0)}mm</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
