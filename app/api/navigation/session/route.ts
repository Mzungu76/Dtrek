import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const GENERIC_ERROR = 'Errore durante il salvataggio della sessione di navigazione'

// Starts a navigation session, best-effort: the client proceeds with local
// navigation even if this call fails (e.g. offline at the trailhead before
// the offline package model assumed connectivity), it just won't have a
// server-side session id to attach hike_navigation_track/events to later.
export async function POST(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { plannedHikeId, deviceInfo } = await req.json() as { plannedHikeId: string; deviceInfo?: Record<string, unknown> }
    if (!plannedHikeId) return NextResponse.json({ error: 'plannedHikeId required' }, { status: 400 })

    // This client carries the caller's own session (anon key), not the
    // service-role key — the insert runs under RLS (nav_sessions_owner), so
    // a bug here fails closed instead of silently writing/reading cross-user.
    const { data, error } = await supabase
      .from('hike_navigation_sessions')
      .insert({ planned_hike_id: plannedHikeId, user_id: user.id, device_info: deviceInfo ?? null })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ sessionId: data.id })
  } catch (e) {
    console.error('[api/navigation/session] POST failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { sessionId, status } = await req.json() as { sessionId: string; status: 'active' | 'paused' | 'completed' | 'aborted' }
    if (!sessionId || !status) return NextResponse.json({ error: 'sessionId and status required' }, { status: 400 })

    const { error } = await supabase
      .from('hike_navigation_sessions')
      .update({ status, ...(status !== 'active' && status !== 'paused' ? { ended_at: new Date().toISOString() } : {}) })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/session] PATCH failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
