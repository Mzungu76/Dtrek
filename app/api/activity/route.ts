import { NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import type { StoredActivity, ActivityMeta } from '@/lib/blobStore'
import { readIndex, writeIndex, blobExists } from '@/lib/blobIndex'

function idToPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9\-_.]/g, '_')
  return `activities/${safe}.json`
}

async function readActivity(id: string): Promise<StoredActivity | null> {
  try {
    const url = await blobExists(idToPath(id))
    if (!url) return null
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as StoredActivity
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const activity = await readActivity(id)
    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(activity)
  } catch (e) {
    console.error('GET /api/activity error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const activity = (await req.json()) as StoredActivity

    await put(idToPath(activity.id), JSON.stringify(activity), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    const index = await readIndex()
    const meta: ActivityMeta = {
      id: activity.id,
      title: activity.title ?? activity.notes ?? 'Escursione',
      startTime: activity.startTime,
      distanceMeters: activity.distanceMeters,
      totalTimeSeconds: activity.totalTimeSeconds,
      calories: activity.calories,
      avgHeartRate: activity.avgHeartRate,
      maxHeartRate: activity.maxHeartRate,
      elevationGain: activity.elevationGain,
      elevationLoss: activity.elevationLoss,
      altitudeMax: activity.altitudeMax,
      avgSpeedMs: activity.avgSpeedMs,
      maxSpeedMs: activity.maxSpeedMs,
      tags: activity.tags,
      userNotes: activity.userNotes,
      fileName: activity.fileName,
    }

    const existing = index.findIndex(a => a.id === activity.id)
    if (existing >= 0) index[existing] = meta
    else index.unshift(meta)
    await writeIndex(index)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/activity error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string; title?: string; userNotes?: string; tags?: string[]
    }
    const { id, ...patch } = body

    const activity = await readActivity(id)
    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated: StoredActivity = { ...activity, ...patch }
    await put(idToPath(id), JSON.stringify(updated), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    const index = await readIndex()
    const idx = index.findIndex(a => a.id === id)
    if (idx >= 0) {
      index[idx] = { ...index[idx], ...patch }
      await writeIndex(index)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/activity error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const url = await blobExists(idToPath(id))
    if (url) await del(url)

    const index = (await readIndex()).filter(a => a.id !== id)
    await writeIndex(index)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/activity error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
