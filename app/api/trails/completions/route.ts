// Fase 4 di docs/navigator-orizzonti-roadmap.md — community layer leggero. Nessuna VIEW
// pubblica su trail_completions (vedi commento nella migrazione): la lettura pubblica qui sotto
// aggrega conteggi e ri-filtra le note col client service-role, direttamente nella route — non
// tramite un oggetto Postgres interrogabile via PostgREST, che esporrebbe righe individuali
// (identità/comportamento di un utente specifico) invece del solo aggregato.
import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'
import { findTrailForPolyline } from '@/lib/trailConditions/matchTrail'
import { filterNoteText, checkNoteRateLimit } from '@/lib/community/moderation'
import { fetchCompletionsSummary } from '@/lib/community/completionsSummary'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// ── POST /api/trails/completions { activityId, note? } → autenticato, owner-scoped ──
export async function POST(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase: userSupabase } = scoped

    const { activityId, note } = (await req.json()) as { activityId?: string; note?: string }
    if (!activityId) return NextResponse.json({ error: 'activityId mancante' }, { status: 400 })

    const { data: activity, error: activityErr } = await userSupabase
      .from('activities')
      .select('route_polyline')
      .eq('id', activityId).eq('user_id', user.id).single()
    if (activityErr || !activity) return NextResponse.json({ error: 'Attività non trovata' }, { status: 404 })

    const polyline = (activity.route_polyline ?? null) as [number, number][] | null
    // findTrailForPolyline legge dal grafo condiviso trails (nessun dato personale coinvolto),
    // best-effort: un fallimento nel match non deve mai bloccare il salvataggio del completamento.
    const osmRelationId = polyline && polyline.length >= 2
      ? await findTrailForPolyline(polyline).catch(() => null)
      : null

    let noteToSave: string | null = null
    const trimmedNote = (note ?? '').trim()
    if (trimmedNote.length > 0) {
      const filter = filterNoteText(trimmedNote)
      if (!filter.ok) return NextResponse.json({ error: filter.reason }, { status: 400 })
      const withinLimit = await checkNoteRateLimit(user.id)
      if (!withinLimit) {
        return NextResponse.json({ error: 'Hai raggiunto il limite di segnalazioni per oggi' }, { status: 429 })
      }
      noteToSave = trimmedNote
    }

    const { error: insertErr } = await userSupabase.from('trail_completions').insert({
      user_id: user.id,
      activity_id: activityId,
      osm_relation_id: osmRelationId,
      completed_at: new Date().toISOString(),
      note: noteToSave,
    })
    if (insertErr) throw insertErr

    return NextResponse.json({ ok: true, osmRelationId })
  } catch (e) {
    console.error('[api/trails/completions] POST failed:', e)
    return NextResponse.json({ error: 'Errore durante il salvataggio' }, { status: 500 })
  }
}

// ── GET /api/trails/completions?osm_relation_id=N → pubblico, solo aggregati ──
export async function GET(req: NextRequest) {
  try {
    const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
    if (!osmIdParam || !/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id mancante o non valido' }, { status: 400 })
    }
    const osmRelationId = Number(osmIdParam)
    const summary = await fetchCompletionsSummary(osmRelationId)
    return NextResponse.json(summary)
  } catch (e) {
    console.error('[api/trails/completions] GET failed:', e)
    return NextResponse.json({ error: 'Errore nel recupero dei dati' }, { status: 500 })
  }
}
