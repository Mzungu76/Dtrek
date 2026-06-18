export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOverpass, parseOsmDistance, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'

// GET ?id= — metadata (parsed from OSM tags) + stitched geometry for a single trail relation,
// in one Overpass query (relation body already includes tags, so this also avoids a second
// round trip that a separate geometry endpoint would need).
// Backed by Overpass, not the Waymarked Trails REST API (which 403s server-side requests).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }

  const query = `[out:json][timeout:20];
relation(${id})->.rel;
.rel out body;
way(r.rel);
out geom;`

  try {
    const json = await fetchOverpass<{ elements: (OsmRelation | OsmWay)[] }>(query)
    const elements = json.elements ?? []

    const relation = elements.find((e): e is OsmRelation => e.type === 'relation')
    if (!relation) {
      return NextResponse.json({ error: 'Sentiero non trovato' }, { status: 404 })
    }
    const wayMap = new Map(
      elements
        .filter((e): e is OsmWay => e.type === 'way')
        .map(w => [w.id, w]),
    )

    const t = relation.tags ?? {}
    const polyline = relation.members ? stitchWays(relation.members, wayMap) : []

    return NextResponse.json({
      name: t.name || `Percorso ${id}`,
      ref: t.ref,
      network: t.network,
      distanceKm: parseOsmDistance(t.distance ?? t.length),
      elevationGain: parseInt(t.ascent  ?? t['ele:gain'] ?? '') || null,
      elevationLoss: parseInt(t.descent ?? t['ele:loss'] ?? '') || null,
      altitudeMax:   parseInt(t['ele:max'] ?? t.highest_point ?? '') || null,
      altitudeMin:   parseInt(t['ele:min'] ?? t.lowest_point  ?? '') || null,
      sacScale: t.sac_scale,
      caiScale: t.cai_scale,
      description: t.description,
      from: t.from,
      to: t.to,
      polyline,
    })
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile' }, { status: 502 })
  }
}
