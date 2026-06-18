// Thin client for the Overpass API, used by the Esplora map's data routes
// (app/api/waymarked-trails/{list,details,geometry}). The Waymarked Trails
// REST API (hiking.waymarkedtrails.org/api/v1) blocks datacenter-origin
// requests with 403, so only its tile overlay is used directly client-side —
// these routes fetch the underlying OSM hiking-route data from Overpass instead.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export async function fetchOverpass<T = unknown>(query: string, timeoutMs = 20_000): Promise<T> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      return await res.json() as T
    } catch {
      continue
    }
  }
  throw new Error('Overpass non disponibile')
}

export function parseOsmDistance(s?: string): number | null {
  if (!s) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (s.match(/\d\s*m$/) && !s.includes('km')) return n / 1000
  return n > 500 ? n / 1000 : n
}

export interface OsmRelation {
  type: 'relation'
  id: number
  members?: Array<{ type: string; ref: number; role: string }>
  tags?: Record<string, string>
}

export interface OsmWay {
  type: 'way'
  id: number
  geometry?: Array<{ lat: number; lon: number }>
}

// Stitch ways in relation-member order, reversing each way if needed
// so consecutive ways connect end-to-end.
export function stitchWays(
  members: Array<{ type: string; ref: number }>,
  wayMap: Map<number, OsmWay>,
): [number, number][] {
  const ordered = members
    .filter(m => m.type === 'way')
    .map(m => wayMap.get(m.ref))
    .filter((w): w is OsmWay => !!(w?.geometry?.length))

  if (ordered.length === 0) return []

  const result: [number, number][] = []
  let lastPt: { lat: number; lon: number } | null = null

  for (const way of ordered) {
    const geom = way.geometry!
    let pts = geom
    if (lastPt !== null) {
      const dFirst = (geom[0].lat - lastPt.lat) ** 2 + (geom[0].lon - lastPt.lon) ** 2
      const dLast  = (geom[geom.length - 1].lat - lastPt.lat) ** 2 + (geom[geom.length - 1].lon - lastPt.lon) ** 2
      if (dLast < dFirst) pts = [...geom].reverse()
    }
    for (const pt of pts) result.push([pt.lat, pt.lon])
    lastPt = pts[pts.length - 1]
  }

  return result
}
