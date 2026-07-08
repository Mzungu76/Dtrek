'use client'
import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { getSunTimes, type SunTimes } from '@/lib/daylight'

// Sunset/dusk for the daylight countdown + turn-back advisory — recomputed every 10min
// (stable to the minute over small position deltas, no need for per-fix precision).
export function useSunTimes(
  hikeId: string,
  routePolyline: [number, number][],
  positionRef: MutableRefObject<{ lat: number; lon: number } | null>,
): SunTimes | null {
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null)

  useEffect(() => {
    if (routePolyline.length === 0) return
    let cancelled = false
    const SUN_REFRESH_MS = 10 * 60 * 1000

    function refreshSunTimes() {
      const [lat, lon] = positionRef.current ? [positionRef.current.lat, positionRef.current.lon] : routePolyline[0]
      const times = getSunTimes(lat, lon, new Date())
      if (!cancelled) setSunTimes(times)
    }

    refreshSunTimes()
    const id = setInterval(refreshSunTimes, SUN_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])

  return sunTimes
}
