import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { StoredActivity } from '@/lib/blobStore'
import type { TrackPoint } from '@/lib/tcxParser'

// ── Personal delta recomputation ──────────────────────────────────────────────

async function recomputePersonalDelta(userId: string) {
  try {
    const { data: settings } = await supabase
      .from('user_settings').select('user_age').eq('user_id', userId).single()
    const userAge = (settings?.user_age as number) ?? 0
    const userFCmax = userAge >= 10 ? Math.round(211 - 0.64 * userAge) : 185

    const { data: acts } = await supabase
      .from('activities')
      .select('avg_heart_rate, distance_meters, elevation_gain, start_time')
      .eq('user_id', userId)
      .gt('avg_heart_rate', 0)
      .gt('distance_meters', 0)
      .order('start_time', { ascending: false })
      .limit(50)

    if (!acts?.length) return

    const now = Date.now()
    let sumW = 0, sumDeltaW = 0
    for (const act of acts) {
      const distKm   = (act.distance_meters as number) / 1000
      const elevGain = (act.elevation_gain  as number) ?? 0
      const tNaismith = distKm / 4.5 + elevGain / 600
      const fStd      = Math.min(Math.max(tNaismith * 1.10 * 1.4, 1.5), 10)
      const expectedFcPct = 50 + fStd * 4
      const actualFcPct   = ((act.avg_heart_rate as number) / userFCmax) * 100
      const delta         = (actualFcPct - expectedFcPct) / 10
      const daysSince     = (now - new Date(act.start_time as string).getTime()) / 86400000
      const w             = (fStd / 10) * Math.exp(-daysSince / 180)
      sumW += w; sumDeltaW += delta * w
    }

    const personalDelta = sumW > 0 ? Math.round((sumDeltaW / sumW) * 100) / 100 : 0
    await supabase.from('user_settings').upsert(
      { user_id: userId, personal_delta: personalDelta, hr_hike_count: acts.length, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  } catch (e) {
    console.error('recomputePersonalDelta:', e)
  }
}

export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function downsampleTrackPoints(pts: TrackPoint[], maxPts = 1500): TrackPoint[] {
  if (pts.length <= maxPts) return pts
  const step = (pts.length - 1) / (maxPts - 1)
  return Array.from({ length: maxPts }, (_, i) =>
    pts[Math.min(Math.round(i * step), pts.length - 1)]
  )
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

function rowToActivity(row: Record<string, unknown>): StoredActivity {
  return {
    id:              row.id as string,
    title:           (row.title as string) ?? undefined,
    sport:           (row.sport as string) ?? 'Other',
    notes:           (row.notes as string) ?? '',
    device:          (row.device as string) ?? '',
    startTime:       row.start_time as string,
    endTime:         (row.end_time as string) ?? '',
    totalTimeSeconds: row.total_time_seconds as number,
    distanceMeters:  row.distance_meters as number,
    calories:        row.calories as number,
    avgHeartRate:    row.avg_heart_rate as number,
    maxHeartRate:    row.max_heart_rate as number,
    avgSpeedMs:      row.avg_speed_ms as number,
    maxSpeedMs:      row.max_speed_ms as number,
    altitudeMin:     row.altitude_min as number,
    altitudeMax:     row.altitude_max as number,
    elevationGain:   row.elevation_gain as number,
    elevationLoss:   row.elevation_loss as number,
    trackPoints:     (row.track_points as TrackPoint[]) ?? [],
    fileName:        row.file_name as string | undefined,
    userNotes:       row.user_notes as string | undefined,
    tags:            row.tags as string[] | undefined,
    userRating:      row.user_rating as number | undefined,
    userRatingNote:  row.user_rating_note as string | undefined,
    linkedPlannedId: row.linked_planned_id as string | undefined,
    linkedPlannedTrackPoints: row.linked_planned_track_points as TrackPoint[] | undefined,
    linkedBeautyScore: row.linked_beauty_score as StoredActivity['linkedBeautyScore'],
    soddisfazione: row.soddisfazione as number | undefined,
    lootScore:     row.loot_score as number | undefined,
    trailScore:    row.trail_score as number | undefined,
  }
}

function activityToRow(a: StoredActivity) {
  return {
    id:                   a.id,
    title:                a.title ?? a.notes ?? 'Escursione',
    start_time:           a.startTime,
    end_time:             a.endTime || null,
    sport:                a.sport,
    notes:                a.notes,
    device:               a.device,
    distance_meters:      a.distanceMeters,
    total_time_seconds:   a.totalTimeSeconds,
    calories:             a.calories,
    avg_heart_rate:       a.avgHeartRate,
    max_heart_rate:       a.maxHeartRate,
    avg_speed_ms:         a.avgSpeedMs,
    max_speed_ms:         a.maxSpeedMs,
    altitude_min:         a.altitudeMin,
    altitude_max:         a.altitudeMax,
    elevation_gain:       a.elevationGain,
    elevation_loss:       a.elevationLoss,
    file_name:            a.fileName ?? null,
    user_notes:           a.userNotes ?? null,
    tags:                 a.tags ?? null,
    user_rating:          a.userRating ?? null,
    user_rating_note:     a.userRatingNote ?? null,
    linked_planned_id:            a.linkedPlannedId ?? null,
    linked_planned_track_points:  a.linkedPlannedTrackPoints ?? null,
    linked_beauty_score:          a.linkedBeautyScore ?? null,
    soddisfazione:                a.soddisfazione ?? null,
    loot_score:                   a.lootScore ?? null,
    trail_score:                  a.trailScore ?? null,
    route_polyline:       downsamplePolyline(a.trackPoints ?? []),
    track_points:         downsampleTrackPoints(a.trackPoints ?? []),
  }
}

// ── GET /api/activity?id=X ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rowToActivity(data))
  } catch (e) {
    console.error('GET /api/activity:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST /api/activity → upsert ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const activity = (await req.json()) as StoredActivity
    const { error } = await supabase
      .from('activities')
      .upsert({ ...activityToRow(activity), user_id: user.id }, { onConflict: 'id' })

    if (error) throw error
    if (activity.avgHeartRate && activity.avgHeartRate > 0) {
      recomputePersonalDelta(user.id)  // fire-and-forget
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/activity:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PATCH /api/activity → update metadata fields ─────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as Record<string, unknown>
    const { id, ...patch } = body as {
      id: string
      title?: string
      userNotes?: string
      tags?: string[]
      userRating?: number
      userRatingNote?: string
      linkedPlannedId?: string
      linkedBeautyScore?: StoredActivity['linkedBeautyScore']
      soddisfazione?: number
      lootScore?: number
      trailScore?: number
    }

    const dbPatch: Record<string, unknown> = {}
    if (patch.title             !== undefined) dbPatch.title               = patch.title
    if (patch.userNotes         !== undefined) dbPatch.user_notes          = patch.userNotes
    if (patch.tags              !== undefined) dbPatch.tags                = patch.tags
    if (patch.userRating        !== undefined) dbPatch.user_rating         = patch.userRating
    if (patch.userRatingNote    !== undefined) dbPatch.user_rating_note    = patch.userRatingNote
    if (patch.linkedPlannedId   !== undefined) dbPatch.linked_planned_id   = patch.linkedPlannedId
    if (patch.linkedBeautyScore !== undefined) dbPatch.linked_beauty_score = patch.linkedBeautyScore
    if (patch.soddisfazione     !== undefined) dbPatch.soddisfazione       = patch.soddisfazione
    if (patch.lootScore         !== undefined) dbPatch.loot_score          = patch.lootScore
    if (patch.trailScore        !== undefined) dbPatch.trail_score         = patch.trailScore

    const { error } = await supabase
      .from('activities')
      .update(dbPatch)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/activity:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE /api/activity?id=X ────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/activity:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
