// GET ?osm_relation_id= — fast path used by Esplora, trail already resolved.
// GET ?polyline=<encodeURIComponent(JSON.stringify([[lat,lon],...]))>&planned_id=<id>
// — used by Programma, which may have no OSM linkage. Tries best-effort
// spatial matching to a cached OSM trail first (lib/si/matchTrail.ts); if
// that matches, persists osm_relation_id on the planned hike so future
// requests can skip straight to the fast path. If nothing matches and
// planned_id is given, falls back to a standalone computation cached on the
// planned hike itself (computeSIForPlannedHike) — so every planned hike
// gets a SI score, OSM-backed or not. Without planned_id (legacy callers),
// no match still replies { matched: false } (200, not an error).
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computeSI, computeSIForPlannedHike } from '@/lib/si/computeSI'
import { findTrailForPolyline } from '@/lib/si/matchTrail'
import { computeBbox } from '@/lib/geoUtils'
import type { SIApiResponse } from '@/lib/si/types'

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
  const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
  const polylineParam = req.nextUrl.searchParams.get('polyline')
  const plannedId = req.nextUrl.searchParams.get('planned_id')

  if (!osmIdParam && !polylineParam) {
    return NextResponse.json({ error: 'osm_relation_id o polyline richiesto' }, { status: 400 })
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
        supabase.from('planned_hikes').update({ osm_relation_id: matchedId }).eq('id', plannedId)
          .then(({ error }) => { if (error) console.error('[trails/si] failed to persist osm_relation_id', error) })
      }
    }
  }

  try {
    if (osmRelationId != null) {
      const result = await withTimeout(computeSI(osmRelationId), COMPUTE_TIMEOUT_MS)
      return NextResponse.json(result satisfies SIApiResponse)
    }

    if (plannedId && polyline) {
      const [minLat, minLon, maxLat, maxLon] = computeBbox(polyline, 0.005).split(',').map(Number)
      const { data: plannedRow } = await supabase
        .from('planned_hikes')
        .select('distance_meters, elevation_gain, elevation_loss')
        .eq('id', plannedId)
        .maybeSingle()
      const distanceKm = plannedRow?.distance_meters != null ? plannedRow.distance_meters / 1000 : null
      const result = await withTimeout(
        computeSIForPlannedHike(
          plannedId, polyline, { minLat, minLon, maxLat, maxLon },
          distanceKm, plannedRow?.elevation_gain ?? null, plannedRow?.elevation_loss ?? null,
        ),
        COMPUTE_TIMEOUT_MS,
      )
      return NextResponse.json(result satisfies SIApiResponse)
    }

    const body: SIApiResponse = { matched: false }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[trails/si] computeSI failed or timed out', err)
    return NextResponse.json({ error: 'Impossibile calcolare l\'indice di sicurezza' }, { status: 502 })
  }
}
