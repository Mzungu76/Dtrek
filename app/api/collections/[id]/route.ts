import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { aggregateDiaries, type DiaryRow, type PlannedDiaryLinkRow, type ActivityMetricsRow } from '@/lib/diari/aggregateDiaries'

export const dynamic = 'force-dynamic'

export interface CollectionDetailDiario {
  id:             string
  title:          string
  subtitle:       string
  coverUrl:       string | null
  reportageCount: number
  distanceMeters: number
  elevationGain:  number
}

export interface CollectionDetail {
  id:          string
  title:       string
  subtitle:    string
  preface:     string
  coverUrl:    string | null
  isPublished: boolean
  /** Già nell'ordine di lettura della raccolta (`collection_diaries.position`). */
  diari:       CollectionDetailDiario[]
}

// GET /api/collections/[id] → la Raccolta e i suoi volumi in ordine, con le stesse metriche
// aggregate di GET /api/diaries — docs/raccolte-pubblicazione-piano.md, Fase 3c. Usata dalla
// schermata di composizione (/raccolte/[id]).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: collection, error: collectionErr } = await supabase
      .from('collections')
      .select('id, title, subtitle, preface, cover_url, share_token')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (collectionErr) throw collectionErr
    if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: links, error: linksErr } = await supabase
      .from('collection_diaries')
      .select('diary_id, position')
      .eq('collection_id', params.id)
      .order('position', { ascending: true })
    if (linksErr) throw linksErr
    const diaryIds = (links ?? []).map(l => l.diary_id as string)

    let diari: CollectionDetailDiario[] = []
    if (diaryIds.length > 0) {
      const [{ data: diaries, error: diariesErr }, { data: planned, error: plannedErr }, { data: activities, error: activitiesErr }] =
        await Promise.all([
          supabase.from('diaries').select('id, title, subtitle, author, cover_url, footer_text, is_default, labels, archived_at').eq('user_id', user.id).in('id', diaryIds),
          supabase.from('planned_hikes').select('id, diary_id').eq('user_id', user.id).in('diary_id', diaryIds),
          supabase.from('activities').select('linked_planned_id, distance_meters, elevation_gain, start_time').eq('user_id', user.id).not('linked_planned_id', 'is', null),
        ])
      if (diariesErr) throw diariesErr
      if (plannedErr) throw plannedErr
      if (activitiesErr) throw activitiesErr

      const summaries = aggregateDiaries(
        (diaries ?? []) as DiaryRow[],
        (planned ?? []) as PlannedDiaryLinkRow[],
        (activities ?? []) as ActivityMetricsRow[],
      )
      const summaryById = new Map(summaries.map(d => [d.id, d]))

      // Nell'ordine di `diaryIds` (già quello di `position`), non in quello restituito da
      // `diaries` — un Diario eliminato nel frattempo (ON DELETE CASCADE sulla giunzione, quindi
      // in teoria non dovrebbe più comparire in `links`) viene comunque scartato in sicurezza qui.
      diari = diaryIds
        .map(id => summaryById.get(id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
        .map(d => ({
          id: d.id, title: d.title, subtitle: d.subtitle, coverUrl: d.coverUrl,
          reportageCount: d.reportageCount, distanceMeters: d.distanceMeters, elevationGain: d.elevationGain,
        }))
    }

    const detail: CollectionDetail = {
      id:          collection.id as string,
      title:       collection.title as string,
      subtitle:    collection.subtitle as string,
      preface:     collection.preface as string,
      coverUrl:    (collection.cover_url as string) ?? null,
      isPublished: collection.share_token !== null,
      diari,
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// PATCH /api/collections/[id] { title?, subtitle?, preface?, coverUrl? } → un campo alla volta,
// come PATCH /api/diaries/[id] per labels/archivedAt — non un "sostituisci tutto" come
// PATCH /api/diaries/[id]/config (qui non c'è un DiaryConfig da normalizzare, i campi sono già
// tutti colonne dirette).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const dbPatch: Record<string, unknown> = {}

    for (const [bodyKey, dbKey] of [['title', 'title'], ['subtitle', 'subtitle'], ['preface', 'preface'], ['coverUrl', 'cover_url']] as const) {
      if (!Object.prototype.hasOwnProperty.call(body, bodyKey)) continue
      const value = body[bodyKey]
      if (bodyKey === 'coverUrl' ? (value !== null && typeof value !== 'string') : typeof value !== 'string') {
        return NextResponse.json({ error: `${bodyKey} deve essere una stringa${bodyKey === 'coverUrl' ? ' o null' : ''}` }, { status: 400 })
      }
      dbPatch[dbKey] = value
    }

    // Ordine fra gli scaffali nel banner della Libreria — ex PATCH /api/shelves/[id], vedi
    // supabase/migrations/merge_shelves_into_collections.sql.
    if (Object.prototype.hasOwnProperty.call(body, 'position')) {
      if (typeof body.position !== 'number' || !Number.isFinite(body.position)) {
        return NextResponse.json({ error: 'position deve essere un numero' }, { status: 400 })
      }
      dbPatch.position = body.position
    }

    if (Object.keys(dbPatch).length === 0) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('collections')
      .update({ ...dbPatch, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, title, subtitle, preface, cover_url, position')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      id: data.id, title: data.title, subtitle: data.subtitle, preface: data.preface,
      coverUrl: (data.cover_url as string) ?? null, position: data.position as number,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// DELETE /api/collections/[id] → elimina la Raccolta/scaffale, solo se vuoto — ex DELETE
// /api/shelves/[id] (supabase/migrations/merge_shelves_into_collections.sql): un Diario sta
// sempre su uno scaffale (UNIQUE(diary_id) su collection_diaries, nessun fallback), quindi non
// c'è un "Diario di default" su cui farlo ricadere come per DELETE /api/diaries/[id] — l'utente
// deve prima spostare via i Diari contenuti. Nessuna pulizia di Storage: la copertina della
// raccolta non è ancora caricabile da nessuna UI in questa fase (Fase 3c, solo API) — quando lo
// sarà, questa route andrà estesa come app/api/diaries/[id] fa per la propria.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { count: diariCount, error: diariCountErr } = await supabase
      .from('collection_diaries')
      .select('diary_id', { count: 'exact', head: true })
      .eq('collection_id', params.id)
      .eq('user_id', user.id)
    if (diariCountErr) throw diariCountErr
    if ((diariCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Questo scaffale contiene ancora dei Diari — spostali prima di eliminarlo.' },
        { status: 400 },
      )
    }

    const { error, count } = await supabase
      .from('collections')
      .delete({ count: 'exact' })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error
    if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
