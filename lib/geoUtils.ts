export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function minDistToTrack(lat: number, lon: number, track: [number, number][]): number {
  let min = Infinity
  for (const [tlat, tlon] of track) {
    const d = haversineM(lat, lon, tlat, tlon)
    if (d < min) min = d
  }
  return min
}

/** Returns "s,w,n,e" string with 0.01° padding around the track bounding box. */
export function computeBbox(track: [number, number][], pad = 0.01): string {
  const lats = track.map(p => p[0])
  const lons = track.map(p => p[1])
  return [
    (Math.min(...lats) - pad).toFixed(5),
    (Math.min(...lons) - pad).toFixed(5),
    (Math.max(...lats) + pad).toFixed(5),
    (Math.max(...lons) + pad).toFixed(5),
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
