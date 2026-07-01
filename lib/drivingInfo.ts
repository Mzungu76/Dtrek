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

/** Returns the [lat, lon] of a planned hike's trail start, or null if unavailable. */
export function getTrailStartPoint(hike: { routePolyline?: [number, number][] }): [number, number] | null {
  const p = hike.routePolyline?.[0]
  return p ? p : null
}

let startingPointPromise: Promise<{ lat: number; lon: number } | null> | null = null

/** Fetches the user's starting address coordinates from /api/user-settings (cached per page load). */
export function getUserStartingPoint(): Promise<{ lat: number; lon: number } | null> {
  if (!startingPointPromise) {
    startingPointPromise = fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => (d.startingLat != null && d.startingLon != null) ? { lat: d.startingLat, lon: d.startingLon } : null)
      .catch(() => null)
  }
  return startingPointPromise
}
