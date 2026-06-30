// GET ?bbox=<minLat>,<minLon>,<maxLat>,<maxLon> — best-effort guardian-dog
// (cani da pastore a guardia di greggi) risk lookup along a route via
// Overpass pasture/sheepfold tags. No DB persistence: cheap enough to
// recompute on every request, like the other Overpass-backed routes.
import { NextRequest, NextResponse } from 'next/server'
import { fetchGuardianDogRiskAlongRoute, type GuardianDogRisk } from '@/lib/overpassGuardianDogs'

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
    const result = await withTimeout(fetchGuardianDogRiskAlongRoute(bbox), 20_000)
    return NextResponse.json(result satisfies GuardianDogRisk)
  } catch (err) {
    console.error('[trails/guardian-dogs] fetchGuardianDogRiskAlongRoute failed or timed out', err)
    return NextResponse.json({ available: false, present: false, coveragePct: null } satisfies GuardianDogRisk)
  }
}
