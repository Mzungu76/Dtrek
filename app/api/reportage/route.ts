import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export interface AllReportageRow {
  id: string
  title: string
  startTime: string
  distanceMeters: number
  elevationGain: number
  totalTimeSeconds: number
  userRating: number | null
  routePolyline?: [number, number][]
  hasWrittenReport: boolean
  percorsoId: string | null
  percorsoTitle: string | null
  diaryId: string | null
  diaryTitle: string | null
}

// GET /api/reportage → "Tutti i Reportage" — redesign menù globale, fase 2. Stesso principio di
// /api/percorsi (vista trasversale di sola consultazione su tutti i Diari): ogni Reportage è
// un'attività (activities) con l'etichetta del Percorso e del Diario di provenienza, quando
// esistono. Un'attività senza linked_planned_id (creata fuori da un Diario, prima di questo
// redesign o tramite /upload senza contesto) resta comunque in elenco — percorsoId/diaryId nulli,
// niente scartato in silenzio.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('id, title, start_time, distance_meters, elevation_gain, total_time_seconds, user_rating, route_polyline, linked_planned_id')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false })
    if (activitiesErr) throw activitiesErr

    const plannedIds = Array.from(new Set((activities ?? []).map(a => a.linked_planned_id as string | null).filter((id): id is string => !!id)))

    const plannedById = new Map<string, { title: string; diaryId: string | null }>()
    if (plannedIds.length > 0) {
      const { data: planned, error: plannedErr } = await supabase
        .from('planned_hikes')
        .select('id, title, diary_id')
        .in('id', plannedIds)
      if (plannedErr) throw plannedErr
      for (const p of planned ?? []) {
        plannedById.set(p.id as string, { title: p.title as string, diaryId: (p.diary_id as string) ?? null })
      }
    }

    const diaryIds = Array.from(new Set(Array.from(plannedById.values()).map(p => p.diaryId).filter((id): id is string => !!id)))
    const diaryTitleById = new Map<string, string>()
    if (diaryIds.length > 0) {
      const { data: diaries, error: diariesErr } = await supabase
        .from('diaries')
        .select('id, title')
        .in('id', diaryIds)
      if (diariesErr) throw diariesErr
      for (const d of diaries ?? []) diaryTitleById.set(d.id as string, d.title as string)
    }

    const activityIds = (activities ?? []).map(a => a.id as string)
    let reportedIds = new Set<string>()
    if (activityIds.length > 0) {
      const { data: reports, error: reportsErr } = await supabase
        .from('hike_reports')
        .select('activity_id')
        .eq('user_id', user.id)
        .in('activity_id', activityIds)
      if (reportsErr) throw reportsErr
      reportedIds = new Set((reports ?? []).map(r => r.activity_id as string))
    }

    const rows: AllReportageRow[] = (activities ?? []).map(a => {
      const percorsoId = (a.linked_planned_id as string) ?? null
      const percorso = percorsoId ? plannedById.get(percorsoId) : undefined
      const diaryId = percorso?.diaryId ?? null
      return {
        id:               a.id as string,
        title:            a.title as string,
        startTime:        a.start_time as string,
        distanceMeters:   a.distance_meters as number,
        elevationGain:    a.elevation_gain as number,
        totalTimeSeconds: a.total_time_seconds as number,
        userRating:       (a.user_rating as number | null) ?? null,
        routePolyline:    a.route_polyline as [number, number][] | undefined,
        hasWrittenReport: reportedIds.has(a.id as string),
        percorsoId,
        percorsoTitle:    percorso?.title ?? null,
        diaryId,
        diaryTitle:       diaryId ? (diaryTitleById.get(diaryId) ?? null) : null,
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
