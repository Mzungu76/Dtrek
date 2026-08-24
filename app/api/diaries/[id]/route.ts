import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export interface DiarioPercorsoRow {
  id: string
  title: string
  distanceMeters: number
  elevationGain: number
  routePolyline?: [number, number][]
  firstCompletedAt: string | null
  reportageCount: number
  pubblicabile: boolean
}

export interface DiarioDetail {
  id: string
  title: string
  subtitle: string
  isDefault: boolean
  coverUrl: string | null
  percorsi: DiarioPercorsoRow[]
}

// GET /api/diaries/[id] → il Diario e l'elenco dei suoi Percorsi, ciascuno col conteggio dei
// Reportage (activities collegate) e il bollino di idoneità alla pubblicazione (≥1 Reportage).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id, title, subtitle, is_default, cover_url')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (diaryErr || !diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, title, distance_meters, elevation_gain, route_polyline, first_completed_at')
      .eq('user_id', user.id)
      .eq('diary_id', params.id)
      .order('created_at', { ascending: false })
    if (plannedErr) throw plannedErr

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('linked_planned_id')
      .eq('user_id', user.id)
      .not('linked_planned_id', 'is', null)
    if (activitiesErr) throw activitiesErr

    const reportageCounts = new Map<string, number>()
    for (const a of activities ?? []) {
      const id = a.linked_planned_id as string
      reportageCounts.set(id, (reportageCounts.get(id) ?? 0) + 1)
    }

    const percorsi: DiarioPercorsoRow[] = (planned ?? []).map(p => {
      const reportageCount = reportageCounts.get(p.id as string) ?? 0
      return {
        id:                p.id as string,
        title:             p.title as string,
        distanceMeters:    p.distance_meters as number,
        elevationGain:     p.elevation_gain as number,
        routePolyline:     p.route_polyline as [number, number][] | undefined,
        firstCompletedAt:  p.first_completed_at as string | null,
        reportageCount,
        pubblicabile:      reportageCount > 0,
      }
    })

    const detail: DiarioDetail = {
      id:        diary.id as string,
      title:     diary.title as string,
      subtitle:  diary.subtitle as string,
      isDefault: diary.is_default as boolean,
      coverUrl:  diary.cover_url as string | null,
      percorsi,
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
