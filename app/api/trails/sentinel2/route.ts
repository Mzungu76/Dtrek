// Same dual-mode contract as /api/trails/cl (?osm_relation_id= fast path,
// ?polyline=&planned_id= slow path). Used to run a full Sentinel-2 recompute here (Sentinel-2
// snapshot + 12 MODIS monthly reads from Microsoft Planetary Computer) — replaced with a single
// Overpass query (OSM forest/water tags, see lib/shadeWater/computeShadeWater.ts) after that
// pipeline turned out to be the single largest source of "Task timed out after 30 seconds"
// errors on this route, worst on a planned hike's very first computation (every signal has to
// run at once, nothing cached yet to fall back on). The stale-while-revalidate branch below
// (recompute in background, answer immediately with { stale: true }) predates that change and
// is no longer load-bearing for latency, but is harmless to keep — OSM forest/water tags barely
// change, so a 30-day-stale cached value is still accurate.
// When polyline matching finds no OSM trail and planned_id is given, falls back to a standalone
// computation cached on the planned hike itself (computeShadeWaterForPlannedHike) — so every
// planned hike gets Ombra e Acqua data, OSM-backed or not. Without planned_id (legacy callers),
// no match still replies { matched: false } (200, not an error).
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { computeShadeWater, computeShadeWaterForPlannedHike, fetchShadeWaterCache, toShadeWaterData, SERIES_TTL_MS } from '@/lib/shadeWater/computeShadeWater'
import { resolveTrailGeometry } from '@/lib/cl/computeCL'
import { findTrailForPolyline } from '@/lib/cl/matchTrail'
import type { Sentinel2ApiResponse } from '@/lib/cl/types'

export const maxDuration = 30

// Era 15000 — identico a OVERPASS_TIMEOUT_MS in lib/shadeWater/computeShadeWater.ts, che questo
// wrapper avvolge da fuori. Con due timer della STESSA durata ma un avvio sfalsato (questo parte
// prima: il DB read della cache + l'overhead di chiamata a computeShadeWater* precedono l'avvio
// del timer interno su fetchOverpass), il timeout esterno scade quasi sempre PRIMA che Overpass
// abbia una vera possibilità di rispondere — bastava che il mirror più veloce impiegasse più di
// ~14s (comune, non un caso limite) perché questa route restituisse 502 invece del risultato.
// Per un percorso appena importato (nessuna cache da cui ripiegare) questo significava che
// Ombra&Acqua non veniva mai calcolato alla prima richiesta. Ora lascia margine reale sopra i
// 15s interni, restando comunque sotto maxDuration=30 anche sommando i 4s di MATCH_TIMEOUT_MS
// prima del blocco try.
const COMPUTE_TIMEOUT_MS = 22000
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

  let plannedOsmRelationId: number | null = null
  if (plannedId) {
    const { data: owned } = await supabase
      .from('planned_hikes')
      .select('id, osm_relation_id')
      .eq('id', plannedId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    plannedOsmRelationId = owned.osm_relation_id
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

    // Il sibling /api/trails/cl fa esattamente la stessa risoluzione polyline→trail per lo
    // stesso percorso, nella stessa finestra temporale (i due hook lato client partono insieme) —
    // se il match è già stato trovato e persistito (da quella gemella già completata), riusalo
    // invece di rifare da capo la scansione paginata dell'intera tabella trails.
    if (plannedOsmRelationId != null) {
      osmRelationId = plannedOsmRelationId
    } else {
      const matchedId = await withTimeout(
        findTrailForPolyline(polyline),
        MATCH_TIMEOUT_MS,
      ).catch((err) => {
        console.error('[trails/sentinel2] findTrailForPolyline failed or timed out', err)
        return null
      })

      if (matchedId) {
        osmRelationId = matchedId
        if (plannedId) {
          supabase.from('planned_hikes').update({ osm_relation_id: matchedId })
            .eq('id', plannedId).eq('user_id', user.id)
            .then(({ error }) => { if (error) console.error('[trails/sentinel2] failed to persist osm_relation_id', error) })
        }
      }
    }
  }

  try {
    if (osmRelationId != null) {
      const cache = await fetchShadeWaterCache(osmRelationId)
      const seriesExpired = !cache?.computedAt || Date.now() - new Date(cache.computedAt).getTime() > SERIES_TTL_MS

      if (!force && cache?.available && seriesExpired) {
        resolveTrailGeometry(osmRelationId)
          .then(geometry => {
            const trailPoints = polyline ?? geometry
            if (trailPoints) return computeShadeWater(osmRelationId as number, trailPoints)
          })
          .catch(() => {})
        return NextResponse.json({ ...toShadeWaterData(cache, { osmRelationId }), stale: true } satisfies Sentinel2ApiResponse)
      }

      const trailPoints = polyline ?? await resolveTrailGeometry(osmRelationId)
      if (!trailPoints) {
        return NextResponse.json({
          osmRelationId, available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null,
          nbrCurrent: null, eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false,
          landslideRisk: false, shadeScore: null, landscapeVariety: null, waterSources: [],
          phenologyPeakMonth: null, computedAt: null, reason: 'no_geometry',
        } satisfies Sentinel2ApiResponse)
      }

      const result = await withTimeout(computeShadeWater(osmRelationId, trailPoints, { force }), COMPUTE_TIMEOUT_MS)
      return NextResponse.json(result satisfies Sentinel2ApiResponse)
    }

    if (plannedId && polyline) {
      const { data: plannedRow } = await supabase
        .from('planned_hikes')
        .select('distance_meters, elevation_gain, elevation_loss')
        .eq('id', plannedId)
        .eq('user_id', user.id)
        .maybeSingle()
      const distanceKm = plannedRow?.distance_meters != null ? plannedRow.distance_meters / 1000 : null
      const result = await withTimeout(
        computeShadeWaterForPlannedHike(plannedId, polyline, distanceKm, plannedRow?.elevation_gain ?? null, plannedRow?.elevation_loss ?? null, { force }),
        COMPUTE_TIMEOUT_MS,
      )
      return NextResponse.json(result satisfies Sentinel2ApiResponse)
    }

    const body: Sentinel2ApiResponse = { matched: false }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[trails/sentinel2] computeShadeWater failed or timed out', err)
    return NextResponse.json({ error: 'Impossibile calcolare i dati Ombra e Acqua' }, { status: 502 })
  }
}
