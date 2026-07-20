import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { ActivityMeta } from '@/lib/blobStore'
import { computeDEP } from '@/lib/stats'

export const dynamic = 'force-dynamic'

// Columns to SELECT for the list view — track_points excluded (heavy)
const META_COLS = [
  'id', 'title', 'start_time', 'end_time', 'sport',
  'distance_meters', 'total_time_seconds', 'calories',
  'avg_heart_rate', 'max_heart_rate', 'avg_speed_ms', 'max_speed_ms',
  'altitude_max', 'altitude_min', 'elevation_gain', 'elevation_loss',
  'file_name', 'user_notes', 'tags', 'user_rating', 'user_rating_note',
  'route_polyline', 'soddisfazione',
  'linked_beauty_score', 'trail_score', 'trail_score_confidence', 'trail_score_computed_at',
  'updated_at', 'favorite',
].join(', ')

// Same list without updated_at — fallback for an environment that hasn't run
// supabase/migrations/add_updated_at_tracking.sql yet (that column is itself an
// ALTER TABLE addition, not part of the base schema).
const META_COLS_CORE = [
  'id', 'title', 'start_time', 'end_time', 'sport',
  'distance_meters', 'total_time_seconds', 'calories',
  'avg_heart_rate', 'max_heart_rate', 'avg_speed_ms', 'max_speed_ms',
  'altitude_max', 'altitude_min', 'elevation_gain', 'elevation_loss',
  'file_name', 'user_notes', 'tags', 'user_rating', 'user_rating_note',
  'route_polyline', 'soddisfazione',
  'linked_beauty_score', 'trail_score', 'trail_score_confidence', 'trail_score_computed_at',
].join(', ')

function rowToMeta(row: Record<string, unknown>): ActivityMeta {
  return {
    id:              row.id as string,
    title:           (row.title as string) ?? 'Escursione',
    startTime:       row.start_time as string,
    updatedAt:       row.updated_at as string,
    distanceMeters:  row.distance_meters as number,
    totalTimeSeconds: row.total_time_seconds as number,
    calories:        row.calories as number,
    avgHeartRate:    row.avg_heart_rate as number,
    maxHeartRate:    row.max_heart_rate as number,
    elevationGain:   row.elevation_gain as number,
    elevationLoss:   row.elevation_loss as number,
    altitudeMax:     row.altitude_max as number,
    avgSpeedMs:      row.avg_speed_ms as number,
    maxSpeedMs:      row.max_speed_ms as number,
    tags:            row.tags as string[] | undefined,
    userNotes:       row.user_notes as string | undefined,
    fileName:        row.file_name as string | undefined,
    routePolyline:   row.route_polyline as [number, number][] | undefined,
    userRating:      row.user_rating as number | undefined,
    userRatingNote:  row.user_rating_note as string | undefined,
    soddisfazione:   row.soddisfazione as number | undefined,
    linkedBeautyScore:    row.linked_beauty_score   as import('@/lib/blobStore').ActivityMeta['linkedBeautyScore'] | undefined,
    trailScore:           row.trail_score            as number | undefined,
    trailScoreConfidence: row.trail_score_confidence as import('@/lib/blobStore').ActivityMeta['trailScoreConfidence'] | undefined,
    trailScoreComputedAt: row.trail_score_computed_at as string | undefined,
    depKm:           computeDEP(row.distance_meters as number, row.elevation_gain as number),
    favorite:        row.favorite as boolean | undefined,
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Lightweight freshness check for lib/sync/pullEngine.ts: id + updated_at only,
    // so a device with an already-populated local cache can detect new/changed/deleted
    // rows without re-downloading the full list on every check. A real query error MUST
    // surface as a non-2xx status rather than an empty [] — the reconciler treats an empty
    // digest as "you have zero records on the server" and prunes every locally cached
    // record accordingly, so silently downgrading a failure to [] would look like every
    // record was deleted elsewhere and wipe the local cache for nothing.
    if (req.nextUrl.searchParams.get('digest') === '1') {
      const { data, error } = await supabase
        .from('activities')
        .select('id, updated_at')
        .eq('user_id', user.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(
        (data ?? []).map((r: Record<string, unknown>) => ({ id: r.id as string, updatedAt: r.updated_at as string })),
      )
    }

    // Try full columns; fall back to core if updated_at isn't migrated in yet
    let rows: Record<string, unknown>[]
    const { data: d1, error: e1 } = await supabase
      .from('activities')
      .select(META_COLS)
      .eq('user_id', user.id)
      .order('start_time', { ascending: false })

    if (e1) {
      const { data: d2, error: e2 } = await supabase
        .from('activities')
        .select(META_COLS_CORE)
        .eq('user_id', user.id)
        .order('start_time', { ascending: false })
      if (e2) throw e2
      rows = (d2 ?? []) as unknown as Record<string, unknown>[]
    } else {
      rows = (d1 ?? []) as unknown as Record<string, unknown>[]
    }
    return NextResponse.json(rows.map(rowToMeta))
  } catch (e) {
    console.error('GET /api/activities:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
