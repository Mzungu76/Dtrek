import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

interface IncomingEvent {
  type: string
  payload?: Record<string, unknown>
  createdAt?: string
}

interface IncomingTrackFix {
  ts: string
  lat: number
  lon: number
  altitudeM?: number | null
  speedMs?: number | null
  accuracyM?: number | null
}

// Batch sync endpoint: the client queues events/track fixes locally while
// offline (see lib/navigation/navigationStore.ts) and flushes them here in
// bulk once connectivity returns — this is append-only analytics/log data,
// never the runtime source of truth, so batching and best-effort delivery
// are acceptable (see plan: hike_navigation_events/track are not
// real-time-critical).
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId, events, track } = await req.json() as {
      sessionId: string
      events?: IncomingEvent[]
      track?: IncomingTrackFix[]
    }
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    // Ownership check — RLS also enforces this, but fail fast with a clear error.
    const { data: session } = await supabase
      .from('hike_navigation_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (events?.length) {
      await supabase.from('hike_navigation_events').insert(
        events.map((e) => ({ session_id: sessionId, type: e.type, payload: e.payload ?? null, created_at: e.createdAt })),
      )
    }
    if (track?.length) {
      await supabase.from('hike_navigation_track').insert(
        track.map((f) => ({
          session_id: sessionId, ts: f.ts, lat: f.lat, lon: f.lon,
          altitude_m: f.altitudeM ?? null, speed_ms: f.speedMs ?? null, accuracy_m: f.accuracyM ?? null,
        })),
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
