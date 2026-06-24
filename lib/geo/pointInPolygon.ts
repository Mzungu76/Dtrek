// Ray-casting point-in-polygon and segment-polygon intersection, for risk overlays
// (PAI, Natura2000) whose geometries arrive as GeoJSON. Coordinates follow the
// GeoJSON convention [lon, lat] internally (matching geoUtils.ts's gnaGeomToCentroid),
// while this module's own function signatures take (lat, lon) to match the rest
// of the repo's call sites.

type LonLat = [number, number]

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: LonLat[][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: LonLat[][][]
}

export type AnyPolygonGeometry = PolygonGeometry | MultiPolygonGeometry

function pointInRing(lat: number, lon: number, ring: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = (yi > lat) !== (yj > lat) &&
      lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

// First ring is the exterior boundary, any further rings are holes (standard GeoJSON Polygon).
function pointInRings(lat: number, lon: number, rings: LonLat[][]): boolean {
  if (rings.length === 0 || !pointInRing(lat, lon, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false
  }
  return true
}

export function pointInPolygon(lat: number, lon: number, geometry: AnyPolygonGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInRings(lat, lon, geometry.coordinates)
  return geometry.coordinates.some(rings => pointInRings(lat, lon, rings))
}

// Cross-product orientation test (>0 / <0 distinguishes which side of p->q the point r is on).
function orientation(p: LonLat, q: LonLat, r: LonLat): number {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
}

// Proper-crossing test only (collinear/touching edge cases are not special-cased — acceptable
// for risk-overlay purposes where an exact boundary touch can go either way).
function segmentsCross(a1: LonLat, a2: LonLat, b1: LonLat, b2: LonLat): boolean {
  const d1 = orientation(b1, b2, a1)
  const d2 = orientation(b1, b2, a2)
  const d3 = orientation(a1, a2, b1)
  const d4 = orientation(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function segmentCrossesRing(a: LonLat, b: LonLat, ring: LonLat[]): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (segmentsCross(a, b, ring[j], ring[i])) return true
  }
  return false
}

/**
 * True if the segment (aLat,aLon)->(bLat,bLon) is at all inside the polygon: either
 * endpoint is inside, or the segment crosses a ring edge. Needed because a ~100m trail
 * segment can clip through a risk polygon without either endpoint landing inside it.
 */
export function segmentIntersectsPolygon(
  aLat: number, aLon: number, bLat: number, bLon: number,
  geometry: AnyPolygonGeometry,
): boolean {
  if (pointInPolygon(aLat, aLon, geometry) || pointInPolygon(bLat, bLon, geometry)) return true
  const a: LonLat = [aLon, aLat]
  const b: LonLat = [bLon, bLat]
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(rings => rings.some(ring => segmentCrossesRing(a, b, ring)))
}
