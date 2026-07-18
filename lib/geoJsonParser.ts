// Parsing GeoJSON — a differenza di GPX/KML (XML, serve regex o DOMParser) qui basta JSON.parse:
// stesso principio isomorfo di lib/kmlParser.ts (un'unica implementazione, usata sia client-side
// da GpxUploader.tsx sia lato server da lib/geoJsonSourceFetch.ts).
//
// Copre Feature/FeatureCollection con geometria LineString o MultiLineString (la stragrande
// maggioranza dei GeoJSON che rappresentano un percorso), oltre a una geometria "nuda" senza
// wrapper Feature — e GeometryCollection, ricorsivamente. Punti/poligoni vengono ignorati (non
// rappresentano una traccia).
import type { TrackPoint } from './tcxParser'
import type { ServerParsedGpx } from './serverGpxParser'
import { haversineM } from './geoUtils'

type Coord = number[]

interface GeoJsonGeometry {
  type?: string
  coordinates?: unknown
  geometries?: GeoJsonGeometry[]
}

function isCoord(c: unknown): c is Coord {
  return Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number'
}

// Raccoglie ricorsivamente tutte le linee (array di coordinate) trovate in una geometria, e il
// primo nome utile incontrato lungo il percorso (properties.name/title della Feature che la
// contiene, o properties dell'oggetto stesso se non è una Feature).
function collectLines(geom: GeoJsonGeometry | null | undefined, props: Record<string, unknown> | undefined, lines: Coord[][], nameHolder: { name: string }) {
  if (!geom || typeof geom !== 'object') return
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.every(isCoord)) {
    lines.push(geom.coordinates as Coord[])
    if (!nameHolder.name && props && typeof (props.name ?? props.title) === 'string') {
      nameHolder.name = String(props.name ?? props.title)
    }
  } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    for (const line of geom.coordinates as unknown[]) {
      if (Array.isArray(line) && line.every(isCoord)) lines.push(line as Coord[])
    }
    if (!nameHolder.name && props && typeof (props.name ?? props.title) === 'string') {
      nameHolder.name = String(props.name ?? props.title)
    }
  } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries) collectLines(g, props, lines, nameHolder)
  }
}

function downsample(pts: TrackPoint[], max = 400): TrackPoint[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)])
}

/** Ritorna null se il testo non è JSON valido, o non contiene nessuna geometria LineString/
 *  MultiLineString riconoscibile (es. solo Point/Polygon, o vuoto). */
export function parseGeoJson(jsonText: string): ServerParsedGpx | null {
  let data: unknown
  try { data = JSON.parse(jsonText) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const root = data as { type?: string; features?: unknown[]; geometry?: GeoJsonGeometry; properties?: Record<string, unknown>; name?: string } & GeoJsonGeometry

  const lines: Coord[][] = []
  const nameHolder = { name: '' }

  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const f of root.features) {
      if (!f || typeof f !== 'object') continue
      const feature = f as { geometry?: GeoJsonGeometry; properties?: Record<string, unknown> }
      collectLines(feature.geometry, feature.properties, lines, nameHolder)
    }
  } else if (root.type === 'Feature') {
    collectLines(root.geometry, root.properties, lines, nameHolder)
  } else if (root.type === 'LineString' || root.type === 'MultiLineString' || root.type === 'GeometryCollection') {
    collectLines(root, root.properties, lines, nameHolder)
  }
  if (!nameHolder.name && typeof root.name === 'string') nameHolder.name = root.name

  if (lines.length === 0) return null

  const now = new Date().toISOString()
  const rawPoints: TrackPoint[] = []
  for (const line of lines) {
    for (const coord of line) {
      const lon = coord[0], lat = coord[1]
      const pt: TrackPoint = { time: now, lat, lon }
      if (coord.length >= 3 && !isNaN(coord[2])) pt.altitudeMeters = coord[2]
      rawPoints.push(pt)
    }
  }
  if (rawPoints.length === 0) return null

  let distanceMeters = 0, elevationGain = 0, elevationLoss = 0
  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat && p.lon && q.lat && q.lon) distanceMeters += haversineM(q.lat, q.lon, p.lat, p.lon)
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0) elevationGain += d; else elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const altitudeMax = alts.length ? alts.reduce((a, b) => Math.max(a, b)) : 0
  const altitudeMin = alts.length ? alts.reduce((a, b) => Math.min(a, b)) : 0

  // Naismith's rule: 1h per 4 km + 1h per 300 m D+ — stessa formula di kmlParser.ts/serverGpxParser.ts.
  const distKm = distanceMeters / 1000
  const estimatedTimeSeconds = Math.round((distKm / 4 + elevationGain / 300) * 3600)

  return {
    title: nameHolder.name.trim(),
    distanceMeters: Math.round(distanceMeters),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    altitudeMax: Math.round(altitudeMax),
    altitudeMin: Math.round(altitudeMin),
    estimatedTimeSeconds,
    trackPoints: downsample(rawPoints),
  }
}
