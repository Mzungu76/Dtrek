'use client'
import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { fetchDayHourly } from '@/lib/openmeteo'
import type { NavigationEngine } from '@/lib/navigation/navigationEngine'

// Feeds PaceAssistant's weather correction (lib/navigation/paceAssistant.ts) — the engine
// itself makes no network calls, so this owns the periodic Open-Meteo refresh and pushes
// the result in. Refreshed every 20min, not per GPS fix: hourly weather doesn't need
// finer granularity, and re-fetching on every fix would hammer the API for no benefit.
export function useWeatherRefresh(
  hikeId: string,
  routePolyline: [number, number][],
  positionRef: MutableRefObject<{ lat: number; lon: number } | null>,
  engineRef: MutableRefObject<NavigationEngine | null>,
): void {
  useEffect(() => {
    if (routePolyline.length === 0) return
    let cancelled = false
    const WEATHER_REFRESH_MS = 20 * 60 * 1000

    function refreshWeather() {
      const [lat, lon] = positionRef.current ? [positionRef.current.lat, positionRef.current.lon] : routePolyline[0]
      const today = new Date().toISOString().slice(0, 10)
      fetchDayHourly(lat, lon, today).then((hours) => {
        if (cancelled || !hours.length) return
        const nowMs = Date.now()
        const closest = hours.reduce((best, h) =>
          Math.abs(new Date(h.time).getTime() - nowMs) < Math.abs(new Date(best.time).getTime() - nowMs) ? h : best)
        engineRef.current?.setWeatherConditions({ tempC: closest.temperature, windKmh: closest.windspeed, precipMm: closest.precipitation })
      }).catch(() => {})
    }

    refreshWeather()
    const id = setInterval(refreshWeather, WEATHER_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])
}
