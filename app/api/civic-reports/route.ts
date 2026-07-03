// Sentinella civica: reporting endpoint for user-submitted photo+GPS reports (unusual
// morphological patterns, fallen trees, landslides...). A reporting flow, not automatic
// detection — mirrors app/api/activity-photos/route.ts's POST-metadata-for-already-
// uploaded-blob shape.
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// ── POST /api/civic-reports → save metadata for an already-uploaded report photo ─
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      id: string
      plannedHikeId?: string
      url: string
      storagePath: string
      note?: string
      lat: number
      lon: number
    }
    if (!body.id || !body.url || !body.storagePath || body.lat == null || body.lon == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await supabase
      .from('civic_reports')
      .insert({
        id:              body.id,
        user_id:         user.id,
        planned_hike_id: body.plannedHikeId ?? null,
        url:             body.url,
        storage_path:    body.storagePath,
        note:            body.note ?? '',
        lat:             body.lat,
        lon:             body.lon,
      })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/civic-reports:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── GET /api/civic-reports → the current user's own reports ──────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('civic_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('GET /api/civic-reports:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
