import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'
import { aggregateDiaries, type DiaryRow, type PlannedDiaryLinkRow, type ActivityMetricsRow } from '@/lib/diari/aggregateDiaries'
import { aggregateCollections, type CollectionRow, type CollectionDiaryLinkRow } from '@/lib/raccolte/aggregateCollections'

export type { CollectionSummary } from '@/lib/raccolte/aggregateCollections'

export const dynamic = 'force-dynamic'

// GET /api/collections → tutte le Raccolte dell'utente, con conteggi aggregati sui Diari che
// contengono — docs/raccolte-pubblicazione-piano.md, Fase 3c. Le stesse tre query di
// GET /api/diaries (planned_hikes + activities, per ricavare reportageCount/distanza/dislivello
// per Diario): una chiamata a sé, non condivisa con quell'endpoint — stesso principio già in atto
// tra /api/diaries e /api/percorsi, ognuno la propria vista.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: collections, error: collectionsErr } = await supabase
      .from('collections')
      .select('id, title, subtitle, cover_url, share_token')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (collectionsErr) throw collectionsErr

    const collectionIds = (collections ?? []).map(c => c.id as string)

    const { data: links, error: linksErr } = collectionIds.length
      ? await supabase
          .from('collection_diaries')
          .select('collection_id, diary_id, position')
          .in('collection_id', collectionIds)
      : { data: [], error: null }
    if (linksErr) throw linksErr

    const [{ data: diaries, error: diariesErr }, { data: planned, error: plannedErr }, { data: activities, error: activitiesErr }] =
      await Promise.all([
        supabase.from('diaries').select('id, title, subtitle, author, cover_url, footer_text, is_default, labels, archived_at').eq('user_id', user.id),
        supabase.from('planned_hikes').select('id, diary_id').eq('user_id', user.id).not('diary_id', 'is', null),
        supabase.from('activities').select('linked_planned_id, distance_meters, elevation_gain, start_time').eq('user_id', user.id).not('linked_planned_id', 'is', null),
      ])
    if (diariesErr) throw diariesErr
    if (plannedErr) throw plannedErr
    if (activitiesErr) throw activitiesErr

    const diarySummaries = aggregateDiaries(
      (diaries ?? []) as DiaryRow[],
      (planned ?? []) as PlannedDiaryLinkRow[],
      (activities ?? []) as ActivityMetricsRow[],
    )

    const summaries = aggregateCollections(
      (collections ?? []) as CollectionRow[],
      (links ?? []) as CollectionDiaryLinkRow[],
      diarySummaries,
    )

    return NextResponse.json(summaries)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST /api/collections → crea una Raccolta vuota — titolo segnaposto, l'utente la compone da
// /raccolte/[id]. A differenza dei Diari (il primo, di default, è sempre gratuito), le Raccolte non
// hanno un equivalente "gratis di base": sono per intero dietro lo sblocco di Dtrek, come i Diari
// AGGIUNTIVI oltre al primo (stessa risoluzione centrale, lib/dtrekEntitlement.ts).
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const entitlement = await resolveDtrekEntitlement(user.id)
    if (!entitlement.unlocked) {
      return NextResponse.json(
        { error: 'trial_limit_reached', message: 'Le raccolte sono una funzione di Dtrek — sbloccalo per crearne una.' },
        { status: 403 },
      )
    }

    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: user.id, title: 'Nuova raccolta', subtitle: '', preface: '' })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ id: data.id as string })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
