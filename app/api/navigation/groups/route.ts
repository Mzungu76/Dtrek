// Fase 9 di docs/navigator-orizzonti-roadmap.md — creazione/gestione gruppo, stesso shape di
// app/api/navigation/share/route.ts (Fase 1): crea/rinnova/revoca un token, owner-scoped.
import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const SHARE_WINDOW_MS = 12 * 60 * 60 * 1000 // stessa finestra della Fase 1

// ── GET /api/navigation/groups?plannedHikeId=X → gruppo già creato per questo percorso, se c'è ──
export async function GET(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const plannedHikeId = req.nextUrl.searchParams.get('plannedHikeId')
    if (!plannedHikeId) return NextResponse.json({ error: 'Missing plannedHikeId' }, { status: 400 })

    const { data } = await supabase
      .from('hike_navigation_groups')
      .select('id,share_token,share_token_expires_at,name')
      .eq('planned_hike_id', plannedHikeId).eq('created_by', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    return NextResponse.json({
      groupId: data?.id ?? null,
      token: data?.share_token ?? null,
      expiresAt: data?.share_token_expires_at ?? null,
    })
  } catch (e) {
    console.error('[api/navigation/groups] GET failed:', e)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}

// ── POST /api/navigation/groups { plannedHikeId, name? } → crea (o riusa) il gruppo, rinnova sempre la scadenza ──
export async function POST(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { plannedHikeId, name } = (await req.json()) as { plannedHikeId?: string; name?: string }
    if (!plannedHikeId) return NextResponse.json({ error: 'Missing plannedHikeId' }, { status: 400 })

    const expiresAt = new Date(Date.now() + SHARE_WINDOW_MS).toISOString()

    const { data: existing } = await supabase
      .from('hike_navigation_groups')
      .select('id,share_token')
      .eq('planned_hike_id', plannedHikeId).eq('created_by', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('hike_navigation_groups')
        .update({ share_token_expires_at: expiresAt })
        .eq('id', existing.id).eq('created_by', user.id)
      if (error) throw error
      return NextResponse.json({ groupId: existing.id, token: existing.share_token, expiresAt })
    }

    const { data: created, error } = await supabase
      .from('hike_navigation_groups')
      .insert({ created_by: user.id, planned_hike_id: plannedHikeId, name: name ?? null, share_token_expires_at: expiresAt })
      .select('id,share_token').single()
    if (error) throw error

    return NextResponse.json({ groupId: created.id, token: created.share_token, expiresAt })
  } catch (e) {
    console.error('[api/navigation/groups] POST failed:', e)
    return NextResponse.json({ error: 'Errore durante la creazione del gruppo' }, { status: 500 })
  }
}

// ── DELETE /api/navigation/groups?groupId=X → chiude il gruppo (revoca immediata per tutti) ──
export async function DELETE(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const groupId = req.nextUrl.searchParams.get('groupId')
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })

    const { error } = await supabase.from('hike_navigation_groups').delete()
      .eq('id', groupId).eq('created_by', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/groups] DELETE failed:', e)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}
