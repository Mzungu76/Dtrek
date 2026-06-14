import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/share-report?activityId=X → current share token for a report
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const activityId = req.nextUrl.searchParams.get('activityId')
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { data, error } = await supabase
      .from('hike_reports')
      .select('share_token')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ share_token: null })
    return NextResponse.json({ share_token: (data.share_token as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/share-report { activityId } → create (or return existing) share token
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { activityId } = (await req.json()) as { activityId?: string }
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { data: existing } = await supabase
      .from('hike_reports')
      .select('share_token')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .single()
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    let token = existing.share_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      const { error } = await supabase
        .from('hike_reports')
        .update({ share_token: token })
        .eq('activity_id', activityId)
        .eq('user_id', user.id)
      if (error) throw error
    }
    return NextResponse.json({ share_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/share-report?activityId=X → revoke the public link
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const activityId = req.nextUrl.searchParams.get('activityId')
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { error } = await supabase
      .from('hike_reports')
      .update({ share_token: null })
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
