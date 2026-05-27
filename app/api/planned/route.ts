import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import type { PlannedHike, PlannedHikeMeta } from '@/lib/plannedStore'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  readPlannedIndex, writePlannedIndex,
  readPlannedBlobText, deletePlannedBlob,
} from '@/lib/plannedIndex'
import { readIndex } from '@/lib/blobIndex'
import { assessHike } from '@/lib/hikeAssessment'

export const dynamic = 'force-dynamic'

function getToken(): string {
  const token = process.env.blob2dtrek_READ_WRITE_TOKEN
  if (!token) throw new Error('blob2dtrek_READ_WRITE_TOKEN non configurato')
  return token
}

function idToPath(id: string): string {
  return `planned/${id.replace(/[^a-zA-Z0-9\-_.]/g, '_')}.json`
}

function downsamplePolyline(pts: TrackPoint[], maxPts = 60): [number, number][] {
  const valid = pts.filter(p => p.lat !== undefined && p.lon !== undefined)
  if (valid.length === 0) return []
  const count = Math.min(valid.length, maxPts)
  const step = (valid.length - 1) / (count - 1 || 1)
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(Math.round(i * step), valid.length - 1)
    return [
      Math.round(valid[idx].lat! * 1e5) / 1e5,
      Math.round(valid[idx].lon! * 1e5) / 1e5,
    ]
  })
}

function toMeta(hike: PlannedHike): PlannedHikeMeta {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { trackPoints: _tp, ...meta } = hike
  return meta
}

// GET /api/planned          → list (PlannedHikeMeta[])
// GET /api/planned?id=X     → single full PlannedHike
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const text = await readPlannedBlobText(idToPath(id))
      if (!text) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(JSON.parse(text))
    }
    return NextResponse.json(await readPlannedIndex())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/planned → create or overwrite
export async function POST(req: NextRequest) {
  try {
    const hike = (await req.json()) as PlannedHike

    if (!hike.routePolyline && hike.trackPoints) {
      hike.routePolyline = downsamplePolyline(hike.trackPoints)
    }

    // Run rule-based assessment with current activities as context
    const activities = await readIndex()
    hike.assessment = assessHike(
      hike.distanceMeters,
      hike.elevationGain,
      hike.altitudeMax,
      activities,
    )

    await put(idToPath(hike.id), JSON.stringify(hike), {
      access: 'public', token: getToken(), addRandomSuffix: false, contentType: 'application/json',
    })

    const index = await readPlannedIndex()
    const meta  = toMeta(hike)
    const pos   = index.findIndex(h => h.id === hike.id)
    if (pos >= 0) index[pos] = meta; else index.unshift(meta)
    await writePlannedIndex(index)

    return NextResponse.json({ ok: true, assessment: hike.assessment })
  } catch (e) {
    console.error('POST /api/planned:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/planned → update metadata fields
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string; title?: string; userNotes?: string; tags?: string[]; plannedDate?: string
    }
    const { id, ...patch } = body

    const text = await readPlannedBlobText(idToPath(id))
    if (!text) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated: PlannedHike = { ...JSON.parse(text), ...patch }
    await put(idToPath(id), JSON.stringify(updated), {
      access: 'public', token: getToken(), addRandomSuffix: false, contentType: 'application/json',
    })

    const index = await readPlannedIndex()
    const pos   = index.findIndex(h => h.id === id)
    if (pos >= 0) { index[pos] = { ...index[pos], ...patch }; await writePlannedIndex(index) }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/planned?id=X
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await deletePlannedBlob(idToPath(id))
    const index = (await readPlannedIndex()).filter(h => h.id !== id)
    await writePlannedIndex(index)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
