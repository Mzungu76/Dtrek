import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchSiteInfo } from '@/lib/siteInfoServer'
import { loadCamminoGroups } from '@/lib/cammini/diaryEntriesServer'
import { hiddenTappaActivityIds } from '@/lib/cammini/diaryEntries'

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
      .select('id, title, start_time, distance_meters, total_time_seconds, elevation_gain, weather_at_hike, meta_type, site_type, borgo_stops, linked_planned_id')
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

    // Punto, immagine e descrizione del luogo per i Reportage di Sito/Borgo (il libro li usa per
    // copertina, mappa e il blocco "Il luogo") — lib/siteInfoServer.ts, best-effort.
    const siteInfo = await fetchSiteInfo((activities ?? []) as { id: string; meta_type?: string | null; linked_planned_id?: string | null }[])
    const actMap = new Map((activities ?? []).map(a => [a.id as string, { ...a, site: siteInfo.get(a.id as string) ?? null }]))
    // Cammini: una sola voce per cammino (reportage padre, con le tappe come capitoli) al posto di una per tappa.
    // La voce poggia sull'attività della prima tappa percorsa, ma con i numeri di tutto il cammino.
    const groups = await loadCamminoGroups(user.id, percorsoIds)
    const hidden = hiddenTappaActivityIds(groups)
    const withContent = new Map(groups.filter(g => g.content.trim()).map(g => [g.repActivityId, g]))
    const base = (reports ?? []).filter(r => !hidden.has(r.activity_id as string) && !withContent.has(r.activity_id as string))
    const virtual = Array.from(withContent.values()).map(g => {
      const rows = (activities ?? []).filter(a => g.tappaActivityIds.includes(a.id as string))
      const sum = (k: 'distance_meters' | 'elevation_gain' | 'total_time_seconds') => rows.reduce((s, a) => s + ((a[k] as number) ?? 0), 0)
      const rep = actMap.get(g.repActivityId)
      return {
        id: `cammino:${g.hikeId}`, activity_id: g.repActivityId, title: g.name, content: g.content,
        created_at: g.startTime, updated_at: g.startTime, share_token: null, authored_by: null,
        activity: rep ? { ...rep, title: g.name, meta_type: 'cammino', distance_meters: sum('distance_meters'), elevation_gain: sum('elevation_gain'), total_time_seconds: sum('total_time_seconds') } : null,
      }
    })
    const enriched = [
      ...base.map(r => ({ ...r, activity: actMap.get(r.activity_id as string) ?? null })),
      ...virtual,
    ]

    return NextResponse.json({ reports: enriched, activityIds })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
