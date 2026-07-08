// Mirrors app/api/tei-dtm/route.ts's contract shape (force-dynamic, never throws to the
// client, neutral fallback on any failure) and the same ?track= (JSON [lat,lon][]) query
// shape — computeTrailTerrainProfile needs the real segmentation (segmentGpx), a bbox alone
// isn't enough. GeologiaUnavailableError/UsoSuoloUnavailableError (datasets not configured)
// propagate out of computeTrailTerrainProfile and are folded into the same neutral fallback
// here, same as any other failure — the route boundary doesn't need to distinguish the reason.
import { NextRequest, NextResponse } from 'next/server'
import { computeTrailTerrainProfile, type TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'

export const dynamic = 'force-dynamic'

// Was previously unset, which let a stalled upstream (WMS ISPRA geologia, Supabase cache
// lookups) run this function all the way out to the account's max duration (300s) on every
// bad invocation — the single biggest driver of the account's Active CPU usage. Same cap as
// the other trails routes (cl, sentinel2, conditions, guardian-dogs, flora).
export const maxDuration = 30
const COMPUTE_TIMEOUT_MS = 25000

const UNAVAILABLE: TrailTerrainProfile = { source: 'unavailable', segments: [] }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  try {
    const trackParam = req.nextUrl.searchParams.get('track')
    if (!trackParam) {
      return NextResponse.json({ error: 'track required (JSON [lat,lon][])' }, { status: 400 })
    }

    let track: unknown
    try {
      track = JSON.parse(trackParam)
    } catch {
      return NextResponse.json({ error: 'track must be valid JSON' }, { status: 400 })
    }
    if (!Array.isArray(track)) {
      return NextResponse.json({ error: 'track must be an array of [lat,lon] pairs' }, { status: 400 })
    }

    const profile = await withTimeout(computeTrailTerrainProfile(track as [number, number][]), COMPUTE_TIMEOUT_MS)
    return NextResponse.json(profile)
  } catch (e) {
    console.error('GET /api/tei-terrain:', e)
    return NextResponse.json(UNAVAILABLE)
  }
}
