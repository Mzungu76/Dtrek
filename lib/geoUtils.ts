/** Approximates a circle of `radiusM` around (lat, lon) as a closed GeoJSON-style [lon, lat] polygon ring, for map layers (e.g. MapLibre GL, which has no native meter-radius circle unlike Leaflet's L.circle). */
export function circlePolygonLonLat(lat: number, lon: number, radiusM: number, points = 32): [number, number][] {
  const ring: [number, number][] = []
  const latRad = lat * Math.PI / 180
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos(latRad)
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI
    const dLat = (radiusM * Math.sin(theta)) / metersPerDegLat
    const dLon = metersPerDegLon > 0 ? (radiusM * Math.cos(theta)) / metersPerDegLon : 0
    ring.push([lon + dLon, lat + dLat])
  }
  return ring
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const EARTH_R_M = 6371000

function toLocalXY(lat: number, lon: number, lat0: number): [number, number] {
  const x = (lon * Math.PI / 180) * Math.cos(lat0 * Math.PI / 180) * EARTH_R_M
  const y = (lat * Math.PI / 180) * EARTH_R_M
  return [x, y]
}

/** Min distance in meters from (lat, lon) to the segment [a, b], via a local equirectangular projection (accurate well under 1% error at the segment lengths involved here). */
function distToSegmentM(lat: number, lon: number, a: [number, number], b: [number, number]): number {
  const lat0 = (a[0] + b[0]) / 2
  const [px, py] = toLocalXY(lat, lon, lat0)
  const [ax, ay] = toLocalXY(a[0], a[1], lat0)
  const [bx, by] = toLocalXY(b[0], b[1], lat0)
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return haversineM(lat, lon, a[0], a[1])
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Min distance in meters from (lat, lon) to the polyline `track`, measured against every segment (not just vertices) so a point between two sparse track vertices is measured against the line connecting them. */
export function minDistToTrack(lat: number, lon: number, track: [number, number][]): number {
  if (track.length === 0) return Infinity
  if (track.length === 1) return haversineM(lat, lon, track[0][0], track[0][1])
  let min = Infinity
  for (let i = 1; i < track.length; i++) {
    const d = distToSegmentM(lat, lon, track[i - 1], track[i])
    if (d < min) min = d
  }
  return min
}

/** Returns "s,w,n,e" string with 0.01° padding around the track bounding box. */
export function computeBbox(track: [number, number][], pad = 0.01): string {
  // reduce(), not Math.min/max(...arr) — a very long recording (100k+ points) would blow the
  // call stack spreading the whole array as arguments. Matches Math.min/max(...[])'s original
  // Infinity/-Infinity behavior on an empty track instead of throwing on track[0].
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lat, lon] of track) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return [
    (minLat - pad).toFixed(5),
    (minLon - pad).toFixed(5),
    (maxLat + pad).toFixed(5),
    (maxLon + pad).toFixed(5),
  ].join(',')
}

/** Rounds bbox coords to 2 decimal places (~1 km) for cache key normalisation. */
export function normalizeBboxKey(bbox: string): string {
  return bbox.split(',').map(v => (Math.round(parseFloat(v) * 100) / 100).toFixed(2)).join('_')
}

interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

/** Returns the centroid {lat, lon} of any GeoJSON geometry (Point, Polygon, LineString, Multi*). */
export function gnaGeomToCentroid(geometry: GeoJsonGeometry): { lat: number; lon: number } | null {
  try {
    if (geometry.type === 'Point') {
      const c = geometry.coordinates as [number, number]
      return { lat: c[1], lon: c[0] }
    }
    if (geometry.type === 'Polygon') {
      const ring = (geometry.coordinates as [number, number][][])[0]
      return {
        lat: ring.reduce((s, c) => s + c[1], 0) / ring.length,
        lon: ring.reduce((s, c) => s + c[0], 0) / ring.length,
      }
    }
    if (geometry.type === 'LineString') {
      const coords = geometry.coordinates as [number, number][]
      const mid = Math.floor(coords.length / 2)
      return { lat: coords[mid][1], lon: coords[mid][0] }
    }
    if (geometry.type === 'MultiPolygon') {
      return gnaGeomToCentroid({ type: 'Polygon', coordinates: (geometry.coordinates as unknown[][][][])[0] })
    }
    if (geometry.type === 'MultiLineString') {
      return gnaGeomToCentroid({ type: 'LineString', coordinates: (geometry.coordinates as unknown[][][])[0] })
    }
  } catch {}
  return null
}
