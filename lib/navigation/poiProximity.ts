import { haversineM } from '@/lib/geoUtils'
import type { NavPoi } from './types'

const DEFAULT_NOTIFY_RADIUS_M = 150
const CELL_DEG = 0.01 // ~1.1km at the equator — coarse enough that a route's POIs land in a handful of cells

function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lon / CELL_DEG)}`
}

/**
 * Grid-bucket spatial index over route POIs. Avoids scanning every POI on
 * every GPS fix — irrelevant with a few dozen POIs, but a real cost once a
 * route caches hundreds/thousands of them (dense areas, long routes).
 */
export class PoiSpatialIndex {
  private readonly cells = new Map<string, NavPoi[]>()
  private readonly maxRadiusM: number

  constructor(pois: NavPoi[]) {
    this.maxRadiusM = Math.max(DEFAULT_NOTIFY_RADIUS_M, ...pois.map(p => p.notifyRadiusM ?? DEFAULT_NOTIFY_RADIUS_M))
    for (const poi of pois) {
      const key = cellKey(poi.lat, poi.lon)
      const bucket = this.cells.get(key)
      if (bucket) bucket.push(poi); else this.cells.set(key, [poi])
    }
  }

  /** POIs within their own notify radius of (lat, lon), with the live distance. */
  nearby(lat: number, lon: number): { poi: NavPoi; distanceM: number }[] {
    // Search the 3x3 (or wider, if maxRadiusM spans more than one cell) block of cells around the fix.
    const cellSpan = Math.max(1, Math.ceil((this.maxRadiusM / 111000) / CELL_DEG))
    const cLat = Math.floor(lat / CELL_DEG)
    const cLon = Math.floor(lon / CELL_DEG)
    const hits: { poi: NavPoi; distanceM: number }[] = []

    for (let dLat = -cellSpan; dLat <= cellSpan; dLat++) {
      for (let dLon = -cellSpan; dLon <= cellSpan; dLon++) {
        const bucket = this.cells.get(`${cLat + dLat}:${cLon + dLon}`)
        if (!bucket) continue
        for (const poi of bucket) {
          const distanceM = haversineM(lat, lon, poi.lat, poi.lon)
          if (distanceM <= (poi.notifyRadiusM ?? DEFAULT_NOTIFY_RADIUS_M)) hits.push({ poi, distanceM })
        }
      }
    }
    return hits
  }
}
