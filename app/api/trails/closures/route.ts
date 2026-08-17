// DTREK-AUDIT.md P0 #5 — segnalazione/lettura chiusura sentiero. Stessa forma di
// app/api/trails/completions/route.ts (POST autenticato/owner-scoped, GET pubblico solo
// aggregato) — vedi lib/community/closureSummary.ts per la logica di quorum.
import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'
import { findTrailForPolyline } from '@/lib/trailConditions/matchTrail'
import { filterNoteText, checkNoteRateLimit } from '@/lib/community/moderation'
import { fetchClosureSummary } from '@/lib/community/closureSummary'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const MAX_CLOSURE_REPORTS_PER_DAY = 5

// ── POST /api/trails/closures { osmRelationId?, routePolyline?, status, reason? } → autenticato, owner-scoped ──
export async function POST(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase: userSupabase } = scoped

    const body = (await req.json()) as {
      osmRelationId?: number
      routePolyline?: [number, number][]
      status?: 'closed' | 'reopened'
      reason?: string
    }
    if (body.status !== 'closed' && body.status !== 'reopened') {
      return NextResponse.json({ error: 'status deve essere "closed" o "reopened"' }, { status: 400 })
    }

    // Stesso dual-mode già usato da /api/trails/conditions: un osmRelationId già noto al chiamante
    // (es. già risolto da una precedente GET /api/trails/conditions) evita un secondo match.
    let osmRelationId: number | null = body.osmRelationId ?? null
    if (osmRelationId == null && body.routePolyline && body.routePolyline.length >= 2) {
      // findTrailForPolyline legge dal grafo condiviso trails (nessun dato personale coinvolto),
      // best-effort: un fallimento nel match non deve mai bloccare il salvataggio della segnalazione.
      osmRelationId = await findTrailForPolyline(body.routePolyline).catch(() => null)
    }

    let reasonToSave: string | null = null
    const trimmedReason = (body.reason ?? '').trim()
    if (trimmedReason.length > 0) {
      const filter = filterNoteText(trimmedReason)
      if (!filter.ok) return NextResponse.json({ error: filter.reason }, { status: 400 })
      reasonToSave = trimmedReason
    }

    // Ogni segnalazione conta per la quota, con o senza motivo — previene comunque lo spam di
    // report vuoti (utile solo lo status).
    const withinLimit = await checkNoteRateLimit(user.id, MAX_CLOSURE_REPORTS_PER_DAY, 'closures')
    if (!withinLimit) {
      return NextResponse.json({ error: 'Hai raggiunto il limite di segnalazioni per oggi' }, { status: 429 })
    }

    const { error: insertErr } = await userSupabase.from('trail_closure_reports').insert({
      user_id: user.id,
      osm_relation_id: osmRelationId,
      status: body.status,
      reason: reasonToSave,
    })
    if (insertErr) throw insertErr

    return NextResponse.json({ ok: true, osmRelationId })
  } catch (e) {
    console.error('[api/trails/closures] POST failed:', e)
    return NextResponse.json({ error: 'Errore durante il salvataggio' }, { status: 500 })
  }
}

// ── GET /api/trails/closures?osm_relation_id=N → pubblico, solo aggregato con quorum ──
export async function GET(req: NextRequest) {
  try {
    const osmIdParam = req.nextUrl.searchParams.get('osm_relation_id')
    if (!osmIdParam || !/^\d+$/.test(osmIdParam)) {
      return NextResponse.json({ error: 'osm_relation_id mancante o non valido' }, { status: 400 })
    }
    const osmRelationId = Number(osmIdParam)
    const summary = await fetchClosureSummary(osmRelationId)
    return NextResponse.json(summary)
  } catch (e) {
    console.error('[api/trails/closures] GET failed:', e)
    return NextResponse.json({ error: 'Errore nel recupero dei dati' }, { status: 500 })
  }
}
