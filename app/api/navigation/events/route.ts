import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const GENERIC_ERROR = 'Errore durante la sincronizzazione della navigazione'

// One flush is at most a handful of minutes of navigation (events every few
// seconds at most, one track fix per GPS poll — see gpsTracker.ts's 1-6s
// adaptive interval), synced every 30s. A batch far beyond that size can
// only be a buggy/malicious client, not a real offline catch-up — cap it
// instead of letting an unbounded array hit the DB in one insert.
const MAX_EVENTS_PER_BATCH = 500
const MAX_TRACK_FIXES_PER_BATCH = 500

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
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { sessionId, events, track } = await req.json() as {
      sessionId: string
      events?: IncomingEvent[]
      track?: IncomingTrackFix[]
    }
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    if ((events?.length ?? 0) > MAX_EVENTS_PER_BATCH || (track?.length ?? 0) > MAX_TRACK_FIXES_PER_BATCH) {
      return NextResponse.json({ error: 'Batch too large' }, { status: 413 })
    }

    // This client carries the caller's own session (anon key) — every query
    // below runs under RLS (nav_sessions_owner / nav_events_owner /
    // nav_track_owner), not the service-role key. The explicit ownership
    // check stays as a fast, clear 404 instead of relying solely on RLS
    // silently returning zero rows.
    const { data: session } = await supabase
      .from('hike_navigation_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (events?.length) {
      const { error } = await supabase.from('hike_navigation_events').insert(
        events.map((e) => ({ session_id: sessionId, type: e.type, payload: e.payload ?? null, created_at: e.createdAt })),
      )
      if (error) throw error
    }
    if (track?.length) {
      const { error } = await supabase.from('hike_navigation_track').insert(
        track.map((f) => ({
          session_id: sessionId, ts: f.ts, lat: f.lat, lon: f.lon,
          altitude_m: f.altitudeM ?? null, speed_ms: f.speedMs ?? null, accuracy_m: f.accuracyM ?? null,
        })),
      )
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/events] POST failed:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
