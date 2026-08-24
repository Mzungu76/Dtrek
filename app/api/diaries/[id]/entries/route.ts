import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/diaries/[id]/entries → tutti i Reportage (hike_reports) dei Percorsi di questo Diario,
// più l'elenco completo degli activity_id che gli appartengono (Reportage scritti E non scritti) —
// stessa forma di app/api/resoconto/route.ts?all=true (che resta invariato, dietro il vecchio
// /diario), ma filtrata ai soli Percorsi con diary_id = questo Diario invece che a tutto l'utente.
// `activityIds` serve al client (app/diari/[id]/pubblica/page.tsx) per restringere allo stesso
// insieme anche le attività locali (IndexedDB, senza nozione di Diario) usate per stub/mappa/
// statistiche complessive.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (diaryErr) throw diaryErr
    if (!diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: percorsi, error: percorsiErr } = await supabase
      .from('planned_hikes')
      .select('id')
      .eq('user_id', user.id)
      .eq('diary_id', params.id)
    if (percorsiErr) throw percorsiErr
    const percorsoIds = (percorsi ?? []).map(p => p.id as string)
    if (percorsoIds.length === 0) return NextResponse.json({ reports: [], activityIds: [] })

    const { data: activities, error: actErr } = await supabase
      .from('activities')
      .select('id, title, start_time, distance_meters, total_time_seconds, elevation_gain, weather_at_hike')
      .eq('user_id', user.id)
      .in('linked_planned_id', percorsoIds)
    if (actErr) throw actErr
    const activityIds = (activities ?? []).map(a => a.id as string)
    if (activityIds.length === 0) return NextResponse.json({ reports: [], activityIds: [] })

    const { data: reports, error: reportsErr } = await supabase
      .from('hike_reports')
      .select('id, activity_id, title, content, created_at, updated_at, share_token, authored_by')
      .eq('user_id', user.id)
      .in('activity_id', activityIds)
      .order('created_at', { ascending: false })
    if (reportsErr) throw reportsErr

    const actMap = new Map((activities ?? []).map(a => [a.id as string, a]))
    const enriched = (reports ?? []).map(r => ({
      ...r,
      activity: actMap.get(r.activity_id as string) ?? null,
    }))

    return NextResponse.json({ reports: enriched, activityIds })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
