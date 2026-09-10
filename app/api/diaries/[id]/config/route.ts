import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeDiaryConfig, type DiaryConfig } from '@/lib/diaryConfig'

export const dynamic = 'force-dynamic'

// Equivalente per-Diario di app/api/diary-config/route.ts (che resta invariato, dietro il vecchio
// /diario — vedi docs/diario-fulcro-piano.md Fase 4). Titolo/sottotitolo/autore/copertina/footer
// vivono come colonne proprie di `diaries` (idonee a un indice/anteprima senza deserializzare il
// JSON); il resto della configurazione (toggle, esclusioni, foto scelte…) resta nella stessa forma
// DiaryConfig, dentro `diaries.config` — una riga per Diario invece che una per utente.

// GET /api/diaries/[id]/config
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('diaries')
      .select('title, subtitle, author, cover_url, footer_text, config')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const config = normalizeDiaryConfig({
      ...(data.config as object),
      title:      data.title,
      subtitle:   data.subtitle,
      author:     data.author,
      coverUrl:   data.cover_url,
      footerText: data.footer_text,
    })
    return NextResponse.json(config)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diaries/[id]/config { ...DiaryConfig } → sostituisce l'intera configurazione, stesso
// contratto "corpo sempre completo" di /api/diary-config.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const config: DiaryConfig = normalizeDiaryConfig(body)
    const { title, subtitle, author, coverUrl, footerText, ...rest } = config

    const { error } = await supabase
      .from('diaries')
      .update({
        title, subtitle, author,
        cover_url:   coverUrl,
        footer_text: footerText,
        config:      rest,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json(config)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
