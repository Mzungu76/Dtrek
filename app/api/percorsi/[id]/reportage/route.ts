import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export interface ReportageRow {
  id: string
  title: string
  startTime: string
  distanceMeters: number
  /** True se esiste già un hike_reports (narrativa scritta) per questa uscita — "da raccontare"
   *  altrimenti: l'uscita c'è, il racconto no. */
  hasWrittenReport: boolean
}

// GET /api/percorsi/[id]/reportage → tutte le uscite (activities) collegate a questo Percorso,
// più recenti prima. Un Percorso pubblicabile ha length > 0 qui.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activities, error: actErr } = await supabase
      .from('activities')
      .select('id, title, start_time, distance_meters')
      .eq('user_id', user.id)
      .eq('linked_planned_id', params.id)
      .order('start_time', { ascending: false })
    if (actErr) throw actErr

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

    const rows: ReportageRow[] = (activities ?? []).map(a => ({
      id:               a.id as string,
      title:            a.title as string,
      startTime:        a.start_time as string,
      distanceMeters:   a.distance_meters as number,
      hasWrittenReport: reportedIds.has(a.id as string),
    }))

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
