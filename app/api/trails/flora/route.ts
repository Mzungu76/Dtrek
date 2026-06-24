// GET ?bbox=<minLat>,<minLon>,<maxLat>,<maxLon> — best-effort tree species /
// forest type lookup along a route via Overpass. No DB persistence: cheap
// enough to recompute on every request, like the other Overpass-backed routes.
import { NextRequest, NextResponse } from 'next/server'
import { fetchFloraAlongRoute } from '@/lib/overpassFlora'
import type { FloraResult } from '@/lib/floraTypes'

export const maxDuration = 30

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox || bbox.split(',').length !== 4) {
    return NextResponse.json({ error: 'bbox richiesto' }, { status: 400 })
  }

  try {
    const result = await withTimeout(fetchFloraAlongRoute(bbox), 20_000)
    return NextResponse.json(result satisfies FloraResult)
  } catch (err) {
    console.error('[trails/flora] fetchFloraAlongRoute failed or timed out', err)
    return NextResponse.json({ available: false, leafTypeDominant: null, speciesFound: [], forestCoveragePct: null } satisfies FloraResult)
  }
}
