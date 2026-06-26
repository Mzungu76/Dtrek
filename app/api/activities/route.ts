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
  'linked_beauty_score', 'trail_score', 'trail_score_confidence',
].join(', ')

function rowToMeta(row: Record<string, unknown>): ActivityMeta {
  return {
    id:              row.id as string,
    title:           (row.title as string) ?? 'Escursione',
    startTime:       row.start_time as string,
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
    depKm:           computeDEP(row.distance_meters as number, row.elevation_gain as number),
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('activities')
      .select(META_COLS)
      .eq('user_id', user.id)
      .order('start_time', { ascending: false })

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json((data ?? [] as any[]).map((r: any) => rowToMeta(r)))
  } catch (e) {
    console.error('GET /api/activities:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
