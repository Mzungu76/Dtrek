import { NextResponse } from 'next/server'
import { readIndex } from '@/lib/blobIndex'

export async function GET() {
  const index = await readIndex()
  index.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )
  return NextResponse.json(index)
}
