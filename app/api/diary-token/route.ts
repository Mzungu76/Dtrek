import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/diary-token → diary_pdf_url + diary_token for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('diary_pdf_url, diary_token')
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ diary_pdf_url: null, diary_token: null })
    return NextResponse.json({
      diary_pdf_url: (data.diary_pdf_url as string) ?? null,
      diary_token:   (data.diary_token as string)   ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diary-token { diaryPdfUrl } → save diary public PDF URL, generate diary_token if needed
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { diaryPdfUrl } = (await req.json()) as { diaryPdfUrl?: string | null }

    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id, diary_token')
      .eq('user_id', user.id)
      .single()

    // Keep existing diary_token or generate a new UUID
    const token = (existing?.diary_token as string | null) ?? crypto.randomUUID()

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update({ diary_pdf_url: diaryPdfUrl ?? null, diary_token: token })
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, diary_pdf_url: diaryPdfUrl ?? null, diary_token: token })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, diary_pdf_url: diaryPdfUrl ?? null, diary_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/diary-token → revoke the diary public PDF link (keep diary_token for future use)
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('user_settings')
      .update({ diary_pdf_url: null })
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
