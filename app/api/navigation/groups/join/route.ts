// Fase 9 di docs/navigator-orizzonti-roadmap.md — unirsi/lasciare un gruppo. Autenticato (chi
// pubblica la propria posizione deve avere un account, come per la condivisione individuale
// della Fase 1), ma usa il client SERVICE-ROLE per risolvere il token: un joiner non è il
// creatore del gruppo, quindi la RLS owner-only su hike_navigation_groups non gli permette di
// leggere quella riga con il proprio client scoped. La route stessa — non la RLS — applica il
// vincolo "solo la propria sessione, mai quella di qualcun altro" (vedi sotto).
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, getUserScopedClient } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── POST /api/navigation/groups/join { token, sessionId, displayName? } ──
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token, sessionId, displayName } = (await req.json()) as { token?: string; sessionId?: string; displayName?: string }
    if (!token || !UUID_RE.test(token)) return NextResponse.json({ error: 'Link non valido' }, { status: 400 })
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const { data: group, error: groupErr } = await supabase
      .from('hike_navigation_groups')
      .select('id,share_token_expires_at')
      .eq('share_token', token).single()
    if (groupErr || !group) return NextResponse.json({ error: 'Gruppo non trovato' }, { status: 404 })
    if (new Date(group.share_token_expires_at as string) <= new Date()) {
      return NextResponse.json({ error: 'Il link del gruppo è scaduto' }, { status: 410 })
    }

    // La sessione deve appartenere a chi sta chiamando — verificato qui, non delegato alla
    // sola RLS, perché l'insert sotto passa dal client service-role.
    const { data: session, error: sessionErr } = await supabase
      .from('hike_navigation_sessions')
      .select('id').eq('id', sessionId).eq('user_id', user.id).single()
    if (sessionErr || !session) return NextResponse.json({ error: 'Sessione non trovata' }, { status: 404 })

    const { error: insertErr } = await supabase
      .from('hike_navigation_group_members')
      .upsert(
        { group_id: group.id, session_id: sessionId, user_id: user.id, display_name: displayName ?? null },
        { onConflict: 'group_id,session_id' },
      )
    if (insertErr) throw insertErr

    return NextResponse.json({ ok: true, groupId: group.id })
  } catch (e) {
    console.error('[api/navigation/groups/join] POST failed:', e)
    return NextResponse.json({ error: 'Errore durante l\'iscrizione al gruppo' }, { status: 500 })
  }
}

// ── DELETE /api/navigation/groups/join?sessionId=X → esce dal gruppo (owner-scoped, no service-role) ──
export async function DELETE(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase: userSupabase } = scoped

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const { error } = await userSupabase.from('hike_navigation_group_members')
      .delete().eq('session_id', sessionId).eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/groups/join] DELETE failed:', e)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}
