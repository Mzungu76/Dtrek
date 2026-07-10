// Mirrors app/api/tei-overpass/route.ts's contract shape (force-dynamic, never throws to the
// client, neutral fallback on any failure) but a deliberately different query shape: ?track=
// (JSON [lat,lon][]), not ?bbox= — computeTrailDtmProfile needs the dense original track to
// sample every 15m, a bbox alone isn't enough. DtmUnavailableError (dataset not configured)
// propagates out of computeTrailDtmProfile and is folded into the same neutral fallback here,
// same as any other failure — the route boundary doesn't need to distinguish the reason.
import { NextRequest, NextResponse } from 'next/server'
import { computeTrailDtmProfile, type TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { SUCCESS_CACHE_CONTROL } from '@/lib/apiCacheHeaders'

export const dynamic = 'force-dynamic'

// Was previously unset, same issue cf8b28d fixed for /api/tei-terrain: a stalled upstream
// (OpenTopography, Supabase cache lookup) could run this function all the way out to the
// account's max duration (300s) on every bad invocation. Same cap as the other trails routes.
export const maxDuration = 30
const COMPUTE_TIMEOUT_MS = 25000

const UNAVAILABLE: TrailDtmProfile = { source: 'unavailable', points: [], avgSlopeDeg: null, maxSlopeDeg: null }

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

    const profile = await withTimeout(computeTrailDtmProfile(track as [number, number][]), COMPUTE_TIMEOUT_MS)
    // Only a genuine 'dtm' result is stable for this exact track — 'unavailable' (no coverage,
    // dataset not configured) can change once the underlying tile/config does, so it isn't cached.
    const headers = profile.source === 'dtm' ? { 'Cache-Control': SUCCESS_CACHE_CONTROL } : undefined
    return NextResponse.json(profile, { headers })
  } catch (e) {
    console.error('GET /api/tei-dtm:', e)
    return NextResponse.json(UNAVAILABLE)
  }
}
