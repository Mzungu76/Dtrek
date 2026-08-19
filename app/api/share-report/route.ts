import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

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

// PATCH /api/share-report { activityId, sharePdfUrl } → save public PDF URL + share_token
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { activityId, sharePdfUrl } = (await req.json()) as { activityId?: string; sharePdfUrl?: string | null }
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    // DTREK-AUDIT.md P2 #32 — genera (o riusa) un token opaco invece di esporre l'activityId
    // in chiaro nel link pubblico, come già fatto per activities.share_token in /api/share.
    const { data: existing } = await supabase
      .from('hike_reports')
      .select('share_token')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .single()

    let token = (existing?.share_token as string | null) ?? null
    if (sharePdfUrl && !token) token = crypto.randomUUID()

    const { error } = await supabase
      .from('hike_reports')
      .update({ share_pdf_url: sharePdfUrl ?? null, share_token: token })
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true, share_pdf_url: sharePdfUrl ?? null, share_token: token })
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
