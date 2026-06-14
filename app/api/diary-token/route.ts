import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/diary-token → current diary token for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('diary_token')
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ diary_token: null })
    return NextResponse.json({ diary_token: (data.diary_token as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/diary-token → create (or return existing) diary token
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: existing } = await supabase
      .from('user_settings')
      .select('diary_token')
      .eq('user_id', user.id)
      .single()

    let token = existing?.diary_token as string | null | undefined
    if (!token) {
      token = crypto.randomUUID()
      if (existing) {
        const { error } = await supabase
          .from('user_settings')
          .update({ diary_token: token })
          .eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id, diary_token: token })
        if (error) throw error
      }
    }
    return NextResponse.json({ diary_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/diary-token → revoke the diary public link
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('user_settings')
      .update({ diary_token: null })
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
