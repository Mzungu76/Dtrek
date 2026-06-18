export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOverpass, type OsmRelation } from '@/lib/overpassTrails'

// GET ?bbox=minlon,minlat,maxlon,maxlat&limit= — trails within a bbox (click-to-query on the map).
// Backed by Overpass, not the Waymarked Trails REST API (which 403s server-side requests).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const bbox  = searchParams.get('bbox')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20') || 20, 50)

  if (!bbox) return NextResponse.json({ error: 'bbox required' }, { status: 400 })

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    return NextResponse.json({ error: 'bbox invalido' }, { status: 400 })
  }
  const [minLon, minLat, maxLon, maxLat] = parts
  // Cap query area to avoid abusive/huge requests (~2.5° on a side ≈ regional scale)
  if (Math.abs(maxLon - minLon) > 2.5 || Math.abs(maxLat - minLat) > 2.5) {
    return NextResponse.json({ error: 'area troppo ampia' }, { status: 400 })
  }

  const query = `[out:json][timeout:20][maxsize:5242880];
relation["type"="route"]["route"="hiking"]["name"](${minLat},${minLon},${maxLat},${maxLon});
out tags ${limit};`

  try {
    const json = await fetchOverpass<{ elements: OsmRelation[] }>(query)
    const results = (json.elements ?? [])
      .filter(e => e.type === 'relation' && e.tags?.name)
      .map(e => ({
        id: e.id,
        name: e.tags!.name,
        ref: e.tags!.ref,
        network: e.tags!.network,
      }))
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile', results: [] }, { status: 502 })
  }
}
