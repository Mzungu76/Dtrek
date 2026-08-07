// Ultima configurazione dello Studio Video (vedi supabase/migrations/add_video_studio_presets.sql
// e components/RouteMap3D.tsx's saveLastVideoSettings/closeVideoStudio). Una riga per utente,
// dentro user_settings — non una tabella a sé, a differenza dei preset personali con nome
// (app/api/video-presets/route.ts), che sono in numero variabile.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('video_last_settings')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[video-settings] lettura fallita:', error.message)
      return NextResponse.json({ error: 'Lettura non riuscita' }, { status: 502 })
    }

    return NextResponse.json({ lastSettings: data?.video_last_settings ?? null })
  } catch (e) {
    console.error('[video-settings] Errore imprevisto (GET):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

// Chiamato alla chiusura dello studio (best-effort, non deve mai bloccare né disturbare chi sta
// solo chiudendo un pannello): un utente non autenticato o un errore Supabase tornano comunque
// {ok:true}, non un errore che il client dovrebbe gestire.
export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromRequestDetailed(req)
    if (!user) return NextResponse.json({ ok: true })

    const body = await req.json().catch(() => null)
    if (!body?.cfg || typeof body.cfg !== 'object') return NextResponse.json({ ok: true })
    const fps = body.fps === 60 ? 60 : 30

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, video_last_settings: { cfg: body.cfg, fps }, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )

    if (error) console.error('[video-settings] salvataggio fallito:', error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[video-settings] Errore imprevisto (POST):', e)
    return NextResponse.json({ ok: true })
  }
}
