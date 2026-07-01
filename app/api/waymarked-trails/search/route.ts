export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { queryHikingRelationsInBbox } from '@/lib/overpassTrails'
import { getCachedTrailsInBbox } from '@/lib/trailsCache'
import { matchesFilters } from '@/lib/trailFilters'
import type { SearchRequestBody, SearchResponseBody, TrailSearchResult, TrailSearchCandidate } from '@/lib/trailSearch'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 150

// POST { bbox, limit?, filters? } — backend for "Cerca in quest'area": unlike
// GET /list (bare id/name/ref/network), this orchestrates list → cache
// read-through → filtering, so the client gets a rich, mostly-ready-to-render
// result set for the whole current viewport instead of fanning out N `details`
// calls itself. Never calls OpenTopoData here (that stays a per-trail,
// client-triggered enrichment) — this endpoint must stay fast even for 100+
// candidates.
export async function POST(req: NextRequest) {
  let body: SearchRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 })
  }

  const { bbox, filters } = body
  const coords = bbox ? [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat] : []
  if (coords.length !== 4 || coords.some(v => typeof v !== 'number' || isNaN(v))) {
    return NextResponse.json({ error: 'bbox non valido' }, { status: 400 })
  }
  if (Math.abs(bbox.maxLon - bbox.minLon) > 2.5 || Math.abs(bbox.maxLat - bbox.minLat) > 2.5) {
    return NextResponse.json({ error: 'area troppo ampia' }, { status: 400 })
  }
  const limit = Math.min(Math.max(Math.round(body.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)

  let candidates
  try {
    candidates = await queryHikingRelationsInBbox(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon, limit)
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile' }, { status: 502 })
  }

  const cached = await getCachedTrailsInBbox(candidates.map(c => c.id))

  const results: TrailSearchResult[] = []
  const pendingCandidates: TrailSearchCandidate[] = []

  for (const c of candidates) {
    const row = cached.get(c.id)
    if (!row) {
      // Cache miss: stats unknown, can't be filter-matched yet — always returned
      // (even with active filters) so the client can enrich+filter it client-side
      // without the initial response blocking on it.
      pendingCandidates.push({ id: c.id, name: c.name, ref: c.ref, network: c.network })
      continue
    }

    const result: TrailSearchResult = {
      id: c.id,
      name: row.name || c.name,
      ref: row.ref ?? c.ref,
      network: row.network ?? c.network,
      distanceKm: row.distanceKm,
      elevationGain: row.elevationGain,
      elevationLoss: row.elevationLoss,
      estimatedTimeMin: row.estimatedTimeMin,
      sacScale: row.difficulty,
      caiScale: row.caiScale,
      routeType: row.routeType,
      dataQuality: row.dataQuality,
      description: row.description,
      from: row.fromLabel,
      to: row.toLabel,
    }
    // A cache hit is fully known, unlike a pending candidate — if it doesn't
    // match active filters there's nothing to progressively enrich, so it's
    // dropped rather than deferred.
    if (!filters || matchesFilters(result, filters)) {
      results.push(result)
    }
  }

  const response: SearchResponseBody = {
    results,
    pendingCandidates,
    totalCandidates: candidates.length,
    truncated: candidates.length >= limit,
  }
  return NextResponse.json(response)
}
