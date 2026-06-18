export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { WMT_BASE, USER_AGENT, extractResults, normalizeListItem } from '@/lib/waymarkedTrails'

// GET ?bbox=minlon,minlat,maxlon,maxlat&limit= — trails within a bbox (click-to-query on the map).
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

  try {
    const res = await fetch(`${WMT_BASE}/list?bbox=${bbox}&limit=${limit}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = await res.json()
    const results = extractResults(json)
      .map(normalizeListItem)
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Waymarked Trails non disponibile', results: [] }, { status: 502 })
  }
}
