import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// Starts a navigation session, best-effort: the client proceeds with local
// navigation even if this call fails (e.g. offline at the trailhead before
// the offline package model assumed connectivity), it just won't have a
// server-side session id to attach hike_navigation_track/events to later.
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { plannedHikeId, deviceInfo } = await req.json() as { plannedHikeId: string; deviceInfo?: Record<string, unknown> }
    if (!plannedHikeId) return NextResponse.json({ error: 'plannedHikeId required' }, { status: 400 })

    const { data, error } = await supabase
      .from('hike_navigation_sessions')
      .insert({ planned_hike_id: plannedHikeId, user_id: user.id, device_info: deviceInfo ?? null })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ sessionId: data.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
