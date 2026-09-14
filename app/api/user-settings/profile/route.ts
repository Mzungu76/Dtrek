import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeSlug, validateSlug } from '@/lib/profileSlug'

export const dynamic = 'force-dynamic'

// Il sito personale dell'utente (/u/[slug]) — route a sé invece di infilarla nel monolite di
// app/api/user-settings/route.ts, per lo stesso motivo già documentato per /api/user-settings/
// privacy: quel file esiste per il caso "colonna non ancora migrata" (ritenta togliendo i campi
// mancanti), qui l'errore atteso è diverso e non deve essere confuso con quello — uno slug già
// preso da un altro utente (violazione UNIQUE, codice Postgres 23505) è un errore normale e
// previsto lato utente, non un problema di schema.

// GET /api/user-settings/profile
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('profile_slug, profile_enabled')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({
      slug: (data?.profile_slug as string | null) ?? null,
      enabled: (data?.profile_enabled as boolean | null) ?? false,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// PATCH /api/user-settings/profile { slug?: string, enabled?: boolean } — un campo alla volta.
// `enabled: true` senza uno slug già scelto (né passato in questa stessa chiamata) è rifiutato:
// non ha senso un sito raggiungibile da nessun indirizzo.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { slug?: unknown; enabled?: unknown }
    const patch: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
      if (typeof body.slug !== 'string') {
        return NextResponse.json({ error: 'slug deve essere una stringa' }, { status: 400 })
      }
      const slug = normalizeSlug(body.slug)
      const err = validateSlug(slug)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      patch.profile_slug = slug
    }

    if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled deve essere un booleano' }, { status: 400 })
      }
      if (body.enabled && !patch.profile_slug) {
        const { data: existing } = await supabase
          .from('user_settings').select('profile_slug').eq('user_id', user.id).maybeSingle()
        if (!existing?.profile_slug) {
          return NextResponse.json({ error: 'Scegli prima un indirizzo per il tuo sito' }, { status: 400 })
        }
      }
      patch.profile_enabled = body.enabled
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) {
      // 23505 = violazione UNIQUE — lo slug (case-insensitive) è già preso da un altro utente.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Questo indirizzo è già in uso — scegline un altro' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
