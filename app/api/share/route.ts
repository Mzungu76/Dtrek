import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// ── GET /api/share?id=X → current share token for an owned activity ───────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data, error } = await supabase
      .from('activities').select('share_token').eq('id', id).eq('user_id', user.id).single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ token: (data.share_token as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST /api/share { id } → create (or return existing) share token ──────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = (await req.json()) as { id?: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Reuse existing token if the activity already has one
    const { data: existing } = await supabase
      .from('activities').select('share_token').eq('id', id).eq('user_id', user.id).single()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let token = existing.share_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      const { error } = await supabase
        .from('activities').update({ share_token: token }).eq('id', id).eq('user_id', user.id)
      if (error) throw error
    }
    return NextResponse.json({ token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE /api/share?id=X → revoke the public link ──────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase
      .from('activities').update({ share_token: null }).eq('id', id).eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
