import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const BUCKET = 'dtrek-photos'

function rowToPhoto(row: Record<string, unknown>) {
  return {
    id:         row.id as string,
    activityId: row.activity_id as string,
    url:        row.url as string,
    storagePath: row.storage_path as string,
    caption:    (row.caption as string) ?? '',
    progress:   (row.progress as number) ?? 0.5,
    hasExifGps: (row.has_exif_gps as boolean) ?? false,
    lat:        row.lat as number | undefined,
    lon:        row.lon as number | undefined,
  }
}

// ── GET /api/activity-photos?activityId=X ───────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const activityId = req.nextUrl.searchParams.get('activityId')
    if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

    const { data, error } = await supabase
      .from('activity_photos')
      .select('*')
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .order('progress', { ascending: true })

    if (error) throw error
    return NextResponse.json((data ?? []).map(rowToPhoto))
  } catch (e) {
    console.error('GET /api/activity-photos:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST /api/activity-photos → upsert metadata for an already-uploaded photo ─
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      id: string
      activityId: string
      url: string
      storagePath: string
      caption?: string
      progress?: number
      hasExifGps?: boolean
      lat?: number
      lon?: number
    }
    if (!body.id || !body.activityId || !body.url || !body.storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: existingPhoto } = await supabase
      .from('activity_photos')
      .select('user_id')
      .eq('id', body.id)
      .maybeSingle()
    if (existingPhoto && existingPhoto.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase
      .from('activity_photos')
      .upsert({
        id:           body.id,
        user_id:      user.id,
        activity_id:  body.activityId,
        url:          body.url,
        storage_path: body.storagePath,
        caption:      body.caption ?? '',
        progress:     body.progress ?? 0.5,
        has_exif_gps: body.hasExifGps ?? false,
        lat:          body.lat ?? null,
        lon:          body.lon ?? null,
      }, { onConflict: 'id' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/activity-photos:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PATCH /api/activity-photos → update caption/progress/lat/lon ─────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      id: string
      caption?: string
      progress?: number
      lat?: number
      lon?: number
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const dbPatch: Record<string, unknown> = {}
    if (body.caption  !== undefined) dbPatch.caption  = body.caption
    if (body.progress !== undefined) dbPatch.progress = body.progress
    if (body.lat      !== undefined) dbPatch.lat      = body.lat
    if (body.lon      !== undefined) dbPatch.lon      = body.lon

    const { error } = await supabase
      .from('activity_photos')
      .update(dbPatch)
      .eq('id', body.id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/activity-photos:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE /api/activity-photos?id=X → remove row + Storage object ───────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: row } = await supabase
      .from('activity_photos')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    const { error } = await supabase
      .from('activity_photos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    if (row?.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path as string])
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/activity-photos:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
