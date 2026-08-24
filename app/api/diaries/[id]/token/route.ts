import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// Equivalente per-Diario di app/api/diary-token/route.ts (invariato, resta dietro il vecchio
// /diario) — stessa logica, chiave `diaries.id` invece di `user_id`: ogni Diario ha il proprio
// share_token/share_pdf_url, così pubblicarne uno non tocca gli altri.

// GET /api/diaries/[id]/token
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('diaries')
      .select('share_pdf_url, share_token')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      diary_pdf_url: (data.share_pdf_url as string) ?? null,
      diary_token:   (data.share_token as string)   ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diaries/[id]/token { diaryPdfUrl? } → assicura uno share_token per questo Diario, e
// solo se il corpo contiene `diaryPdfUrl` aggiorna anche l'URL del PDF — stessa distinzione di
// /api/diary-token (pubblicare il link non deve azzerare un PDF già allegato).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { diaryPdfUrl?: string | null }
    const touchesPdf = Object.prototype.hasOwnProperty.call(body, 'diaryPdfUrl')

    const { data: existing, error: fetchErr } = await supabase
      .from('diaries')
      .select('share_token, share_pdf_url')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const token = (existing.share_token as string | null) ?? crypto.randomUUID()
    const pdfUrl = touchesPdf
      ? (body.diaryPdfUrl ?? null)
      : ((existing.share_pdf_url as string | null) ?? null)

    const { error } = await supabase
      .from('diaries')
      .update(touchesPdf
        ? { share_pdf_url: pdfUrl, share_token: token, updated_at: new Date().toISOString() }
        : { share_token: token, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true, diary_pdf_url: pdfUrl, diary_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/diaries/[id]/token → revoca il link pubblico di questo Diario: cancella il PDF dallo
// Storage (percorso dedicato, vedi lib/pdfUpload.ts) e ruota lo share_token.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error: storageError } = await supabase.storage
      .from('dtrek-reports')
      .remove([`${user.id}/diaries/${params.id}/diary.pdf`])
    if (storageError) console.warn('[diaries/token] rimozione PDF dallo storage fallita:', storageError.message)

    const { error } = await supabase
      .from('diaries')
      .update({ share_pdf_url: null, share_token: crypto.randomUUID(), updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
