import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { PlannedHike, PlannedHikeMeta } from '@/lib/plannedStore'
import type { TrackPoint } from '@/lib/tcxParser'
import { readIndex } from '@/lib/blobIndex'
import { assessHike } from '@/lib/hikeAssessment'
import type { SafetyScore } from '@/lib/safetyScore'

export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as Record<string, unknown>).message)
  try { return JSON.stringify(e) } catch { return String(e) }
}

function downsamplePolyline(pts: TrackPoint[], maxPts = 60): [number, number][] {
  const valid = pts.filter(p => p.lat !== undefined && p.lon !== undefined)
  if (!valid.length) return []
  const count = Math.min(valid.length, maxPts)
  const step  = (valid.length - 1) / (count - 1 || 1)
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(Math.round(i * step), valid.length - 1)
    return [
      Math.round(valid[idx].lat! * 1e5) / 1e5,
      Math.round(valid[idx].lon! * 1e5) / 1e5,
    ]
  })
}

function rowToHike(row: Record<string, unknown>, includeTracks = true): PlannedHike {
  return {
    id:                    row.id as string,
    title:                 row.title as string,
    plannedDate:           row.planned_date as string | undefined,
    fileName:              row.file_name as string | undefined,
    userNotes:             row.user_notes as string | undefined,
    hikeNotes:             row.hike_notes as PlannedHike['hikeNotes'] | undefined,
    tags:                  row.tags as string[] | undefined,
    createdAt:             row.created_at as string,
    distanceMeters:        row.distance_meters as number,
    elevationGain:         row.elevation_gain as number,
    elevationLoss:         row.elevation_loss as number,
    altitudeMax:           row.altitude_max as number,
    altitudeMin:           row.altitude_min as number,
    estimatedTimeSeconds:  row.estimated_time_seconds as number,
    routePolyline:         row.route_polyline as [number, number][] | undefined,
    osmId:                 row.osm_relation_id as number | undefined,
    trackPoints:           includeTracks ? (row.track_points as TrackPoint[]) ?? [] : undefined,
    assessment:            row.assessment as PlannedHike['assessment'],
    cachedPois:            row.cached_pois as unknown[] | undefined,
    cachedPoiWiki:         row.cached_poi_wiki as unknown[] | undefined,
    cachedGuide:           row.cached_guide as string | undefined,
    cachedBeautyScore:            row.cached_beauty_score            as PlannedHike['cachedBeautyScore'] | undefined,
    cachedTrailScore:             row.cached_trail_score             as number | undefined,
    cachedTrailScoreConfidence:   row.cached_trail_score_confidence  as PlannedHike['cachedTrailScoreConfidence'] | undefined,
    cachedSafetyScore:            row.cached_safety_score            as SafetyScore | undefined,
    cachedRiddles:                row.cached_riddles                 as PlannedHike['cachedRiddles'],
    cachedDrivingDistanceMeters:  row.cached_driving_distance_m      as number | undefined,
    cachedDrivingDurationSeconds: row.cached_driving_duration_s      as number | undefined,
    cachedDrivingOriginLat:       row.cached_driving_origin_lat      as number | undefined,
    cachedDrivingOriginLon:       row.cached_driving_origin_lon      as number | undefined,
  }
}

function hikeToRow(h: PlannedHike) {
  return {
    id:                     h.id,
    title:                  h.title,
    planned_date:           h.plannedDate ?? null,
    file_name:              h.fileName ?? null,
    user_notes:             h.userNotes ?? null,
    hike_notes:             h.hikeNotes ?? [],
    tags:                   h.tags ?? null,
    created_at:             h.createdAt,
    distance_meters:        h.distanceMeters,
    elevation_gain:         h.elevationGain,
    elevation_loss:         h.elevationLoss,
    altitude_max:           h.altitudeMax,
    altitude_min:           h.altitudeMin,
    estimated_time_seconds: h.estimatedTimeSeconds,
    route_polyline:         h.routePolyline ?? downsamplePolyline(h.trackPoints ?? []),
    osm_relation_id:        h.osmId ?? null,
    track_points:           h.trackPoints ?? [],
    assessment:             h.assessment ?? null,
    cached_pois:            h.cachedPois ?? null,
    cached_poi_wiki:        h.cachedPoiWiki ?? null,
    cached_guide:           h.cachedGuide ?? null,
    cached_beauty_score:              h.cachedBeautyScore ?? null,
    cached_trail_score:               h.cachedTrailScore ?? null,
    cached_trail_score_confidence:    h.cachedTrailScoreConfidence ?? null,
    cached_safety_score:              h.cachedSafetyScore ?? null,
    cached_riddles:                   h.cachedRiddles ?? null,
    cached_driving_distance_m:        h.cachedDrivingDistanceMeters ?? null,
    cached_driving_duration_s:        h.cachedDrivingDurationSeconds ?? null,
    cached_driving_origin_lat:        h.cachedDrivingOriginLat ?? null,
    cached_driving_origin_lon:        h.cachedDrivingOriginLon ?? null,
  }
}

// Columns for list view — excludes track_points
const META_COLS = [
  'id', 'title', 'planned_date', 'file_name', 'user_notes', 'hike_notes', 'tags',
  'created_at', 'distance_meters', 'elevation_gain', 'elevation_loss',
  'altitude_max', 'altitude_min', 'estimated_time_seconds',
  'route_polyline', 'assessment', 'cached_guide', 'osm_relation_id',
  'cached_beauty_score', 'cached_trail_score', 'cached_trail_score_confidence',
  'cached_safety_score', 'cached_riddles',
  'cached_driving_distance_m', 'cached_driving_duration_s',
  'cached_driving_origin_lat', 'cached_driving_origin_lon',
].join(', ')

// Guaranteed-to-exist columns (base schema, no ALTER TABLE additions)
const META_COLS_CORE = [
  'id', 'title', 'planned_date', 'file_name', 'user_notes', 'tags',
  'created_at', 'distance_meters', 'elevation_gain', 'elevation_loss',
  'altitude_max', 'altitude_min', 'estimated_time_seconds',
  'route_polyline', 'assessment',
].join(', ')

// ── GET /api/planned          → PlannedHikeMeta[] ────────────────────────────
// ── GET /api/planned?id=X     → PlannedHike (full, with trackPoints) ─────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')

    if (id) {
      const { data, error } = await supabase
        .from('planned_hikes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const { data: markers } = await supabase
        .from('trail_difficulty_markers')
        .select('lat, lon, source, source_text, severity, keywords')
        .eq('planned_hike_id', id)

      return NextResponse.json({
        ...rowToHike(data, true),
        difficultyMarkers: (markers ?? []).map(m => ({
          lat: m.lat, lon: m.lon, source: m.source, text: m.source_text,
          severity: m.severity, keywords: m.keywords ?? [],
        })),
      })
    }

    // Try full columns; fall back to core if newer ALTER TABLE columns don't exist yet
    let listData: Record<string, unknown>[] | null = null
    const { data: d1, error: e1 } = await supabase
      .from('planned_hikes')
      .select(META_COLS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (e1) {
      const { data: d2, error: e2 } = await supabase
        .from('planned_hikes')
        .select(META_COLS_CORE)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (e2) throw e2
      listData = d2 as unknown as Record<string, unknown>[] | null
    } else {
      listData = d1 as unknown as Record<string, unknown>[] | null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json((listData ?? [] as any[]).map((r: any) => rowToHike(r, false) as PlannedHikeMeta))
  } catch (e) {
    console.error('GET /api/planned:', e)
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}

// ── POST /api/planned → upsert ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const hike = (await req.json()) as PlannedHike

    if (!hike.routePolyline && hike.trackPoints) {
      hike.routePolyline = downsamplePolyline(hike.trackPoints)
    }

    // Personalised assessment using completed activities as context
    // Falls back to Supabase if blob is gone
    let activities: Parameters<typeof assessHike>[3] = []
    try { activities = await readIndex() } catch {}
    if (!activities.length) {
      const { data } = await supabase
        .from('activities')
        .select('distance_meters, elevation_gain, altitude_max')
        .eq('user_id', user.id)
      if (data) {
        activities = data.map((r: Record<string, unknown>) => ({
          id: '',
          title: '',
          startTime: '',
          distanceMeters: r.distance_meters as number,
          totalTimeSeconds: 0,
          calories: 0,
          avgHeartRate: 0,
          maxHeartRate: 0,
          elevationGain: r.elevation_gain as number,
          elevationLoss: 0,
          altitudeMax: r.altitude_max as number,
          avgSpeedMs: 0,
          maxSpeedMs: 0,
        }))
      }
    }

    hike.assessment = assessHike(
      hike.distanceMeters,
      hike.elevationGain,
      hike.altitudeMax,
      activities,
    )

    const { error } = await supabase
      .from('planned_hikes')
      .upsert({ ...hikeToRow(hike), user_id: user.id }, { onConflict: 'id' })

    if (error) throw error

    // Persist GPX-derived difficulty markers (Komoot/AllTrails waypoints &
    // track comments classified by lib/difficultyMarkers.ts) — replace any
    // existing set for this hike since a re-import/re-save should reflect
    // the current GPX content, not accumulate stale rows.
    await supabase.from('trail_difficulty_markers').delete().eq('planned_hike_id', hike.id)
    if (hike.difficultyMarkers?.length) {
      await supabase.from('trail_difficulty_markers').insert(
        hike.difficultyMarkers.map(m => ({
          planned_hike_id: hike.id,
          lat: m.lat,
          lon: m.lon,
          source: m.source,
          source_text: m.text,
          severity: m.severity,
          keywords: m.keywords,
        }))
      )
    }

    return NextResponse.json({ ok: true, assessment: hike.assessment })
  } catch (e) {
    console.error('POST /api/planned:', e)
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}

// ── PATCH /api/planned → update metadata fields ──────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as Record<string, unknown>
    const { id, ...patch } = body as {
      id: string
      title?: string
      userNotes?: string
      hikeNotes?: PlannedHike['hikeNotes']
      tags?: string[]
      plannedDate?: string
      cachedPois?: unknown[]
      cachedPoiWiki?: unknown[]
      cachedGuide?: string
      cachedBeautyScore?: PlannedHike['cachedBeautyScore']
      cachedTrailScore?: number
      cachedTrailScoreConfidence?: string
      cachedSafetyScore?: SafetyScore
      cachedRiddles?: PlannedHike['cachedRiddles']
      cachedDrivingDistanceMeters?: number
      cachedDrivingDurationSeconds?: number
      cachedDrivingOriginLat?: number
      cachedDrivingOriginLon?: number
    }

    const dbPatch: Record<string, unknown> = {}
    if (patch.title                        !== undefined) dbPatch.title                          = patch.title
    if (patch.userNotes                    !== undefined) dbPatch.user_notes                     = patch.userNotes
    if (patch.hikeNotes                    !== undefined) dbPatch.hike_notes                     = patch.hikeNotes
    if (patch.tags                         !== undefined) dbPatch.tags                           = patch.tags
    if (patch.plannedDate                  !== undefined) dbPatch.planned_date                   = patch.plannedDate || null
    if (patch.cachedPois                   !== undefined) dbPatch.cached_pois                    = patch.cachedPois
    if (patch.cachedPoiWiki                !== undefined) dbPatch.cached_poi_wiki                = patch.cachedPoiWiki
    if (patch.cachedGuide                  !== undefined) dbPatch.cached_guide                   = patch.cachedGuide
    if (patch.cachedBeautyScore            !== undefined) dbPatch.cached_beauty_score            = patch.cachedBeautyScore
    if (patch.cachedTrailScore             !== undefined) dbPatch.cached_trail_score             = patch.cachedTrailScore
    if (patch.cachedTrailScoreConfidence   !== undefined) dbPatch.cached_trail_score_confidence  = patch.cachedTrailScoreConfidence
    if (patch.cachedSafetyScore            !== undefined) dbPatch.cached_safety_score            = patch.cachedSafetyScore
    if (patch.cachedRiddles                !== undefined) dbPatch.cached_riddles                 = patch.cachedRiddles
    if (patch.cachedDrivingDistanceMeters  !== undefined) dbPatch.cached_driving_distance_m      = patch.cachedDrivingDistanceMeters
    if (patch.cachedDrivingDurationSeconds !== undefined) dbPatch.cached_driving_duration_s      = patch.cachedDrivingDurationSeconds
    if (patch.cachedDrivingOriginLat       !== undefined) dbPatch.cached_driving_origin_lat      = patch.cachedDrivingOriginLat
    if (patch.cachedDrivingOriginLon       !== undefined) dbPatch.cached_driving_origin_lon      = patch.cachedDrivingOriginLon

    const { error } = await supabase
      .from('planned_hikes')
      .update(dbPatch)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/planned:', e)
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}

// ── DELETE /api/planned?id=X ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase
      .from('planned_hikes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/planned:', e)
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
