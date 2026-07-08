// Meter-based bbox/point padding, additive to geoUtils.ts's computeBbox (which only
// accepts degree padding) — kept separate so existing call sites stay untouched.

export function metersPerDegreeAt(lat: number): { lat: number; lon: number } {
  return {
    lat: 111320,
    lon: 111320 * Math.cos(lat * Math.PI / 180),
  }
}

/** Returns "s,w,n,e" bbox string around `track` ([lat,lon][]), padded by bufferM meters. */
export function bboxBufferMeters(track: [number, number][], bufferM: number): string {
  // reduce(), not Math.min/max(...arr) — a very long recording (100k+ points) would blow the
  // call stack spreading the whole array as arguments.
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lat, lon] of track) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  const { lat: mPerDegLat, lon: mPerDegLon } = metersPerDegreeAt((minLat + maxLat) / 2)
  const padLat = bufferM / mPerDegLat
  const padLon = bufferM / mPerDegLon
  return [
    (minLat - padLat).toFixed(5),
    (minLon - padLon).toFixed(5),
    (maxLat + padLat).toFixed(5),
    (maxLon + padLon).toFixed(5),
  ].join(',')
}

/** Returns "s,w,n,e" bbox string around a single point, padded by bufferM meters. */
export function pointBufferMeters(lat: number, lon: number, bufferM: number): string {
  const { lat: mPerDegLat, lon: mPerDegLon } = metersPerDegreeAt(lat)
  const padLat = bufferM / mPerDegLat
  const padLon = bufferM / mPerDegLon
  return [
    (lat - padLat).toFixed(5),
    (lon - padLon).toFixed(5),
    (lat + padLat).toFixed(5),
    (lon + padLon).toFixed(5),
  ].join(',')
}
