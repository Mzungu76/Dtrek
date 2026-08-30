import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { deletePercorsoCascade } from '@/lib/deletePercorsoCascade'

export const dynamic = 'force-dynamic'

export interface DiarioReportageRow {
  /** activities.id */
  id: string
  title: string
  startTime: string
  distanceMeters: number
  elevationGain: number
  altitudeMax: number
  totalTimeSeconds: number
  routePolyline?: [number, number][]
  /** activities.trail_score — già cachato, nessun ricalcolo qui (stessa convenzione di sola
   *  lettura del resto di questa route). */
  trailScore: number | null
  userRating: number | null
  hasWrittenReport: boolean
  /** planned_hikes.id della Meta camminata — sempre presente per un Reportage creato dopo la
   *  ristrutturazione Diario/Mete (ActivityUploader.tsx collega sempre a una Meta, esistente o
   *  sintetica). Resta null solo per Reportage antecedenti l'introduzione dei Diari. */
  percorsoId: string | null
  /** activities.favorite — filtro "solo preferiti" del Sommario. */
  favorite: boolean
}

export interface DiarioDetail {
  id: string
  title: string
  subtitle: string
  /** Fase 14 — usato per riprodurre in miniatura l'effettiva copertina (DiarioCoverThumb) in
   *  cima al Sommario, non solo per /pubblica. */
  author: string
  isDefault: boolean
  coverUrl: string | null
  reportage: DiarioReportageRow[]
}

// GET /api/diaries/[id] → il Diario e l'elenco dei suoi Reportage — ristrutturazione Diario/Mete
// richiesta esplicitamente dall'utente: un Diario contiene esclusivamente Reportage, mai Mete
// ancora senza uscita (quelle vivono in app/percorsi/page.tsx, trasversali a tutti i Diari). Un
// Reportage appartiene a QUESTO Diario indirettamente: activities non ha una colonna diary_id
// propria, l'appartenenza passa dalla Meta collegata (activities.linked_planned_id →
// planned_hikes.diary_id), coerente con components/upload/ActivityUploader.tsx che scrive
// diary_id sulla Meta proprio nel momento in cui nasce il Reportage.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id, title, subtitle, author, is_default, cover_url')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (diaryErr || !diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id')
      .eq('user_id', user.id)
      .eq('diary_id', params.id)
    if (plannedErr) throw plannedErr

    const plannedIds = (planned ?? []).map(p => p.id as string)

    let reportage: DiarioReportageRow[] = []
    if (plannedIds.length > 0) {
      const { data: activities, error: activitiesErr } = await supabase
        .from('activities')
        .select('id, title, start_time, distance_meters, elevation_gain, altitude_max, total_time_seconds, route_polyline, trail_score, user_rating, favorite, linked_planned_id')
        .eq('user_id', user.id)
        .in('linked_planned_id', plannedIds)
        .order('start_time', { ascending: false })
      if (activitiesErr) throw activitiesErr

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

      reportage = (activities ?? []).map(a => ({
        id:               a.id as string,
        title:            a.title as string,
        startTime:        a.start_time as string,
        distanceMeters:   a.distance_meters as number,
        elevationGain:    a.elevation_gain as number,
        altitudeMax:      a.altitude_max as number,
        totalTimeSeconds: a.total_time_seconds as number,
        routePolyline:    a.route_polyline as [number, number][] | undefined,
        trailScore:       (a.trail_score as number | null) ?? null,
        userRating:       (a.user_rating as number | null) ?? null,
        hasWrittenReport: reportedIds.has(a.id as string),
        percorsoId:       (a.linked_planned_id as string | null) ?? null,
        favorite:         (a.favorite as boolean | null) ?? false,
      }))
    }

    const detail: DiarioDetail = {
      id:        diary.id as string,
      title:     diary.title as string,
      subtitle:  diary.subtitle as string,
      author:    diary.author as string,
      isDefault: diary.is_default as boolean,
      coverUrl:  diary.cover_url as string | null,
      reportage,
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
