import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeRaccoltaConfig, type RaccoltaConfig } from '@/lib/raccolteConfig'

export const dynamic = 'force-dynamic'

// Equivalente per-Raccolta di /api/diaries/[id]/config, con una differenza di fondo: qui `null` è
// uno stato valido e distinto da "impostazioni di default" — vedi lib/raccolteConfig.ts. GET
// restituisce quindi `{ publicSections: null }` finché l'utente non ha mai toccato un interruttore
// a livello di Raccolta, non un oggetto già valorizzato.

// GET /api/collections/[id]/config
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('collections')
      .select('config')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const config = normalizeRaccoltaConfig(data.config)
    return NextResponse.json({ publicSections: config?.publicSections ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/collections/[id]/config { publicSections: Partial<DiaryPublicSections> | null }
// `publicSections: null` esplicito → rimuove le impostazioni della Raccolta (ogni Diario membro
// torna autonomo). Un oggetto (anche parziale) → lo fonde su quello già presente, o sui default se
// finora la Raccolta non ne aveva uno — stesso "corpo sempre completo salvato, patch parziale in
// ingresso" di /api/diaries/[id]/config.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { publicSections?: unknown }
    if (!Object.prototype.hasOwnProperty.call(body, 'publicSections')) {
      return NextResponse.json({ error: 'publicSections mancante' }, { status: 400 })
    }

    let newConfig: RaccoltaConfig | null
    if (body.publicSections === null) {
      newConfig = null
    } else {
      const { data: existing, error: fetchErr } = await supabase
        .from('collections')
        .select('config')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const current = normalizeRaccoltaConfig(existing.config)
      newConfig = normalizeRaccoltaConfig({
        publicSections: { ...current?.publicSections, ...(body.publicSections as object) },
      })
    }

    const { error } = await supabase
      .from('collections')
      .update({ config: newConfig, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ publicSections: newConfig?.publicSections ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
