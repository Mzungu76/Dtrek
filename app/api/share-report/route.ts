import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { hasActiveProfile, PROFILE_REQUIRED_ERROR } from '@/lib/requireActiveProfile'

export const dynamic = 'force-dynamic'

// GET /api/share-report?activityId=X → share_pdf_url + share_token for a report
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const activityId = req.nextUrl.searchParams.get('activityId')
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { data, error } = await supabase
      .from('hike_reports')
      .select('share_pdf_url, share_token')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ share_pdf_url: null, share_token: null })

    let token = (data.share_token as string | null) ?? null
    // DTREK-AUDIT.md P2 #32 — link opaco per token, non per activityId in chiaro.
    // Backfill: report già pubblicati prima di questa fix non hanno ancora un token.
    if (data.share_pdf_url && !token) {
      token = crypto.randomUUID()
      const { error: backfillError } = await supabase
        .from('hike_reports')
        .update({ share_token: token })
        .eq('activity_id', activityId)
        .eq('user_id', user.id)
      if (backfillError) throw backfillError
    }
    return NextResponse.json({ share_pdf_url: (data.share_pdf_url as string) ?? null, share_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/share-report { activityId, sharePdfUrl? } → pubblica la pagina del Reportage
// (garantisce un token, stesso contratto di PATCH /api/diaries/[id]/token e
// /api/collections/[id]/token) e, se `sharePdfUrl` è presente nel corpo, allega anche un PDF —
// Fase 2 del piano di pubblicazione: il PDF non è più una condizione per pubblicare (prima il
// token si generava SOLO insieme a un PDF), resta un allegato facoltativo in più, come già per
// Diario e Raccolta. `sharePdfUrl` assente nel corpo → la colonna non viene toccata (un mint-only
// non deve azzerare un PDF già allegato); `sharePdfUrl: null` esplicito la rimuove.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as { activityId?: string; sharePdfUrl?: string | null }
    const { activityId } = body
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })
    const hasSharePdfUrl = Object.prototype.hasOwnProperty.call(body, 'sharePdfUrl')

    // DTREK-AUDIT.md P2 #32 — genera (o riusa) un token opaco invece di esporre l'activityId
    // in chiaro nel link pubblico, come già fatto per activities.share_token in /api/share.
    const { data: existing } = await supabase
      .from('hike_reports')
      .select('share_token, share_pdf_url')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .single()

    const alreadyPublished = !!existing?.share_token
    if (!alreadyPublished && !(await hasActiveProfile(user.id))) {
      return NextResponse.json({ error: PROFILE_REQUIRED_ERROR }, { status: 409 })
    }

    const token = (existing?.share_token as string | null) ?? crypto.randomUUID()

    const dbPatch: Record<string, unknown> = { share_token: token }
    if (hasSharePdfUrl) dbPatch.share_pdf_url = body.sharePdfUrl ?? null

    const { error } = await supabase
      .from('hike_reports')
      .update(dbPatch)
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
    if (error) throw error

    const sharePdfUrl = hasSharePdfUrl ? (body.sharePdfUrl ?? null) : ((existing?.share_pdf_url as string) ?? null)
    return NextResponse.json({ ok: true, share_pdf_url: sharePdfUrl, share_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/share-report?activityId=X → revoke the public PDF link
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const activityId = req.nextUrl.searchParams.get('activityId')
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { error } = await supabase
      .from('hike_reports')
      .update({ share_pdf_url: null, share_token: null })
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
