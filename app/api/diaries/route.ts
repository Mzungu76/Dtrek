import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'

export const dynamic = 'force-dynamic'

export interface DiarySummary {
  id: string
  title: string
  subtitle: string
  author: string
  coverUrl: string | null
  footerText: string
  isDefault: boolean
  /** Numero di Reportage (activities collegate, tramite le Mete di questo Diario) che
   *  appartengono a questo Diario — ristrutturazione Diario/Mete: un Diario contiene solo
   *  Reportage, non più Mete "in programma" ancora senza uscita. */
  reportageCount: number
  /** True se questo Diario ha almeno un Reportage — la regola dei "requisiti minimi": solo un
   *  Diario così può essere pubblicato/condiviso. */
  pubblicabile: boolean
}

// GET /api/diaries → tutti i Diari dell'utente, con conteggio Reportage e idoneità alla
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
      .not('diary_id', 'is', null)
    if (plannedErr) throw plannedErr

    const { data: activities, error: activitiesErr } = await supabase
      .from('activities')
      .select('linked_planned_id')
      .eq('user_id', user.id)
      .not('linked_planned_id', 'is', null)
    if (activitiesErr) throw activitiesErr

    // Una Meta non ha una colonna diary_id "propria" del suo Diario finché non viene camminata
    // (vedi app/api/planned/route.ts) — quindi il Diario di ogni Reportage si ricava passando
    // dalla sua Meta collegata, non da una colonna diretta su activities (che non esiste).
    const diaryIdByPlannedId = new Map((planned ?? []).map(p => [p.id as string, p.diary_id as string]))
    const reportageCountByDiaryId = new Map<string, number>()
    for (const a of activities ?? []) {
      const diaryId = diaryIdByPlannedId.get(a.linked_planned_id as string)
      if (!diaryId) continue
      reportageCountByDiaryId.set(diaryId, (reportageCountByDiaryId.get(diaryId) ?? 0) + 1)
    }

    const summaries: DiarySummary[] = (diaries ?? []).map(d => {
      const reportageCount = reportageCountByDiaryId.get(d.id as string) ?? 0
      return {
        id:             d.id as string,
        title:          d.title as string,
        subtitle:       d.subtitle as string,
        author:         d.author as string,
        coverUrl:       d.cover_url as string | null,
        footerText:     d.footer_text as string,
        isDefault:      d.is_default as boolean,
        reportageCount,
        pubblicabile:   reportageCount > 0,
      }
    })

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
