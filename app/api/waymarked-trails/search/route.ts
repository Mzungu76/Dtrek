export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { WMT_BASE, USER_AGENT, extractResults, normalizeListItem } from '@/lib/waymarkedTrails'

// GET ?q=&page=&limit= — search trails by name.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q     = searchParams.get('q')?.trim()
  const page  = searchParams.get('page') ?? '0'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20') || 20, 50)

  if (!q) return NextResponse.json({ results: [] })

  try {
    const res = await fetch(`${WMT_BASE}/search?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = await res.json()
    const results = extractResults(json)
      .map(normalizeListItem)
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Waymarked Trails non disponibile', results: [] }, { status: 502 })
  }
}
