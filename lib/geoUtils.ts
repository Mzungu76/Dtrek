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
