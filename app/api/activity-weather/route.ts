import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchWeatherAtHike } from '@/lib/openmeteo'
import type { TrackPoint } from '@/lib/tcxParser'

export const dynamic = 'force-dynamic'

// POST /api/activity-weather — fetches and persists historical weather for an
// existing activity that was uploaded before weather tracking existed.
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = (await req.json()) as { id?: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: activity, error: fetchErr } = await supabase
      .from('activities')
      .select('id, start_time, track_points, weather_at_hike')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (activity.weather_at_hike) return NextResponse.json(activity.weather_at_hike)

    const pts = (activity.track_points as TrackPoint[] | null) ?? []
    const gpsPt = pts.find(p => p.lat !== undefined && p.lon !== undefined)
    if (!gpsPt || !activity.start_time) {
      return NextResponse.json({ error: 'Nessun punto GPS disponibile' }, { status: 422 })
    }

    const date = (activity.start_time as string).slice(0, 10)
    const weather = await fetchWeatherAtHike(gpsPt.lat!, gpsPt.lon!, date)
    if (!weather) return NextResponse.json({ error: 'Dati meteo non disponibili' }, { status: 502 })

    const { error: updateErr } = await supabase
      .from('activities')
      .update({ weather_at_hike: weather })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateErr) throw updateErr
    return NextResponse.json(weather)
  } catch (e) {
    console.error('POST /api/activity-weather:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
