export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOverpass, parseOsmDistance, type OsmRelation } from '@/lib/overpassTrails'

// GET ?id= — metadata for a single trail relation, parsed from its OSM tags.
// Backed by Overpass, not the Waymarked Trails REST API (which 403s server-side requests).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }

  const query = `[out:json][timeout:15];
relation(${id});
out tags;`

  try {
    const json = await fetchOverpass<{ elements: OsmRelation[] }>(query)
    const relation = json.elements?.find(e => e.type === 'relation')
    if (!relation) {
      return NextResponse.json({ error: 'Sentiero non trovato' }, { status: 404 })
    }

    const t = relation.tags ?? {}

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
    })
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile' }, { status: 502 })
  }
}
