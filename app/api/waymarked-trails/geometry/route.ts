export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOverpass, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'

// GET ?id= — stitched relation geometry as WGS84 [lat, lon] pairs.
// Backed by Overpass, not the Waymarked Trails REST API (which 403s server-side requests).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto', polyline: [] }, { status: 400 })
  }

  // Fetch relation members (ordered) + way geometries in one query
  const query = `[out:json][timeout:15];
relation(${id})->.rel;
.rel out body;
way(r.rel);
out geom;`

  try {
    const json = await fetchOverpass<{ elements: (OsmRelation | OsmWay)[] }>(query)
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
    return NextResponse.json({ error: 'Overpass non disponibile', polyline: [] }, { status: 502 })
  }
}
