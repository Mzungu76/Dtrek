// Thin client for Waymarked Trails (hiking.waymarkedtrails.org) — pre-processed
// OSM hiking-route database used to power the Esplora map.
//
// The exact JSON shape of /list, /search and /details was deduced from the
// public waymarked-trails-site source (the live API returns 403 to datacenter
// IPs, so it couldn't be verified empirically). Parsing is centralized here
// so a shape mismatch can be fixed in one place.

export const WMT_BASE   = 'https://hiking.waymarkedtrails.org/api/v1'
export const USER_AGENT = 'DTrek/1.0 (personal trekking diary; mzulpt@gmail.com)'

export interface WmtTrailSummary {
  id: number
  name: string
  ref?: string
  network?: string
}

const EARTH_RADIUS_M = 6378137

/** EPSG:3857 (Web Mercator) → WGS84 lon/lat. Waymarked Trails geometry is returned in 3857. */
export function epsg3857ToWgs84(x: number, y: number): [lon: number, lat: number] {
  const lon = (x / EARTH_RADIUS_M) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI)
  return [lon, lat]
}

export function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
  }
  return null
}

/** Tolerates a few plausible envelope shapes ({results:[]}, {hits:[]}, bare array). */
export function extractResults(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[]
    if (Array.isArray(obj.hits))    return obj.hits as Record<string, unknown>[]
  }
  return []
}

export function normalizeListItem(raw: Record<string, unknown>): WmtTrailSummary | null {
  const id = Number(raw.id)
  if (!id) return null
  return {
    id,
    name: (raw.name as string) || (raw.ref as string) || `Percorso ${id}`,
    ref: raw.ref as string | undefined,
    network: (raw.network as string) || (raw.level as string) || undefined,
  }
}

/** Extracts a flat array of elevation values from the /elevation profile response, whatever its shape. */
export function extractElevationProfile(json: unknown): number[] | null {
  if (!json) return null
  if (Array.isArray(json)) {
    if (json.every(v => typeof v === 'number')) return json as number[]
    const vals = json.map(item => {
      if (Array.isArray(item)) return item[item.length - 1]
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        return o.elevation ?? o.ele ?? o.height ?? o.alt
      }
      return undefined
    }).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals : null
  }
  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>
    for (const key of ['elevation', 'heights', 'profile', 'coordinates']) {
      if (Array.isArray(obj[key])) {
        const nested = extractElevationProfile(obj[key])
        if (nested) return nested
      }
    }
  }
  return null
}

export function computeElevationStats(values: number[]) {
  let gain = 0, loss = 0
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    if (d > 0) gain += d; else loss += Math.abs(d)
  }
  return {
    elevationGain: Math.round(gain),
    elevationLoss: Math.round(loss),
    altitudeMax: Math.round(Math.max(...values)),
    altitudeMin: Math.round(Math.min(...values)),
  }
}
