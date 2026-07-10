import { useEffect, useState } from 'react'
import { getUserSettingsCached } from './sync/userSettingsStore'

export interface DrivingInfo {
  distanceMeters: number
  durationSeconds: number
}

const drivingInfoCache = new Map<string, Promise<DrivingInfo | null>>()

/** Fetches driving distance/duration from the user's starting point to the trail start.
 *  Deduplicates concurrent/repeated requests for the same coordinate pair. */
export function fetchDrivingInfo(
  fromLat: number, fromLon: number, toLat: number, toLon: number,
): Promise<DrivingInfo | null> {
  const key = `${fromLat},${fromLon}→${toLat},${toLon}`
  const cached = drivingInfoCache.get(key)
  if (cached) return cached

  const promise = fetch(`/api/driving-distance?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => (data && typeof data.distanceMeters === 'number')
      ? { distanceMeters: data.distanceMeters, durationSeconds: data.durationSeconds }
      : null)
    .catch(() => null)

  drivingInfoCache.set(key, promise)
  return promise
}

/** Formats driving duration compactly, e.g. "1h 25min" or "45min". */
export function formatDrivingDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

/** Builds a Google Maps directions URL from the user's starting point to a trail start. */
export function googleMapsDirectionsUrl(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLon}&destination=${toLat},${toLon}&travelmode=driving`
}

/** True if two coordinate pairs are close enough (~11 m) to be considered the same origin. */
export function originMatches(aLat?: number | null, aLon?: number | null, bLat?: number | null, bLon?: number | null): boolean {
  if (aLat == null || aLon == null || bLat == null || bLon == null) return false
  return Math.abs(aLat - bLat) < 1e-4 && Math.abs(aLon - bLon) < 1e-4
}

/** Returns the [lat, lon] of a planned hike's trail start, or null if unavailable. */
export function getTrailStartPoint(hike: { routePolyline?: [number, number][] }): [number, number] | null {
  const p = hike.routePolyline?.[0]
  return p ? p : null
}

let startingPointPromise: Promise<{ lat: number; lon: number } | null> | null = null

/** Fetches the user's starting address coordinates from /api/user-settings (cached per page load). */
export function getUserStartingPoint(): Promise<{ lat: number; lon: number } | null> {
  if (!startingPointPromise) {
    startingPointPromise = getUserSettingsCached()
      .then(d => (d.startingLat != null && d.startingLon != null) ? { lat: d.startingLat, lon: d.startingLon } : null)
      .catch(() => null)
  }
  return startingPointPromise
}

/** Drops the cached starting point so the next getUserStartingPoint() call refetches it — call
 *  this right after saving/clearing the address in Impostazioni (components/profilo/
 *  SectionIndirizzo.tsx), otherwise every screen that already called getUserStartingPoint() this
 *  page load (Guida/Resoconto galleries) keeps using the address from before the change until a
 *  full reload. */
export function invalidateUserStartingPoint(): void {
  startingPointPromise = null
}

interface DrivingCacheFields {
  cachedDrivingOriginLat?:       number
  cachedDrivingOriginLon?:       number
  cachedDrivingDistanceMeters?:  number
  cachedDrivingDurationSeconds?: number
}

/**
 * Resolves driving distance/duration from the user's starting point to a planned
 * hike's trailhead, reusing a Supabase-cached value when the origin hasn't moved
 * — shared by the Diario feed card and the Programma detail screen so both avoid
 * re-hitting the OSRM routing service on every render.
 */
export function useDrivingInfo(hike: DrivingCacheFields & { routePolyline?: [number, number][] }, onCache?: (info: DrivingInfo & { originLat: number; originLon: number }) => void) {
  const trailStart = getTrailStartPoint(hike)
  const { cachedDrivingOriginLat: cachedOriginLat, cachedDrivingOriginLon: cachedOriginLon, cachedDrivingDistanceMeters: cachedDistance, cachedDrivingDurationSeconds: cachedDuration } = hike
  const [driving, setDriving] = useState<DrivingInfo | null>(
    cachedDistance != null && cachedDuration != null ? { distanceMeters: cachedDistance, durationSeconds: cachedDuration } : null,
  )
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(
    cachedOriginLat != null && cachedOriginLon != null ? { lat: cachedOriginLat, lon: cachedOriginLon } : null,
  )

  useEffect(() => {
    if (!trailStart) return
    let cancelled = false
    getUserStartingPoint().then(pt => {
      if (cancelled || !pt) return
      setOrigin(pt)
      if (originMatches(cachedOriginLat, cachedOriginLon, pt.lat, pt.lon) && cachedDistance != null && cachedDuration != null) {
        setDriving({ distanceMeters: cachedDistance, durationSeconds: cachedDuration })
        return
      }
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (cancelled) return
        setDriving(info)
        if (info) onCache?.({ ...info, originLat: pt.lat, originLon: pt.lon })
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailStart?.[0], trailStart?.[1], cachedOriginLat, cachedOriginLon, cachedDistance, cachedDuration])

  return { driving, origin, trailStart }
}
