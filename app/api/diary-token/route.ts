import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/diary-token → diary_pdf_url for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('diary_pdf_url')
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ diary_pdf_url: null })
    return NextResponse.json({ diary_pdf_url: (data.diary_pdf_url as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diary-token { diaryPdfUrl } → save diary public PDF URL
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { diaryPdfUrl } = (await req.json()) as { diaryPdfUrl?: string | null }

    // Upsert user_settings row
    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update({ diary_pdf_url: diaryPdfUrl ?? null })
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, diary_pdf_url: diaryPdfUrl ?? null })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, diary_pdf_url: diaryPdfUrl ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/diary-token → revoke the diary public PDF link
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
