// Preset personali dello Studio Video, salvati con un nome dall'utente (vedi
// supabase/migrations/add_video_studio_presets.sql e components/RouteMap3D.tsx's
// saveCustomPreset) — a differenza delle ultime impostazioni (app/api/video-settings/route.ts,
// una riga sola per utente), qui sono in numero variabile: serve una tabella a sé.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 50

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { data, error } = await supabase
      .from('video_custom_presets')
      .select('id, label, cfg, fps, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS)

    if (error) {
      console.error('[video-presets] lettura fallita:', error.message)
      return NextResponse.json({ error: 'Lettura preset non riuscita' }, { status: 502 })
    }

    return NextResponse.json({ presets: data ?? [] })
  } catch (e) {
    console.error('[video-presets] Errore imprevisto (GET):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : ''
    if (!label) return NextResponse.json({ error: 'Nome mancante' }, { status: 400 })
    if (!body?.cfg || typeof body.cfg !== 'object') return NextResponse.json({ error: 'Configurazione mancante' }, { status: 400 })
    const fps = body.fps === 60 ? 60 : 30

    const { count } = await supabase
      .from('video_custom_presets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) >= MAX_ROWS) {
      return NextResponse.json({ error: `Puoi salvare al massimo ${MAX_ROWS} preset personali — eliminane uno per farne spazio.` }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('video_custom_presets')
      .insert({ user_id: user.id, label, cfg: body.cfg, fps })
      .select('id, label, cfg, fps, created_at')
      .single()

    if (error) {
      console.error('[video-presets] salvataggio fallito:', error.message)
      return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 502 })
    }

    return NextResponse.json({ preset: data })
  } catch (e) {
    console.error('[video-presets] Errore imprevisto (POST):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
