'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  fetchHistoricalWeather, fetchForecastWeather, fetchDayHourly,
  clothingSuggestions, wmoInfo, windDirLabel, findGoodWeatherWindows,
} from '@/lib/openmeteo'
import type { HourlyWeather, HourlyWeatherFull, DailyWeather, ClothingItem } from '@/lib/openmeteo'

function formatHour(iso: string): string {
  return iso.slice(11, 16)
}

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

interface PlannedProps {
  mode: 'planned'
  lat: number
  lon: number
  date?: string          // YYYY-MM-DD of the planned hike
  altitudeMax?: number   // summit altitude in meters
  elevationGain?: number // total elevation gain in meters
  days?: number
}

type Props = HistoricalProps | ForecastProps | PlannedProps

function priorityStyle(p: ClothingItem['priority']) {
  return p === 'essential'   ? 'bg-red-100 text-red-700 border-red-200'
       : p === 'recommended' ? 'bg-amber-100 text-amber-700 border-amber-200'
       : 'bg-stone-100 text-stone-500 border-stone-200'
}
function priorityLabel(p: ClothingItem['priority']) {
  return p === 'essential' ? 'essenziale' : p === 'recommended' ? 'consigliato' : 'opzionale'
}

// 7-day strip shared across modes
function DayStrip({ daily }: { daily: DailyWeather[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
      {daily.map(d => {
        const info     = wmoInfo(d.weathercode)
        const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })
        return (
          <div key={d.date} className="flex-shrink-0 text-center min-w-[52px]">
            <p className="text-[10px] text-stone-400 capitalize">{dayLabel}</p>
            <p className="text-xl my-0.5">{info.emoji}</p>
            <p className="text-[11px] font-semibold text-stone-700">
              {d.tempMax.toFixed(0)}°<span className="text-stone-400 font-normal">/{d.tempMin.toFixed(0)}°</span>
            </p>
            {d.precipitation > 0 && <p className="text-[10px] text-sky-600">{d.precipitation.toFixed(0)} mm</p>}
          </div>
        )
      })}
    </div>
  )
}

export default function WeatherWidget(props: Props) {
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState<string | null>(null)
  const [hourly,      setHourly]     = useState<HourlyWeather[]>([])
  const [hourlyFull,  setHourlyFull] = useState<HourlyWeatherFull[]>([])
  const [daily,       setDaily]      = useState<DailyWeather[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dateKey        = (props as any).date
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const daysKey        = (props as any).days
  const altitudeMax    = (props as PlannedProps).altitudeMax  ?? 0
  const elevationGain  = (props as PlannedProps).elevationGain ?? 0

  useEffect(() => {
    setLoading(true)
    setError(null)

    if (props.mode === 'historical') {
      fetchHistoricalWeather(props.lat, props.lon, props.date, props.date)
        .then(h => setHourly(h.filter(x => {
          const hh = parseInt(x.time.slice(11, 13))
          return hh >= 6 && hh <= 21
        })))
        .catch(() => setError('Dati meteo non disponibili'))
        .finally(() => setLoading(false))
      return
    }

    if (props.mode === 'forecast') {
      fetchForecastWeather(props.lat, props.lon, props.days ?? 7)
        .then(setDaily)
        .catch(() => setError('Previsioni non disponibili'))
        .finally(() => setLoading(false))
      return
    }

    // planned mode: fetch both day-hourly (if date set) and 7-day forecast
    const tasks: Promise<void>[] = [
      fetchForecastWeather(props.lat, props.lon, props.days ?? 7)
        .then(setDaily).catch(() => {}),
    ]
    if (props.date) {
      tasks.push(
        fetchDayHourly(props.lat, props.lon, props.date)
          .then(h => setHourlyFull(h.filter(x => {
            const hh = parseInt(x.time.slice(11, 13))
            return hh >= 5 && hh <= 21
          })))
          .catch(() => {}),
      )
    }
    Promise.all(tasks).finally(() => setLoading(false))
  }, [props.mode, props.lat, props.lon, dateKey, daysKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const clothes = useMemo((): ClothingItem[] => {
    if (props.mode !== 'planned' || !hourlyFull.length) return []
    return clothingSuggestions(
      hourlyFull.filter(h => {
        const hh = parseInt(h.time.slice(11, 13))
        return hh >= 6 && hh <= 20
      }),
      altitudeMax,
      elevationGain,
    )
  }, [hourlyFull, props.mode, altitudeMax, elevationGain])

  if (loading) return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 animate-pulse h-24" />
  )
  if (error && !daily.length && !hourly.length && !hourlyFull.length) return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
  )

  // ── Historical mode ──────────────────────────────────────────────────────────
  if (props.mode === 'historical') {
    if (!hourly.length) return null
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

  // ── Forecast mode ────────────────────────────────────────────────────────────
  if (props.mode === 'forecast') {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Previsioni meteo</p>
        <DayStrip daily={daily} />
      </div>
    )
  }

  // ── Planned mode ─────────────────────────────────────────────────────────────
  const plannedDate = (props as PlannedProps).date
  const hikeHours   = hourlyFull.filter(h => {
    const hh = parseInt(h.time.slice(11, 13))
    return hh >= 6 && hh <= 20
  })
  const hasDetail  = hikeHours.length > 0
  const noon       = hikeHours.find(h => h.time.slice(11, 13) === '12') ?? hikeHours[Math.floor(hikeHours.length / 2)]
  const info       = noon ? wmoInfo(noon.weathercode) : null
  const tMin       = hasDetail ? Math.min(...hikeHours.map(h => h.temperature)) : null
  const tMax       = hasDetail ? Math.max(...hikeHours.map(h => h.temperature)) : null
  const maxWind    = hasDetail ? Math.max(...hikeHours.map(h => h.windspeed)) : null
  const totalRain  = hasDetail ? hikeHours.reduce((s, h) => s + h.precipitation, 0) : null
  const maxUV      = hasDetail ? Math.max(...hikeHours.map(h => h.uvIndex)) : null

  // Fallback to daily forecast entry for this date
  const dayForecast   = plannedDate ? daily.find(d => d.date === plannedDate) : null
  const displayInfo   = info ?? (dayForecast ? wmoInfo(dayForecast.weathercode) : null)
  const displayTMin   = tMin  ?? dayForecast?.tempMin  ?? null
  const displayTMax   = tMax  ?? dayForecast?.tempMax  ?? null
  const displayRain   = totalRain ?? (dayForecast?.precipitation ?? null)
  const displayWind   = maxWind ?? dayForecast?.windspeedMax ?? null

  // Summit temperature estimate (lapse rate correction)
  const altCorr       = elevationGain * 0.0065
  const summitTempMin = displayTMin !== null ? Math.round(displayTMin - altCorr) : null
  const summitTempMax = displayTMax !== null ? Math.round(displayTMax - altCorr) : null

  // Good-weather windows within the hiking hours, for planning a start time around them
  const goodWindows = hasDetail ? findGoodWeatherWindows(hikeHours) : []

  // Date label
  const dateLabel = plannedDate
    ? new Date(plannedDate + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  return (
    <div className="space-y-3">

      {/* ── Main weather card ── */}
      <div className="rounded-xl border border-sky-100 bg-sky-50 overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-start gap-4">
          <span className="text-5xl shrink-0 leading-none">{displayInfo?.emoji ?? '🌡️'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-0.5">
              {dateLabel ? `Meteo pianificata · ${dateLabel}` : 'Previsioni meteo'}
            </p>
            <p className="font-semibold text-stone-800">{displayInfo?.label ?? '—'}</p>
            {displayTMin !== null && displayTMax !== null && (
              <p className="text-sm text-stone-600">
                {displayTMin.toFixed(0)}° – {displayTMax.toFixed(0)}°C
                {noon && ` · Percepita ${noon.feelsLike.toFixed(0)}°`}
              </p>
            )}
          </div>
        </div>

        {/* Key stats row */}
        {(displayRain !== null || displayWind !== null || (noon?.humidity ?? 0) > 0 || (maxUV ?? 0) > 0) && (
          <div className="px-4 pb-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {(displayRain ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span>💧</span>
                <span className="font-semibold text-stone-700">{(displayRain ?? 0).toFixed(1)} mm pioggia</span>
              </div>
            )}
            {(displayWind ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span>💨</span>
                <span className="font-semibold text-stone-700">
                  {(displayWind ?? 0).toFixed(0)} km/h{noon ? ` ${windDirLabel(noon.windDirection)}` : ''}
                </span>
              </div>
            )}
            {(noon?.humidity ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span>💦</span>
                <span className="font-semibold text-stone-700">{noon!.humidity}% umidità</span>
              </div>
            )}
            {(maxUV ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span>☀️</span>
                <span className="font-semibold text-stone-700">UV {maxUV?.toFixed(0)}</span>
              </div>
            )}
          </div>
        )}

        {/* Summit temperature estimate */}
        {altitudeMax > 1000 && summitTempMin !== null && summitTempMax !== null && (
          <div className="mx-4 mb-3 bg-white/60 rounded-lg px-3 py-2 flex items-center gap-2 border border-sky-100">
            <span className="text-base">⛰️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-500">Temperatura stimata in quota</p>
              <p className="text-sm font-semibold text-stone-800">
                {summitTempMin}° – {summitTempMax}°C a ~{Math.round(altitudeMax)} m
              </p>
            </div>
            <p className="text-[10px] text-stone-400 text-right shrink-0">−{altCorr.toFixed(1)}°C</p>
          </div>
        )}

        {/* Good-weather windows */}
        {goodWindows.length > 0 && (
          <div className="mx-4 mb-3 bg-white/60 rounded-lg px-3 py-2 border border-sky-100">
            <p className="text-xs text-stone-500 mb-1">☀️ Finestre di bel tempo</p>
            <p className="text-sm font-semibold text-stone-800">
              {goodWindows.map(w => `${formatHour(w.startTime)}–${formatHour(w.endTime)}`).join(' · ')}
            </p>
          </div>
        )}

        {/* Hourly strip */}
        {hasDetail && (
          <div className="px-4 pb-4">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Ora per ora</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {hourlyFull.filter((_, i) => i % 2 === 0).map(h => {
                const inf = wmoInfo(h.weathercode)
                const isRainy = h.precipitation > 0.3
                return (
                  <div key={h.time} className="flex-shrink-0 text-center min-w-[44px]">
                    <p className="text-[10px] text-stone-400">{h.time.slice(11, 16)}</p>
                    <p className="text-xl my-0.5">{inf.emoji}</p>
                    <p className="text-xs font-bold text-stone-800">{h.temperature.toFixed(0)}°</p>
                    {isRainy && <p className="text-[9px] text-sky-600">{h.precipitation.toFixed(1)}</p>}
                    {h.windspeed > 20 && <p className="text-[9px] text-stone-400">{h.windspeed.toFixed(0)}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Clothing & gear suggestions ── */}
      {clothes.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Abbigliamento consigliato</p>
          <div className="space-y-2">
            {clothes.filter(c => c.priority !== 'optional').slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-base w-6 text-center shrink-0">{c.icon}</span>
                <span className="text-sm text-stone-700 flex-1">{c.item}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${priorityStyle(c.priority)}`}>
                  {priorityLabel(c.priority)}
                </span>
              </div>
            ))}
            {clothes.filter(c => c.priority === 'optional').length > 0 && (
              <details className="mt-1">
                <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600 transition-colors">
                  Mostra opzionali ({clothes.filter(c => c.priority === 'optional').length})
                </summary>
                <div className="space-y-2 mt-2">
                  {clothes.filter(c => c.priority === 'optional').map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center shrink-0">{c.icon}</span>
                      <span className="text-sm text-stone-500 flex-1">{c.item}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${priorityStyle(c.priority)}`}>
                        {priorityLabel(c.priority)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* ── 7-day context strip ── */}
      {daily.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Prossimi 7 giorni</p>
          <DayStrip daily={daily.slice(0, 7)} />
        </div>
      )}
    </div>
  )
}
