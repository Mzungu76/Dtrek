export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

interface OsmRelation {
  type: 'relation'
  id: number
  members: Array<{ type: string; ref: number; role: string }>
}

interface OsmWay {
  type: 'way'
  id: number
  geometry?: Array<{ lat: number; lon: number }>
}

// Stitch ways in relation-member order, reversing each way if needed
// so consecutive ways connect end-to-end.
function stitchWays(
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
    // Pick direction: whichever end is closest to where we left off
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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }

  // Fetch relation members (ordered) + way geometries in one query
  const query = `[out:json][timeout:15];
relation(${id})->.rel;
.rel out body;
way(r.rel);
out geom;`

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(16_000),
      })
      if (!res.ok) continue

      const json = await res.json() as { elements: (OsmRelation | OsmWay)[] }
      const elements = json.elements ?? []

      const relation = elements.find((e): e is OsmRelation => e.type === 'relation')
      const wayMap   = new Map(
        elements
          .filter((e): e is OsmWay => e.type === 'way')
          .map(w => [w.id, w]),
      )

      if (!relation?.members) return NextResponse.json({ polyline: [] })

      const polyline = stitchWays(relation.members, wayMap)
      return NextResponse.json({ polyline })
    } catch {
      continue
    }
  }

  return NextResponse.json({ error: 'Overpass non disponibile', polyline: [] }, { status: 502 })
}
