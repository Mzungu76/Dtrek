export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const key = process.env.HIKING_PROJECT_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'HIKING_PROJECT_API_KEY non configurata', trails: [] },
      { status: 503 },
    )
  }

  const { searchParams } = req.nextUrl
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const maxKm = parseFloat(searchParams.get('maxDistance') ?? '20')

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat/lon required' }, { status: 400 })
  }

  const url = new URL('https://www.hikingproject.com/data/get-trails')
  url.searchParams.set('lat', lat)
  url.searchParams.set('lon', lon)
  url.searchParams.set('maxDistance', String(Math.round(maxKm * 0.621371)))  // km → miles
  url.searchParams.set('maxResults', '40')
  url.searchParams.set('key', key)

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e), trails: [] }, { status: 502 })
  }
}
