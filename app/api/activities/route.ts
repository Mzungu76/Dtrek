/**
 * GET  /api/activities  → restituisce ActivityMeta[]
 *
 * Legge activities/index.json dal Blob store.
 * Se non esiste, risponde con array vuoto.
 */

import { NextResponse } from 'next/server'
import { list, head, put, del } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

const INDEX_PATH = 'activities/index.json'

// ── helpers condivisi (usati anche da /api/activity) ─────────────────────────

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    // head() verifica se il blob esiste senza scaricarlo
    const meta = await head(INDEX_PATH)
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) return []
    return (await res.json()) as ActivityMeta[]
  } catch {
    return []
  }
}

export async function writeIndex(index: ActivityMeta[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const index = await readIndex()
  // Ordina per data decrescente
  index.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )
  return NextResponse.json(index)
}
