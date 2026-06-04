/**
 * GET /api/migrate
 * Endpoint one-time: sposta tutti i dati da Vercel Blob a Supabase.
 * Chiama una volta dopo il deploy, poi puoi eliminare questo file.
 *
 * Protetto dalla variabile MIGRATE_SECRET:
 *   GET /api/migrate?secret=<MIGRATE_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { readIndex, readBlobText } from '@/lib/blobIndex'
import { readPlannedIndex, readPlannedBlobText } from '@/lib/plannedIndex'
import type { StoredActivity } from '@/lib/blobStore'
import type { PlannedHike } from '@/lib/plannedStore'
import type { TrackPoint } from '@/lib/tcxParser'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — la migrazione può essere lenta

function idToActivityPath(id: string) {
  return `activities/${id.replace(/[^a-zA-Z0-9\-_.]/g, '_')}.json`
}
function idToPlannedPath(id: string) {
  return `planned/${id.replace(/[^a-zA-Z0-9\-_.]/g, '_')}.json`
}

function downsamplePolyline(pts: TrackPoint[], maxPts = 60): [number, number][] {
  const valid = pts.filter(p => p.lat !== undefined && p.lon !== undefined)
  if (!valid.length) return []
  const count = Math.min(valid.length, maxPts)
  const step  = (valid.length - 1) / (count - 1 || 1)
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(Math.round(i * step), valid.length - 1)
    return [Math.round(valid[idx].lat! * 1e5) / 1e5, Math.round(valid[idx].lon! * 1e5) / 1e5]
  })
}

export async function GET(req: NextRequest) {
  // Simple secret guard — set MIGRATE_SECRET in Vercel env vars
  const secret = process.env.MIGRATE_SECRET
  if (secret && req.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []
  let actOk = 0, actErr = 0, planOk = 0, planErr = 0

  // ── Activities ──────────────────────────────────────────────
  log.push('Reading activities index from Vercel Blob…')
  const actMetas = await readIndex()
  log.push(`Found ${actMetas.length} activities in blob index`)

  for (const meta of actMetas) {
    try {
      const text = await readBlobText(idToActivityPath(meta.id))
      if (!text) { log.push(`SKIP (no blob): ${meta.id}`); actErr++; continue }

      const a = JSON.parse(text) as StoredActivity
      const row = {
        id:                   a.id,
        title:                a.title ?? a.notes ?? 'Escursione',
        start_time:           a.startTime,
        end_time:             a.endTime || null,
        sport:                a.sport ?? 'Other',
        notes:                a.notes ?? '',
        device:               a.device ?? '',
        distance_meters:      a.distanceMeters ?? 0,
        total_time_seconds:   a.totalTimeSeconds ?? 0,
        calories:             a.calories ?? 0,
        avg_heart_rate:       a.avgHeartRate ?? 0,
        max_heart_rate:       a.maxHeartRate ?? 0,
        avg_speed_ms:         a.avgSpeedMs ?? 0,
        max_speed_ms:         a.maxSpeedMs ?? 0,
        altitude_min:         a.altitudeMin ?? 0,
        altitude_max:         a.altitudeMax ?? 0,
        elevation_gain:       a.elevationGain ?? 0,
        elevation_loss:       a.elevationLoss ?? 0,
        file_name:            a.fileName ?? null,
        user_notes:           a.userNotes ?? null,
        tags:                 a.tags ?? null,
        user_rating:          a.userRating ?? null,
        user_rating_note:     a.userRatingNote ?? null,
        linked_planned_id:    a.linkedPlannedId ?? null,
        route_polyline:       downsamplePolyline(a.trackPoints ?? []),
        track_points:         a.trackPoints ?? [],
      }

      const { error } = await supabase
        .from('activities')
        .upsert(row, { onConflict: 'id' })

      if (error) throw error
      actOk++
      log.push(`OK activity: ${meta.title ?? meta.id}`)
    } catch (e) {
      actErr++
      log.push(`ERR activity ${meta.id}: ${String(e)}`)
    }
  }

  // ── Planned hikes ───────────────────────────────────────────
  log.push('Reading planned index from Vercel Blob…')
  const planMetas = await readPlannedIndex()
  log.push(`Found ${planMetas.length} planned hikes in blob index`)

  for (const meta of planMetas) {
    try {
      const text = await readPlannedBlobText(idToPlannedPath(meta.id))
      if (!text) { log.push(`SKIP (no blob): ${meta.id}`); planErr++; continue }

      const h = JSON.parse(text) as PlannedHike
      const row = {
        id:                     h.id,
        title:                  h.title,
        planned_date:           h.plannedDate ?? null,
        file_name:              h.fileName ?? null,
        user_notes:             h.userNotes ?? null,
        tags:                   h.tags ?? null,
        created_at:             h.createdAt,
        distance_meters:        h.distanceMeters ?? 0,
        elevation_gain:         h.elevationGain ?? 0,
        elevation_loss:         h.elevationLoss ?? 0,
        altitude_max:           h.altitudeMax ?? 0,
        altitude_min:           h.altitudeMin ?? 0,
        estimated_time_seconds: h.estimatedTimeSeconds ?? 0,
        route_polyline:         h.routePolyline ?? downsamplePolyline(h.trackPoints ?? []),
        track_points:           h.trackPoints ?? [],
        assessment:             h.assessment ?? null,
      }

      const { error } = await supabase
        .from('planned_hikes')
        .upsert(row, { onConflict: 'id' })

      if (error) throw error
      planOk++
      log.push(`OK planned: ${h.title}`)
    } catch (e) {
      planErr++
      log.push(`ERR planned ${meta.id}: ${String(e)}`)
    }
  }

  return NextResponse.json({
    summary: {
      activities: { ok: actOk, errors: actErr },
      planned:    { ok: planOk, errors: planErr },
    },
    log,
  })
}
