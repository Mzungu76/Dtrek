// GET ?osm_relation_id= — fast path used by Esplora, trail already resolved.
// GET ?polyline=<encodeURIComponent(JSON.stringify([[lat,lon],...]))>&planned_id=<id>
// — used by Programma, which may have no OSM linkage. Tries best-effort
// spatial matching to a cached OSM trail first (lib/cl/matchTrail.ts); if
// that matches, persists osm_relation_id on the planned hike so future
// requests can skip straight to the fast path. If nothing matches and
// planned_id is given, falls back to a standalone computation cached on the
// planned hike itself (computeCLForPlannedHike) — so every planned hike
// gets a SI score, OSM-backed or not. Without planned_id (legacy callers),
// no match still replies { matched: false } (200, not an error).
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { computeCL, computeCLForPlannedHike, CLRateLimitError } from '@/lib/cl/computeCL'
import { findTrailForPolyline } from '@/lib/cl/matchTrail'
import { computeBbox } from '@/lib/geoUtils'
import type { CLApiResponse } from '@/lib/cl/types'

export const maxDuration = 30

const COMPUTE_TIMEOUT_MS = 15000
const MATCH_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')
  const plannedId = req.nextUrl.searchParams.get('planned_id')
  const force = req.nextUrl.searchParams.get('force') === '1'

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
  }

  if (plannedId) {
    const { data: owned } = await supabase
      .from('planned_hikes')
      .select('id')
      .eq('id', plannedId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let osmRelationId: number | null = null
  let polyline: [number, number][] | null = null

  if (osmIdParam) {
    if (!/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id non valido' }, { status: 400 })
    }
    osmRelationId = Number(osmIdParam)
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(polylineParam as string)
    } catch {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    if (!Array.isArray(parsed) || parsed.length < 2) {
      return NextResponse.json({ error: 'polyline non valido' }, { status: 400 })
    }
    polyline = parsed as [number, number][]

    const matchedId = await withTimeout(
      findTrailForPolyline(polyline),
      MATCH_TIMEOUT_MS,
    ).catch((err) => {
      console.error('[trails/si] findTrailForPolyline failed or timed out', err)
      return null
    })

    if (matchedId) {
      osmRelationId = matchedId
      if (plannedId) {
        supabase.from('planned_hikes').update({ osm_relation_id: matchedId })
          .eq('id', plannedId).eq('user_id', user.id)
          .then(({ error }) => { if (error) console.error('[trails/si] failed to persist osm_relation_id', error) })
      }
    }
  }

  try {
    if (osmRelationId != null) {
      const result = await withTimeout(computeCL(osmRelationId, undefined, { force }), COMPUTE_TIMEOUT_MS)
      return NextResponse.json(result satisfies CLApiResponse)
    }

    if (plannedId && polyline) {
      const [minLat, minLon, maxLat, maxLon] = computeBbox(polyline, 0.005).split(',').map(Number)
      const { data: plannedRow } = await supabase
        .from('planned_hikes')
        .select('distance_meters, elevation_gain, elevation_loss')
        .eq('id', plannedId)
        .eq('user_id', user.id)
        .maybeSingle()
      const distanceKm = plannedRow?.distance_meters != null ? plannedRow.distance_meters / 1000 : null
      const result = await withTimeout(
        computeCLForPlannedHike(
          plannedId, polyline, { minLat, minLon, maxLat, maxLon },
          distanceKm, plannedRow?.elevation_gain ?? null, plannedRow?.elevation_loss ?? null,
          { force },
        ),
        COMPUTE_TIMEOUT_MS,
      )
      return NextResponse.json(result satisfies CLApiResponse)
    }

    const body: CLApiResponse = { matched: false }
    return NextResponse.json(body)
  } catch (err) {
    if (err instanceof CLRateLimitError) {
      return NextResponse.json({ error: `Aggiornamento disponibile da: ${err.availableAt}` }, { status: 429 })
    }
    console.error('[trails/si] computeCL failed or timed out', err)
    return NextResponse.json({ error: 'Impossibile calcolare il livello di affidabilità' }, { status: 502 })
  }
}
