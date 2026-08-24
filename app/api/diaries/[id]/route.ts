import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { deletePercorsoCascade } from '@/lib/deletePercorsoCascade'

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

// DELETE /api/diaries/[id]?action=migrate|deleteAll → Fase 6 di docs/diario-fulcro-piano.md. Mai
// un default silenzioso: l'utente sceglie esplicitamente se i Percorsi del Diario passano al
// Diario di default ('migrate') o vengono eliminati con tutti i loro Reportage ('deleteAll'). Il
// Diario di default stesso non è mai eliminabile da qui.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'migrate' && action !== 'deleteAll') {
      return NextResponse.json({ error: 'action deve essere "migrate" o "deleteAll"' }, { status: 400 })
    }

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id, is_default')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (diaryErr) throw diaryErr
    if (!diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (diary.is_default) return NextResponse.json({ error: 'Il Diario di default non può essere eliminato' }, { status: 400 })

    if (action === 'migrate') {
      const { data: defaultDiary, error: defaultErr } = await supabase
        .from('diaries')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle()
      if (defaultErr) throw defaultErr
      if (!defaultDiary) return NextResponse.json({ error: 'Diario di default non trovato' }, { status: 500 })

      const { error: moveErr } = await supabase
        .from('planned_hikes')
        .update({ diary_id: defaultDiary.id })
        .eq('user_id', user.id)
        .eq('diary_id', params.id)
      if (moveErr) throw moveErr
    } else {
      const { data: percorsi, error: percorsiErr } = await supabase
        .from('planned_hikes')
        .select('id')
        .eq('user_id', user.id)
        .eq('diary_id', params.id)
      if (percorsiErr) throw percorsiErr
      for (const p of percorsi ?? []) {
        await deletePercorsoCascade(user.id, p.id as string)
      }
    }

    // Copertina e PDF del Diario (percorso deterministico, vedi lib/diaryCoverUpload.ts e
    // lib/pdfUpload.ts) — nessun errore se non sono mai esistiti.
    await supabase.storage.from('dtrek-photos').remove([`${user.id}/diaries/${params.id}/diary-cover.jpg`])
    await supabase.storage.from('dtrek-reports').remove([`${user.id}/diaries/${params.id}/diary.pdf`])

    const { error: deleteErr } = await supabase
      .from('diaries')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (deleteErr) throw deleteErr

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
