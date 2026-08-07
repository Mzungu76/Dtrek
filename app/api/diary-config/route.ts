import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeDiaryConfig, DEFAULT_DIARY_CONFIG } from '@/lib/diaryConfig'

export const dynamic = 'force-dynamic'

// GET /api/diary-config → la configurazione del diario dell'utente, con i default per ogni campo
// mancante (utente nuovo, o mai personalizzato).
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('diary_config')
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json(DEFAULT_DIARY_CONFIG)
    return NextResponse.json(normalizeDiaryConfig(data.diary_config))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diary-config { ...DiaryConfig } → sostituisce l'intera configurazione.
//
// Il body è sempre la configurazione COMPLETA, non una patch parziale: il client la tiene in stato
// e la rimanda per intero a ogni modifica (con un debounce), così qui non c'è ambiguità su come
// fondere un oggetto annidato parziale (es. un solo campo di reportExtrasByActivity) con quello già
// salvato. `normalizeDiaryConfig` è comunque riapplicata anche qui, in difesa da un client che
// mandi un JSON malformato o con un campo del tipo sbagliato.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const config = normalizeDiaryConfig(body)

    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update({ diary_config: config })
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, diary_config: config })
      if (error) throw error
    }
    return NextResponse.json(config)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
