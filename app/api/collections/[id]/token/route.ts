import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { hasActiveProfile, PROFILE_REQUIRED_ERROR } from '@/lib/requireActiveProfile'

export const dynamic = 'force-dynamic'

// Equivalente per-Raccolta di app/api/diaries/[id]/token/route.ts — stesso contratto, senza PDF:
// una raccolta non se ne esporta uno (docs/raccolte-pubblicazione-piano.md — diciotto Reportage
// non si esportano da un telefono, è già successo con i Diari, vedi il commento in cima a
// lib/sharePublicDiary.ts). È solo web.

// GET /api/collections/[id]/token
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('collections')
      .select('share_token')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ shareToken: (data.share_token as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/collections/[id]/token → assicura uno share_token per questa Raccolta (la crea se
// assente), idempotente se già pubblicata.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: existing, error: fetchErr } = await supabase
      .from('collections')
      .select('share_token')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const alreadyPublished = !!existing.share_token
    if (!alreadyPublished && !(await hasActiveProfile(user.id))) {
      return NextResponse.json({ error: PROFILE_REQUIRED_ERROR }, { status: 409 })
    }

    const token = (existing.share_token as string | null) ?? crypto.randomUUID()

    const { error } = await supabase
      .from('collections')
      .update({ share_token: token, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true, shareToken: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/collections/[id]/token → revoca il link pubblico corrente: azzera share_token
// (stesso comportamento di DELETE /api/diaries/[id]/token, stesso motivo — deve essere `null`, non
// ruotato: la policy RLS pubblica e fetchPublicProfile filtrano su `share_token IS NOT NULL`, un
// token ruotato resta non-null e la Raccolta continua a comparire sul sito). Ripubblicare (PATCH)
// ne genera uno nuovo da zero.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('collections')
      .update({ share_token: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
