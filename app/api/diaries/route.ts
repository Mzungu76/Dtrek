import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'
import { aggregateDiaries, type DiaryRow, type PlannedDiaryLinkRow, type ActivityMetricsRow } from '@/lib/diari/aggregateDiaries'

export type { DiarySummary } from '@/lib/diari/aggregateDiaries'

export const dynamic = 'force-dynamic'

// GET /api/diaries → tutti i Diari dell'utente, con conteggio Reportage, metriche aggregate
// (distanza/dislivello/ultima uscita — restyling pagina /diari, docs/diari-restyling-piano.md
// Fase 0) e idoneità alla pubblicazione. "Il mio Diario" (is_default) sempre per primo. Il calcolo
// vero e proprio è in lib/diari/aggregateDiaries.ts (puro, testato): questa route resta un thin
// wrapper sulle query Supabase.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diaries, error: diariesErr } = await supabase
      .from('diaries')
      .select('id, title, subtitle, author, cover_url, footer_text, is_default, labels, archived_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    if (diariesErr) throw diariesErr

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, diary_id')
      .eq('user_id', user.id)
      .not('diary_id', 'is', null)
    if (plannedErr) throw plannedErr

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('linked_planned_id, distance_meters, elevation_gain, start_time')
      .eq('user_id', user.id)
      .not('linked_planned_id', 'is', null)
    if (activitiesErr) throw activitiesErr

    const summaries = aggregateDiaries(
      (diaries ?? []) as DiaryRow[],
      (planned ?? []) as PlannedDiaryLinkRow[],
      (activities ?? []) as ActivityMetricsRow[],
    )

    return NextResponse.json(summaries)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST /api/diaries → crea un nuovo Diario, vuoto (0 Percorsi), titolo segnaposto — l'utente lo
// rinomina e gli sceglie una copertina da /diari/[id]/pubblica (l'editor esiste già, riusato
// invece di costruirne uno per la creazione). Il Diario di default ("Il mio Diario") esiste già
// per ogni utente dal backfill — questa route serve solo per Diari AGGIUNTIVI, gated: gratis il
// primo (il default, mai creato da qui), i successivi solo per chi ha sbloccato Dtrek (Premium/
// BYOK/owner — stessa risoluzione centrale di ogni altro gate, vedi lib/dtrekEntitlement.ts).
// Decisione esplicita dell'utente (non un limite arbitrario inventato qui).
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { count, error: countErr } = await supabase
      .from('diaries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (countErr) throw countErr

    if ((count ?? 0) >= 1) {
      const entitlement = await resolveDtrekEntitlement(user.id)
      if (!entitlement.unlocked) {
        return NextResponse.json(
          { error: 'trial_limit_reached', message: 'Il Diario di default è incluso nel piano gratuito — sblocca Dtrek per crearne altri.' },
          { status: 403 },
        )
      }
    }

    const { data, error } = await supabase
      .from('diaries')
      .insert({ user_id: user.id, title: 'Nuovo Diario', subtitle: '', author: '', is_default: false })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ id: data.id as string })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
