/**
 * GET    /api/activity?id=…   → StoredActivity completo
 * POST   /api/activity        → body: StoredActivity  → salva/sovrascrive
 * PATCH  /api/activity        → body: {id, title?, userNotes?, tags?} → aggiorna meta
 * DELETE /api/activity?id=…   → elimina escursione e rimuove dall'indice
 */

import { NextRequest, NextResponse } from 'next/server'
import { put, head, del } from '@vercel/blob'
import type { StoredActivity, ActivityMeta } from '@/lib/blobStore'
import { readIndex, writeIndex } from '@/app/api/activities/route'

// Converte un ID escursione in un pathname blob sicuro
function idToPath(id: string): string {
  // Sostituisce caratteri non-safe con underscore
  const safe = id.replace(/[^a-zA-Z0-9\-_.]/g, '_')
  return `activities/${safe}.json`
}

async function readActivity(id: string): Promise<StoredActivity | null> {
  try {
    const meta = await head(idToPath(id))
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as StoredActivity
  } catch {
    return null
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  const activity = await readActivity(id)
  if (!activity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(activity)
}

// ── POST (crea / sovrascrive) ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const activity = (await req.json()) as StoredActivity

  // 1. Salva il JSON completo dell'escursione
  await put(idToPath(activity.id), JSON.stringify(activity), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })

  // 2. Aggiorna l'indice
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
  if (existing >= 0) {
    index[existing] = meta
  } else {
    index.unshift(meta)
  }
  await writeIndex(index)

  return NextResponse.json({ ok: true })
}

// ── PATCH (aggiorna solo i metadati editabili) ────────────────────────────────

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id: string
    title?: string
    userNotes?: string
    tags?: string[]
  }
  const { id, ...patch } = body

  // Aggiorna il JSON completo
  const activity = await readActivity(id)
  if (!activity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const updated: StoredActivity = { ...activity, ...patch }
  await put(idToPath(id), JSON.stringify(updated), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })

  // Aggiorna l'indice (solo i campi meta)
  const index = await readIndex()
  const idx = index.findIndex(a => a.id === id)
  if (idx >= 0) {
    index[idx] = { ...index[idx], ...patch }
    await writeIndex(index)
  }

  return NextResponse.json({ ok: true })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Tenta di eliminare il blob (ignora se non esiste)
  try {
    const blobMeta = await head(idToPath(id))
    await del(blobMeta.url)
  } catch {
    // blob non trovato, va bene ugualmente
  }

  // Rimuove dall'indice
  const index = (await readIndex()).filter(a => a.id !== id)
  await writeIndex(index)

  return NextResponse.json({ ok: true })
}
