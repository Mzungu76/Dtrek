import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const GENERIC_ERROR = 'Errore durante la gestione della condivisione posizione'
const SHARE_WINDOW_MS = 12 * 60 * 60 * 1000 // 12h — vedi supabase/migrations/add_navigation_live_share.sql

// ── GET /api/navigation/share?sessionId=X → token/scadenza correnti, se esistono ──
export async function GET(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const { data, error } = await supabase
      .from('hike_navigation_sessions')
      .select('share_token,share_token_expires_at')
      .eq('id', sessionId).eq('user_id', user.id).single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      token: (data.share_token as string) ?? null,
      expiresAt: (data.share_token_expires_at as string) ?? null,
    })
  } catch (e) {
    console.error('[api/navigation/share] GET failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

// ── POST /api/navigation/share { sessionId } → crea/riusa il token, rinnova sempre la scadenza ──
export async function POST(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { sessionId } = (await req.json()) as { sessionId?: string }
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    // Solo una sessione attiva dell'utente può essere condivisa — niente senso condividere
    // una navigazione già conclusa o di qualcun altro.
    const { data: existing, error: fetchErr } = await supabase
      .from('hike_navigation_sessions')
      .select('share_token,status')
      .eq('id', sessionId).eq('user_id', user.id).single()
    if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.status !== 'active') {
      return NextResponse.json({ error: 'La sessione non è attiva' }, { status: 409 })
    }

    const token = (existing.share_token as string) ?? crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SHARE_WINDOW_MS).toISOString()

    const { error: updateErr } = await supabase
      .from('hike_navigation_sessions')
      .update({ share_token: token, share_enabled_at: new Date().toISOString(), share_token_expires_at: expiresAt })
      .eq('id', sessionId).eq('user_id', user.id)
    if (updateErr) throw updateErr

    return NextResponse.json({ token, expiresAt })
  } catch (e) {
    console.error('[api/navigation/share] POST failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

// ── DELETE /api/navigation/share?sessionId=X → revoca immediata ──
export async function DELETE(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const sessionId = req.nextUrl.searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const { error } = await supabase
      .from('hike_navigation_sessions')
      .update({ share_token: null, share_enabled_at: null, share_token_expires_at: null })
      .eq('id', sessionId).eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/share] DELETE failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
