import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { CollectionRow, CollectionDiaryLinkRow } from '@/lib/raccolte/aggregateCollections'
import type { DiaryRow, PlannedDiaryLinkRow } from '@/lib/diari/aggregateDiaries'
import { buildRaccolteTree, type ActivityTreeRow, type HikeReportTokenRow, type RaccoltaTreeNode } from '@/lib/raccolte/buildRaccolteTree'

export type { RaccoltaTreeNode, DiarioTreeNode, ReportageTreeNode } from '@/lib/raccolte/buildRaccolteTree'

export const dynamic = 'force-dynamic'

// GET /api/collections/tree → l'intera gerarchia Raccolta → Diario → Reportage in una sola
// chiamata, per la pagina /raccolte (centro di controllo ad albero) — stesse query di
// GET /api/collections, con id/titolo/data/km per ogni singolo Reportage invece dei soli totali:
// qui l'albero deve renderizzare le righe, non le somme.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: collections, error: collectionsErr } = await supabase
      .from('collections')
      .select('id, title, subtitle, cover_url, share_token, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
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
        supabase.from('diaries').select('id, title, subtitle, author, cover_url, footer_text, is_default, labels, archived_at, share_token').eq('user_id', user.id),
        supabase.from('planned_hikes').select('id, diary_id').eq('user_id', user.id).not('diary_id', 'is', null),
        supabase.from('activities').select('id, title, start_time, distance_meters, linked_planned_id').eq('user_id', user.id).not('linked_planned_id', 'is', null),
      ])
    if (diariesErr) throw diariesErr
    if (plannedErr) throw plannedErr
    if (activitiesErr) throw activitiesErr

    // Solo per l'icona pubblicato/bozza di ogni Reportage nell'albero — un Reportage senza
    // hike_reports non ha mai un token, quindi è sempre bozza (nessuna riga da cercare per lui).
    const activityIds = (activities ?? []).map(a => a.id as string)
    const { data: hikeReports, error: hikeReportsErr } = activityIds.length
      ? await supabase.from('hike_reports').select('activity_id, share_token').eq('user_id', user.id).in('activity_id', activityIds)
      : { data: [], error: null }
    if (hikeReportsErr) throw hikeReportsErr

    const tree: RaccoltaTreeNode[] = buildRaccolteTree(
      (collections ?? []) as CollectionRow[],
      (links ?? []) as CollectionDiaryLinkRow[],
      (diaries ?? []) as DiaryRow[],
      (planned ?? []) as PlannedDiaryLinkRow[],
      (activities ?? []) as ActivityTreeRow[],
      (hikeReports ?? []) as HikeReportTokenRow[],
    )

    return NextResponse.json(tree)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
