import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export interface DiarySummary {
  id: string
  title: string
  subtitle: string
  author: string
  coverUrl: string | null
  footerText: string
  isDefault: boolean
  /** Numero di Percorsi (planned_hikes) che appartengono a questo Diario. */
  percorsiCount: number
  /** True se almeno un Percorso di questo Diario ha almeno un Reportage (un'activity collegata) —
   *  la regola dei "requisiti minimi": solo un Diario così può essere pubblicato/condiviso. */
  pubblicabile: boolean
}

// GET /api/diaries → tutti i Diari dell'utente, con conteggio Percorsi e idoneità alla
// pubblicazione. "Il mio Diario" (is_default) sempre per primo.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diaries, error: diariesErr } = await supabase
      .from('diaries')
      .select('id, title, subtitle, author, cover_url, footer_text, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    if (diariesErr) throw diariesErr

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, diary_id')
      .eq('user_id', user.id)
    if (plannedErr) throw plannedErr

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('linked_planned_id')
      .eq('user_id', user.id)
      .not('linked_planned_id', 'is', null)
    if (activitiesErr) throw activitiesErr

    const percorsiConReportage = new Set((activities ?? []).map(a => a.linked_planned_id as string))

    const summaries: DiarySummary[] = (diaries ?? []).map(d => {
      const percorsiDiQuestoDiario = (planned ?? []).filter(p => p.diary_id === d.id)
      return {
        id:            d.id as string,
        title:         d.title as string,
        subtitle:      d.subtitle as string,
        author:        d.author as string,
        coverUrl:      d.cover_url as string | null,
        footerText:    d.footer_text as string,
        isDefault:     d.is_default as boolean,
        percorsiCount: percorsiDiQuestoDiario.length,
        pubblicabile:  percorsiDiQuestoDiario.some(p => percorsiConReportage.has(p.id as string)),
      }
    })

    return NextResponse.json(summaries)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
