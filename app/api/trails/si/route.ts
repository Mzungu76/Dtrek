// GET ?osm_relation_id= — fast path used by Esplora, trail already resolved.
// GET ?polyline=<encodeURIComponent(JSON.stringify([[lat,lon],...]))> — slow
// path used by Programma, which has no OSM linkage at all; resolves the trail
// via best-effort spatial matching (lib/si/matchTrail.ts) and replies
// { matched: false } (200, not an error) if nothing is found within the
// matching threshold.
import { NextRequest, NextResponse } from 'next/server'
import { computeSI } from '@/lib/si/computeSI'
import { findTrailForPolyline } from '@/lib/si/matchTrail'
import type { SIApiResponse } from '@/lib/si/types'

const COMPUTE_TIMEOUT_MS = 8000
const MATCH_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
  }

  let osmRelationId: number

  if (osmIdParam) {
    if (!/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id non valido' }, { status: 400 })
    }
    osmRelationId = Number(osmIdParam)
  } else {
    let polyline: unknown
    try {
      polyline = JSON.parse(polylineParam as string)
    } catch {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    if (!Array.isArray(polyline) || polyline.length < 2) {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }

    const matchedId = await withTimeout(
      findTrailForPolyline(polyline as [number, number][]),
      MATCH_TIMEOUT_MS,
    ).catch(() => null)

    if (!matchedId) {
      const body: SIApiResponse = { matched: false }
      return NextResponse.json(body)
    }
    osmRelationId = matchedId
  }

  try {
    const result = await withTimeout(computeSI(osmRelationId), COMPUTE_TIMEOUT_MS)
    return NextResponse.json(result satisfies SIApiResponse)
  } catch {
    return NextResponse.json({ error: 'Impossibile calcolare l\'indice di sicurezza' }, { status: 502 })
  }
}
