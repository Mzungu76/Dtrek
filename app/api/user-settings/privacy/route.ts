import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// Le due preferenze di privacy della pubblicazione (docs/raccolte-pubblicazione-piano.md, Fase
// 3f) — globali per l'utente, non per Diario o Raccolta, quindi una route a sé invece di infilarle
// nel monolite di app/api/user-settings/route.ts (che già seleziona ~40 colonne con un fallback
// per quelle non ancora migrate: due booleani in più lì dentro sarebbero un rischio di regressione
// sproporzionato rispetto al beneficio di non aprire un file nuovo).

export interface PublishPrivacyPrefs {
  hideHomeStarts: boolean
  hideExactDates: boolean
}

// GET /api/user-settings/privacy
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('publish_hide_home_starts, publish_hide_exact_dates')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    const prefs: PublishPrivacyPrefs = {
      hideHomeStarts: (data?.publish_hide_home_starts as boolean | null) ?? true,
      hideExactDates: (data?.publish_hide_exact_dates as boolean | null) ?? false,
    }
    return NextResponse.json(prefs)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// PATCH /api/user-settings/privacy { hideHomeStarts?, hideExactDates? } — un campo alla volta.
// Upsert (non update): un utente che non ha ancora mai toccato user_settings non ha una riga lì,
// e questa è spesso la prima scrittura di privacy che fa.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { hideHomeStarts?: unknown; hideExactDates?: unknown }
    const patch: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, 'hideHomeStarts')) {
      if (typeof body.hideHomeStarts !== 'boolean') {
        return NextResponse.json({ error: 'hideHomeStarts deve essere un booleano' }, { status: 400 })
      }
      patch.publish_hide_home_starts = body.hideHomeStarts
    }
    if (Object.prototype.hasOwnProperty.call(body, 'hideExactDates')) {
      if (typeof body.hideExactDates !== 'boolean') {
        return NextResponse.json({ error: 'hideExactDates deve essere un booleano' }, { status: 400 })
      }
      patch.publish_hide_exact_dates = body.hideExactDates
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
