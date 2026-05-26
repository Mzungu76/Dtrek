import { NextResponse } from 'next/server'
import { readIndex } from '@/lib/blobIndex'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const index = await readIndex()
    index.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
    return NextResponse.json(index)
  } catch (e) {
    console.error('GET /api/activities:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
