export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { queryHikingRelationsInBbox } from '@/lib/overpassTrails'

// GET ?bbox=minlon,minlat,maxlon,maxlat&limit= — trails within a bbox. Used both
// by the click-to-query shortcut (small radius, limit ~10) and by the "Cerca in
// quest'area" area search (full viewport, limit ~60-100). Backed by Overpass,
// not the Waymarked Trails REST API (which 403s server-side requests).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const bbox  = searchParams.get('bbox')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20') || 20, 150)

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

  try {
    const candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, limit)
    const results = candidates.map(({ id, name, ref, network }) => ({ id, name, ref, network }))
    // `truncated` is honest about Overpass's `out tags N` cap: it means "there may
    // be more trails here than shown", not a true total count (Overpass doesn't
    // report one).
    return NextResponse.json({ results, total: results.length, truncated: results.length >= limit })
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile', results: [] }, { status: 502 })
  }
}
