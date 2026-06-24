// Dedicated bbox-based endpoint for Natura 2000 (SIC/ZSC/ZPS) polygons — deliberately not
// folded into app/api/pois/route.ts (a protected-area boundary isn't a point POI, it would lose
// the polygon geometry needed for any future map overlay). Mirrors app/api/tei-dtm/route.ts's
// failure contract (force-dynamic, never throws to the client, neutral [] fallback on any
// failure including Natura2000UnavailableError) rather than app/api/pois/route.ts's older
// 500-on-error contract — this route's only consumer today (lib/natura2000/checkProtectedArea.ts)
// needs a always-parseable response, same reasoning as tei-dtm/tei-terrain.
import { NextRequest, NextResponse } from 'next/server'
import { fetchNatura2000PolygonsCached } from '@/lib/natura2000/natura2000Cache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ error: 'bbox required (s,w,n,e)' }, { status: 400 })

  try {
    const features = await fetchNatura2000PolygonsCached(bbox)
    return NextResponse.json(features)
  } catch (e) {
    console.error('GET /api/natura2000:', e)
    return NextResponse.json([])
  }
}
