import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { MetaType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'

export interface AllPercorsiRow {
  id: string
  title: string
  distanceMeters: number
  elevationGain: number
  altitudeMax: number
  estimatedTimeSeconds: number
  routePolyline?: [number, number][]
  createdAt: string
  firstCompletedAt: string | null
  diaryId: string | null
  diaryTitle: string | null
  reportageCount: number
  pubblicabile: boolean
  /** planned_hikes.cached_ts_total — già cachato, nessun ricalcolo qui (stessa convenzione di
   *  sola lettura di app/api/diaries/[id]/route.ts). */
  trailScore: number | null
  favorite: boolean
  metaType: MetaType
}

// GET /api/percorsi → "Tutti i Percorsi" — Fase 5 di docs/diario-fulcro-piano.md. Vista trasversale
// di sola consultazione su tutti i Diari dell'utente, ciascun Percorso con l'etichetta del Diario
// di provenienza — non sostituisce app/diari/[id] (che resta il modo di lavorare dentro UN Diario),
// serve a ritrovare un Percorso senza ricordare in quale Diario l'avevi messo.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, title, distance_meters, elevation_gain, altitude_max, estimated_time_seconds, route_polyline, created_at, first_completed_at, diary_id, archived_at, cached_ts_total, favorite, meta_type')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (plannedErr) throw plannedErr

    const { data: diaries, error: diariesErr } = await supabase
      .from('diaries')
      .select('id, title')
      .eq('user_id', user.id)
    if (diariesErr) throw diariesErr
    const diaryTitleById = new Map((diaries ?? []).map(d => [d.id as string, d.title as string]))

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

    const rows: AllPercorsiRow[] = (planned ?? []).map(p => {
      const reportageCount = reportageCounts.get(p.id as string) ?? 0
      const diaryId = (p.diary_id as string) ?? null
      return {
        id:                    p.id as string,
        title:                 p.title as string,
        distanceMeters:        p.distance_meters as number,
        elevationGain:         p.elevation_gain as number,
        altitudeMax:           p.altitude_max as number,
        estimatedTimeSeconds:  p.estimated_time_seconds as number,
        routePolyline:         p.route_polyline as [number, number][] | undefined,
        createdAt:             p.created_at as string,
        firstCompletedAt:      p.first_completed_at as string | null,
        diaryId,
        diaryTitle:            diaryId ? (diaryTitleById.get(diaryId) ?? null) : null,
        reportageCount,
        pubblicabile:          reportageCount > 0,
        trailScore:            (p.cached_ts_total as number | null) ?? null,
        favorite:              (p.favorite as boolean | null) ?? false,
        metaType:              (p.meta_type as MetaType) ?? 'sentiero',
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
