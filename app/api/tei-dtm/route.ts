// Mirrors app/api/tei-overpass/route.ts's contract shape (force-dynamic, never throws to the
// client, neutral fallback on any failure) but a deliberately different query shape: ?track=
// (JSON [lat,lon][]), not ?bbox= — computeTrailDtmProfile needs the dense original track to
// sample every 15m, a bbox alone isn't enough. DtmUnavailableError (dataset not configured)
// propagates out of computeTrailDtmProfile and is folded into the same neutral fallback here,
// same as any other failure — the route boundary doesn't need to distinguish the reason.
import { NextRequest, NextResponse } from 'next/server'
import { computeTrailDtmProfile, type TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

export const dynamic = 'force-dynamic'

const UNAVAILABLE: TrailDtmProfile = { source: 'unavailable', points: [], avgSlopeDeg: null, maxSlopeDeg: null }

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

    const profile = await computeTrailDtmProfile(track as [number, number][])
    return NextResponse.json(profile)
  } catch (e) {
    console.error('GET /api/tei-dtm:', e)
    return NextResponse.json(UNAVAILABLE)
  }
}
